const {
  Notification,
  RepairOrder,
  RepairOrderHistory,
  RepairOrderReview,
  sequelize,
  SystemSetting,
  User
} = require('../models');
const { getRepairAnalysis, VALID_CATEGORIES } = require('../services/aiService');
const { saveRepairImage, removeRepairImage } = require('../middleware/repairImageUpload');
const { Op, literal } = require('sequelize');
const { MaintenanceStaff, RepairCatalog } = require('../models');
const { recordAdminAction } = require('../services/adminAudit');

const getExpectedCompletionAt = async (orders) => {
  const activeOrders = orders.filter((order) =>
    ['待处理', '处理中'].includes(order.status));
  if (!activeOrders.length) return;

  const settings = await SystemSetting.findAll({
    where: { key: { [Op.in]: ['sla.pendingHours', 'sla.processingHours'] } },
    attributes: ['key', 'value'],
    raw: true
  });
  const sla = Object.fromEntries(settings.map((item) => [item.key, Number(item.value)]));
  const pendingHours = Number.isFinite(sla['sla.pendingHours']) && sla['sla.pendingHours'] > 0
    ? sla['sla.pendingHours']
    : 24;
  const processingHours = Number.isFinite(sla['sla.processingHours']) && sla['sla.processingHours'] > 0
    ? sla['sla.processingHours']
    : 72;
  const processingIds = activeOrders
    .filter((order) => order.status === '处理中')
    .map((order) => order.id);
  const statusEvents = processingIds.length
    ? await RepairOrderHistory.findAll({
      where: { orderId: { [Op.in]: processingIds }, eventType: 'status', status: '处理中' },
      order: [['createdAt', 'DESC']],
      raw: true
    })
    : [];
  const processingStarted = new Map();
  for (const event of statusEvents) {
    if (!processingStarted.has(String(event.orderId))) {
      processingStarted.set(String(event.orderId), event.createdAt);
    }
  }

  for (const order of activeOrders) {
    const startedAt = order.status === '处理中'
      ? processingStarted.get(String(order.id))
      : null;
    const baseTime = new Date(startedAt || order.createdAt).getTime();
    const durationHours = startedAt ? processingHours : pendingHours + processingHours;
    const expectedCompletionAt = Number.isFinite(baseTime)
      ? new Date(baseTime + durationHours * 60 * 60 * 1000)
      : null;
    if (typeof order.setDataValue === 'function') {
      order.setDataValue('expectedCompletionAt', expectedCompletionAt);
    } else {
      order.expectedCompletionAt = expectedCompletionAt;
    }
  }
};

const STATUS_MAP = {
  pending: '待处理',
  processing: '处理中',
  finished: '已完成'
};

const normalizeStatus = (status) => {
  if (!status) return null;
  const key = String(status).trim().toLowerCase();
  return STATUS_MAP[key] || null;
};

const parsePositiveInteger = (value, defaultValue) => {
  if (value === undefined) return defaultValue;

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const recordOrderEvent = async ({
  order,
  actor,
  eventType,
  status = order.status,
  assignedTo = order.assignedTo,
  remark = null,
  notification,
  transaction
}) => {
  await RepairOrderHistory.create({
    orderId: order.id,
    userId: order.userId,
    actorRole: actor.role,
    actorId: actor.id,
    eventType,
    status,
    assignedTo,
    remark
  }, { transaction });
  if (notification) {
    await Notification.create({
      userId: order.userId,
      orderId: order.id,
      title: notification.title,
      message: notification.message
    }, { transaction });
  }
};

const createRepairOrder = async (req, res) => {
  let uploadedFilename;
  try {
    const {
      title,
      desc,
      location,
      building,
      floor,
      room,
      mapAddress,
      latitude,
      longitude,
      additionalDescription,
      phone,
      imgUrl,
      category
    } = req.body || {};
    const currentUser = req.user;

    if (!currentUser || !currentUser.id) {
      return res.status(401).json({
        code: 401,
        msg: '未登录，无法创建工单',
        data: null
      });
    }
    if (currentUser.role !== 'student') {
      return res.status(403).json({
        code: 403,
        msg: '只有用户可以提交报修工单',
        data: null
      });
    }

    if (!title || !desc || !location) {
      return res.status(400).json({
        code: 400,
        msg: 'title、desc、location为必填项',
        data: null
      });
    }
    if (additionalDescription !== undefined && additionalDescription !== null &&
        typeof additionalDescription !== 'string') {
      return res.status(400).json({ code: 400, msg: '补充说明格式无效', data: null });
    }
    if (typeof additionalDescription === 'string' && additionalDescription.length > 1000) {
      return res.status(400).json({ code: 400, msg: '补充说明不能超过1000个字符', data: null });
    }
    if (phone !== undefined && phone !== null &&
        (typeof phone !== 'string' ||
         phone.trim().length > 20 ||
         (phone.trim() && !/^[0-9+\-\s()]{7,20}$/.test(phone.trim())))) {
      return res.status(400).json({ code: 400, msg: '联系电话格式无效', data: null });
    }
    if (mapAddress !== undefined && mapAddress !== null && typeof mapAddress !== 'string') {
      return res.status(400).json({ code: 400, msg: '地图地址格式无效', data: null });
    }
    const hasLatitude = latitude !== undefined && latitude !== null && latitude !== '';
    const hasLongitude = longitude !== undefined && longitude !== null && longitude !== '';
    if (hasLatitude !== hasLongitude ||
        (hasLatitude && (!Number.isFinite(Number(latitude)) || Number(latitude) < -90 || Number(latitude) > 90)) ||
        (hasLongitude && (!Number.isFinite(Number(longitude)) || Number(longitude) < -180 || Number(longitude) > 180))) {
      return res.status(400).json({ code: 400, msg: '地图坐标无效', data: null });
    }

    const [categories, configuredCategoryCount] = await Promise.all([
      RepairCatalog.findAll({
      where: { type: 'category', active: true },
      attributes: ['value'],
      raw: true
      }),
      RepairCatalog.count({ where: { type: 'category' } })
    ]);
    const allowedCategories = configuredCategoryCount
      ? categories.map((item) => item.value)
      : VALID_CATEGORIES;
    if (category !== undefined && !allowedCategories.includes(category)) {
      return res.status(400).json({
        code: 400,
        msg: `category必须是以下类型之一：${allowedCategories.join('、')}`,
        data: null
      });
    }

    const aiAnalysis = await getRepairAnalysis(desc || title);
    if (req.file) {
      uploadedFilename = await saveRepairImage(req.file);
    }

    const order = await sequelize.transaction(async (transaction) => {
      const createdOrder = await RepairOrder.create({
        userId: currentUser.id,
        title,
        desc,
        location,
        building: building || null,
        floor: floor || null,
        room: room || null,
        mapAddress: typeof mapAddress === 'string' ? mapAddress.trim().slice(0, 255) || null : null,
        latitude: hasLatitude ? Number(latitude) : null,
        longitude: hasLongitude ? Number(longitude) : null,
        additionalDescription: typeof additionalDescription === 'string'
          ? additionalDescription.trim() || null
          : null,
        phone: typeof phone === 'string' ? phone.trim() || null : null,
        imgUrl: uploadedFilename
          ? `${req.protocol}://${req.get('host')}/uploads/${encodeURIComponent(uploadedFilename)}`
          : imgUrl || null,
        aiCategory: category || aiAnalysis.category,
        aiSuggest: aiAnalysis.suggestion,
        status: '待处理',
        adminRemark: null
      }, { transaction });
      await recordOrderEvent({
        order: createdOrder,
        actor: currentUser,
        eventType: 'created',
        remark: '用户提交了报修工单',
        notification: {
          title: '报修已提交',
          message: `工单「${title}」已提交，维修人员会尽快处理。`
        },
        transaction
      });
      return createdOrder;
    });

    return res.status(201).json({
      code: 201,
      msg: '报修工单创建成功',
      data: order
    });
  } catch (error) {
    if (uploadedFilename) {
      try {
        await removeRepairImage(uploadedFilename);
      } catch (cleanupError) {
        console.error('清理未关联的报修图片失败:', cleanupError);
      }
    }
    console.error('创建报修工单失败:', error);
    return res.status(500).json({
      code: 500,
      msg: '创建报修工单失败',
      data: null
    });
  }
};

const getMyOrderList = async (req, res) => {
  try {
    const currentUser = req.user;

    if (!currentUser || !currentUser.id) {
      return res.status(401).json({
        code: 401,
        msg: '未登录，无法查询工单',
        data: null
      });
    }

    const orders = await RepairOrder.findAll({
      where: {
        userId: currentUser.id,
        [Op.or]: [{ deletedAt: null }, { deletedBy: 'admin' }]
      },
      paranoid: false,
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'nickname', 'phone', 'role']
      }],
      order: [['createdAt', 'DESC']]
    });
    await getExpectedCompletionAt(orders);

    return res.status(200).json({
      code: 200,
      msg: '查询成功',
      data: orders
    });
  } catch (error) {
    console.error('查询我的工单失败:', error);
    return res.status(500).json({
      code: 500,
      msg: '查询我的工单失败',
      data: null
    });
  }
};

const cancelMyOrder = async (req, res) => {
  try {
    const currentUser = req.user;
    const { id } = req.params;

    if (!currentUser || !currentUser.id) {
      return res.status(401).json({
        code: 401,
        msg: '未登录，无法撤销工单',
        data: null
      });
    }

    const outcome = await sequelize.transaction(async (transaction) => {
      const [updatedCount] = await RepairOrder.update(
        { status: '已撤销' },
        {
          where: {
            id,
            userId: currentUser.id,
            status: '待处理'
          },
          transaction
        }
      );
      if (updatedCount === 0) {
        const order = await RepairOrder.findOne({
          where: { id, userId: currentUser.id },
          transaction
        });
        return { order, updated: false };
      }

      const order = await RepairOrder.findOne({
        where: { id, userId: currentUser.id },
        transaction
      });
      if (order) {
        await recordOrderEvent({
          order,
          actor: currentUser,
          eventType: 'status',
          remark: '用户撤销了工单',
          notification: {
            title: '工单已撤销',
            message: `工单「${order.title}」已撤销。`
          },
          transaction
        });
      }
      return { order, updated: true };
    });

    if (!outcome.updated) {
      const { order } = outcome;
      if (!order) {
        return res.status(404).json({
          code: 404,
          msg: '工单不存在',
          data: null
        });
      }

      return res.status(409).json({
        code: 409,
        msg: '只有待处理工单可以撤销',
        data: null
      });
    }

    const { order } = outcome;
    if (!order) {
      return res.status(404).json({
        code: 404,
        msg: '工单不存在',
        data: null
      });
    }
    return res.status(200).json({
      code: 200,
      msg: '工单已撤销',
      data: order
    });
  } catch (error) {
    console.error('撤销本人报修工单失败:', error);
    return res.status(500).json({
      code: 500,
      msg: '撤销工单失败',
      data: null
    });
  }
};

const deleteMyFinishedOrder = async (req, res) => {
  try {
    const currentUser = req.user;
    const { id } = req.params;

    if (!currentUser || !currentUser.id) {
      return res.status(401).json({
        code: 401,
        msg: '未登录，无法删除工单',
        data: null
      });
    }
    if (currentUser.role !== 'student') {
      return res.status(403).json({
        code: 403,
        msg: '只有用户可以删除自己的已完成或已撤销工单',
        data: null
      });
    }

    const [deletedCount] = await RepairOrder.update(
      { deletedAt: new Date(), deletedBy: 'student' },
      {
        where: {
          id,
          userId: currentUser.id,
          status: { [Op.in]: ['已完成', '已撤销'] },
          deletedAt: null
        },
        paranoid: false
      }
    );

    if (deletedCount === 0) {
      const order = await RepairOrder.findOne({
        where: { id, userId: currentUser.id }
      });

      if (!order) {
        return res.status(404).json({
          code: 404,
          msg: '工单不存在',
          data: null
        });
      }
      return res.status(409).json({
        code: 409,
        msg: '只有已完成或已撤销的工单可以删除',
        data: null
      });
    }

    return res.status(200).json({
      code: 200,
      msg: '工单已从用户端列表移除',
      data: null
    });
  } catch (error) {
    console.error('删除本人已完成或已撤销工单失败:', error);
    return res.status(500).json({
      code: 500,
      msg: '删除工单失败',
      data: null
    });
  }
};

const getAllOrderList = async (req, res) => {
  try {
    const page = parsePositiveInteger(req.query.page, 1);
    const size = parsePositiveInteger(req.query.size, 10);
    const keyword = typeof req.query.q === 'string' ? req.query.q.trim() : '';

    if (page === null || size === null) {
      return res.status(400).json({
        code: 400,
        msg: 'page和size必须为正整数',
        data: null
      });
    }
    if (keyword.length > 100) {
      return res.status(400).json({
        code: 400,
        msg: '搜索关键词不能超过100个字符',
        data: null
      });
    }

    const where = {
      [Op.and]: [
        { status: { [Op.ne]: '已撤销' } },
        {
          [Op.or]: [
            { deletedAt: null },
            { deletedBy: 'student' }
          ]
        },
        { adminHiddenAt: null }
      ]
    };
    const { category, location, from, to, sort } = req.query;
    if (category !== undefined) {
      if (typeof category !== 'string' || !category.trim() || category.length > 100) {
        return res.status(400).json({
          code: 400,
          msg: 'category必须为1至100个字符',
          data: null
        });
      }
      where[Op.and].push({ aiCategory: category });
    }
    if (typeof location === 'string' && location.trim()) {
      where[Op.and].push({
        [Op.or]: [
          { building: { [Op.like]: `%${location.trim()}%` } },
          { floor: { [Op.like]: `%${location.trim()}%` } },
          { room: { [Op.like]: `%${location.trim()}%` } },
          { location: { [Op.like]: `%${location.trim()}%` } }
        ]
      });
    }
    if (from || to) {
      const start = from ? new Date(`${from}T00:00:00`) : null;
      const end = to ? new Date(`${to}T23:59:59.999`) : null;
      if ((from && Number.isNaN(start.getTime())) || (to && Number.isNaN(end.getTime()))) {
        return res.status(400).json({
          code: 400,
          msg: '日期筛选格式无效，请使用 YYYY-MM-DD',
          data: null
        });
      }
      const createdAt = {};
      if (start) createdAt[Op.gte] = start;
      if (end) createdAt[Op.lte] = end;
      where[Op.and].push({ createdAt });
    }
    if (sort !== undefined && !['newest', 'oldest', 'waiting'].includes(sort)) {
      return res.status(400).json({
        code: 400,
        msg: 'sort必须为 newest / oldest / waiting',
        data: null
      });
    }
    if (req.query.status !== undefined) {
      const status = normalizeStatus(req.query.status);
      if (!status) {
        return res.status(400).json({
          code: 400,
          msg: 'status必须为 pending / processing / finished',
          data: null
        });
      }
      where[Op.and].push({ status });
    }
    if (keyword) {
      const searchPattern = `%${keyword}%`;
      where[Op.and].push({
        [Op.or]: [
          { title: { [Op.like]: searchPattern } },
          { desc: { [Op.like]: searchPattern } },
          { location: { [Op.like]: searchPattern } },
          { building: { [Op.like]: searchPattern } },
          { floor: { [Op.like]: searchPattern } },
          { room: { [Op.like]: searchPattern } },
          { phone: { [Op.like]: searchPattern } },
          { '$user.nickname$': { [Op.like]: searchPattern } },
          { '$user.phone$': { [Op.like]: searchPattern } }
        ]
      });
    }

    const { count: total, rows: list } = await RepairOrder.findAndCountAll({
      where,
      paranoid: false,
      distinct: true,
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'nickname', 'phone', 'role']
      }],
      order: sort === 'oldest'
        ? [['createdAt', 'ASC']]
        : sort === 'waiting'
          ? [
            [literal("CASE WHEN status = '待处理' THEN 0 WHEN status = '处理中' THEN 1 ELSE 2 END"), 'ASC'],
            ['createdAt', 'ASC']
          ]
          : [['createdAt', 'DESC']],
      limit: size,
      offset: (page - 1) * size
    });

    return res.status(200).json({
      code: 200,
      msg: '查询成功',
      data: {
        list,
        total,
        page,
        size,
        totalPage: Math.ceil(total / size)
      }
    });
  } catch (error) {
    console.error('查询全部工单失败:', error);
    return res.status(500).json({
      code: 500,
      msg: '查询全部工单失败',
      data: null
    });
  }
};

const deleteOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await RepairOrder.findByPk(id, { paranoid: false });

    if (!order || order.adminHiddenAt) {
      return res.status(404).json({
        code: 404,
        msg: '工单不存在',
        data: null
      });
    }

    if (order.status !== '已完成') {
      return res.status(409).json({
        code: 409,
        msg: '只有已完成的工单可以由管理员删除',
        data: null
      });
    }

    const [deletedCount] = await RepairOrder.update(
      { adminHiddenAt: new Date() },
      {
        where: { id, status: '已完成', adminHiddenAt: null },
        paranoid: false
      }
    );
    if (deletedCount === 0) {
      return res.status(404).json({
        code: 404,
        msg: '工单不存在',
        data: null
      });
    }

    await recordAdminAction(req.user, 'order.delete', 'order', id, { title: order.title });
    return res.status(200).json({
      code: 200,
      msg: '工单删除成功',
      data: null
    });
  } catch (error) {
    console.error('删除工单失败:', error);
    return res.status(500).json({
      code: 500,
      msg: '删除工单失败',
      data: null
    });
  }
};

const updateOrderStatus = async (req, res) => {
  try {
    const currentUser = req.user;
    const { id } = req.params;
    const { status, adminRemark, assignedTo, assignedStaffId, completionNote } = req.body || {};

    if (!currentUser || currentUser.role !== 'admin') {
      return res.status(403).json({
        code: 403,
        msg: '无权限，只有管理员才能更新工单状态',
        data: null
      });
    }

    const normalizedStatus = normalizeStatus(status);
    if (!normalizedStatus) {
      return res.status(400).json({
        code: 400,
        msg: 'status必须为 pending / processing / finished',
        data: null
      });
    }

    if (assignedTo !== undefined &&
        (typeof assignedTo !== 'string' || assignedTo.trim().length > 100)) {
      return res.status(400).json({
        code: 400,
        msg: '负责人名称不能超过100个字符',
        data: null
      });
    }
    if (assignedStaffId !== undefined && assignedStaffId !== null && assignedStaffId !== '' &&
        !Number.isInteger(Number(assignedStaffId))) {
      return res.status(400).json({ code: 400, msg: '维修人员编号无效', data: null });
    }
    if (completionNote !== undefined &&
        (typeof completionNote !== 'string' || completionNote.trim().length > 2000)) {
      return res.status(400).json({ code: 400, msg: '完工说明不能超过2000个字符', data: null });
    }

    let maintenanceStaff = null;
    if (assignedStaffId !== undefined && assignedStaffId !== null && assignedStaffId !== '') {
      maintenanceStaff = await MaintenanceStaff.findByPk(Number(assignedStaffId));
      if (!maintenanceStaff) {
        return res.status(400).json({ code: 400, msg: '指定的维修人员或维修组不存在', data: null });
      }
    }

    const result = await sequelize.transaction(async (transaction) => {
      const order = await RepairOrder.findByPk(id, { transaction });
      if (!order) return { order: null };
      if (order.status === '已完成') return { order: null, completed: true };

      const previousStatus = order.status;
      const previousAssignee = order.assignedTo || null;
      const previousStaffId = order.assignedStaffId || null;
      const previousRemark = order.adminRemark || '';
      const previousCompletionNote = order.completionNote || '';
      order.status = normalizedStatus;
      if (adminRemark !== undefined) order.adminRemark = adminRemark;
      if (assignedStaffId !== undefined) {
        order.assignedStaffId = maintenanceStaff?.id || null;
        if (maintenanceStaff) order.assignedTo = maintenanceStaff.name;
        else if (assignedTo !== undefined) order.assignedTo = assignedTo.trim() || null;
      } else if (assignedTo !== undefined) {
        order.assignedTo = assignedTo.trim() || null;
      }
      if (completionNote !== undefined) order.completionNote = completionNote.trim() || null;
      await order.save({ transaction });
      const statusChanged = previousStatus !== order.status;
      const assignmentChanged = previousAssignee !== (order.assignedTo || null);
      const staffChanged = previousStaffId !== (order.assignedStaffId || null);
      const remarkChanged = previousRemark !== (order.adminRemark || '');
      const completionNoteChanged = previousCompletionNote !== (order.completionNote || '');
      if (statusChanged || assignmentChanged || staffChanged || remarkChanged || completionNoteChanged) {
        const message = statusChanged
          ? `工单「${order.title}」状态已更新为${order.status}。`
          : assignmentChanged
            ? order.assignedTo
              ? `工单「${order.title}」已分派给${order.assignedTo}。`
              : `工单「${order.title}」的维修负责人已调整。`
            : `工单「${order.title}」有新的维修进度。`;
        await recordOrderEvent({
          order,
          actor: currentUser,
          eventType: statusChanged ? 'status' : assignmentChanged ? 'assignment' : 'note',
          remark: completionNote || adminRemark || null,
          notification: {
            title: statusChanged ? '工单进度更新' : assignmentChanged ? '维修任务分派更新' : '维修备注更新',
            message
          },
          transaction
        });
        await recordAdminAction(
          currentUser,
          statusChanged ? 'order.status.update' : assignmentChanged || staffChanged ? 'order.assign' : 'order.remark.update',
          'order',
          order.id,
          {
            status: order.status,
            assignedTo: order.assignedTo,
            adminRemark: order.adminRemark,
            completionNote: order.completionNote
          },
          { transaction }
        );
      }
      return { order };
    });
    if (result.completed) {
      return res.status(409).json({
        code: 409,
        msg: '已完成工单不可编辑',
        data: null
      });
    }
    if (!result.order) {
      return res.status(404).json({
        code: 404,
        msg: '工单不存在',
        data: null
      });
    }

    return res.status(200).json({
      code: 200,
      msg: '工单状态更新成功',
      data: result.order
    });
  } catch (error) {
    console.error('更新工单状态失败:', error);
    return res.status(500).json({
      code: 500,
      msg: '更新工单状态失败',
      data: null
    });
  }
};

const confirmOrderCompletion = async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ code: 403, msg: '只有用户可以确认本人工单完成', data: null });
    }
    const order = await RepairOrder.findOne({
      where: { id: req.params.id, userId: req.user.id, status: '已完成' }
    });
    if (!order) return res.status(404).json({ code: 404, msg: '已完成工单不存在', data: null });
    if (order.studentConfirmedAt) {
      return res.status(200).json({ code: 200, msg: '工单已确认完成', data: order });
    }
    order.studentConfirmedAt = new Date();
    await order.save();
    await recordOrderEvent({
      order,
      actor: req.user,
      eventType: 'note',
      remark: '用户确认维修完成'
    });
    return res.status(200).json({ code: 200, msg: '已确认维修完成', data: order });
  } catch (error) {
    console.error('确认工单完成失败:', error);
    return res.status(500).json({ code: 500, msg: '确认工单完成失败', data: null });
  }
};

const requestOrderReopen = async (req, res) => {
  if (req.user.role !== 'student') {
    return res.status(403).json({ code: 403, msg: '只有用户可以申请重新处理本人工单', data: null });
  }
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (!reason || reason.length > 1000) {
    return res.status(400).json({ code: 400, msg: '请填写重新处理原因（最多1000个字符）', data: null });
  }
  try {
    const order = await RepairOrder.findOne({
      where: { id: req.params.id, userId: req.user.id, status: '已完成' }
    });
    if (!order) return res.status(404).json({ code: 404, msg: '已完成工单不存在', data: null });
    if (order.reopenRequestedAt) {
      return res.status(409).json({ code: 409, msg: '已提交重新处理申请，请等待管理员处理', data: null });
    }
    order.reopenRequestedAt = new Date();
    order.reopenReason = reason;
    await order.save();
    await recordOrderEvent({
      order,
      actor: req.user,
      eventType: 'note',
      remark: `用户申请重新处理：${reason}`
    });
    await Notification.create({
      userId: order.userId,
      orderId: order.id,
      title: '重新处理申请已提交',
      message: `工单「${order.title}」的重新处理申请已提交，等待管理员处理。`
    });
    return res.status(200).json({ code: 200, msg: '已提交重新处理申请', data: order });
  } catch (error) {
    console.error('申请重新处理工单失败:', error);
    return res.status(500).json({ code: 500, msg: '申请重新处理失败', data: null });
  }
};

const reopenOrderForRepair = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ code: 403, msg: '只有管理员可以接受重新处理申请', data: null });
    }
    const order = await RepairOrder.findByPk(req.params.id);
    if (!order || !order.reopenRequestedAt) {
      return res.status(404).json({ code: 404, msg: '没有待处理的重新处理申请', data: null });
    }
    const previousStatus = order.status;
    order.status = '处理中';
    order.reopenRequestedAt = null;
    order.studentConfirmedAt = null;
    await order.save();
    await recordOrderEvent({
      order,
      actor: req.user,
      eventType: 'status',
      remark: '管理员接受重新处理申请',
      notification: {
        title: '工单重新开始处理',
        message: `工单「${order.title}」已重新安排处理。`
      }
    });
    await recordAdminAction(req.user, 'order.reopen', 'order', order.id, {
      previousStatus,
      status: order.status,
      reason: order.reopenReason
    });
    return res.status(200).json({ code: 200, msg: '工单已重新开启处理', data: order });
  } catch (error) {
    console.error('重新开启工单失败:', error);
    return res.status(500).json({ code: 500, msg: '重新开启工单失败', data: null });
  }
};

const uploadCompletionEvidence = async (req, res) => {
  let filename;
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ code: 403, msg: '只有管理员可以上传完工照片', data: null });
    }
    if (!req.file) return res.status(400).json({ code: 400, msg: '请选择完工照片', data: null });
    const order = await RepairOrder.findByPk(req.params.id);
    if (!order || !['待处理', '处理中'].includes(order.status)) {
      return res.status(409).json({ code: 409, msg: '只能为尚未完成的工单上传完工照片', data: null });
    }
    filename = await saveRepairImage(req.file);
    order.completionImgUrl = `${req.protocol}://${req.get('host')}/uploads/${encodeURIComponent(filename)}`;
    await order.save();
    await recordOrderEvent({
      order,
      actor: req.user,
      eventType: 'note',
      remark: '管理员上传了完工照片'
    });
    await recordAdminAction(req.user, 'order.completion.evidence', 'order', order.id, { image: order.completionImgUrl });
    return res.status(200).json({ code: 200, msg: '完工照片上传成功', data: { completionImgUrl: order.completionImgUrl } });
  } catch (error) {
    if (filename) {
      try {
        await removeRepairImage(filename);
      } catch (cleanupError) {
        console.error('清理未关联的完工照片失败:', cleanupError);
      }
    }
    console.error('上传完工照片失败:', error);
    return res.status(500).json({ code: 500, msg: '上传完工照片失败', data: null });
  }
};

const getOrderDetail = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUser = req.user;

    const order = await RepairOrder.findByPk(id, {
      paranoid: false,
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'nickname', 'phone', 'role']
      }, {
        model: RepairOrderHistory,
        as: 'history',
        separate: true,
        order: [['createdAt', 'ASC']]
      }, {
        model: RepairOrderReview,
        as: 'review'
      }]
    });

    if (!order) {
      return res.status(404).json({
        code: 404,
        msg: '工单不存在',
        data: null
      });
    }

    if (currentUser.role !== 'admin' &&
        order.deletedAt && order.deletedBy === 'student') {
      return res.status(404).json({
        code: 404,
        msg: '工单不存在',
        data: null
      });
    }

    if (currentUser.role === 'maintenance' &&
        Number(order.assignedStaffId) !== Number(currentUser.staffId)) {
      return res.status(403).json({ code: 403, msg: '无权限查看该工单', data: null });
    }

    if (currentUser.role === 'student' && order.userId !== currentUser.id) {
      return res.status(403).json({
        code: 403,
        msg: '无权限查看该工单',
        data: null
      });
    }

    await getExpectedCompletionAt([order]);
    return res.status(200).json({
      code: 200,
      msg: '查询成功',
      data: order
    });
  } catch (error) {
    console.error('查询工单详情失败:', error);
    return res.status(500).json({
      code: 500,
      msg: '查询工单详情失败',
      data: null
    });
  }
};

module.exports = {
  createRepairOrder,
  getMyOrderList,
  cancelMyOrder,
  deleteMyFinishedOrder,
  getAllOrderList,
  deleteOrder,
  updateOrderStatus,
  getOrderDetail,
  confirmOrderCompletion,
  requestOrderReopen,
  reopenOrderForRepair,
  uploadCompletionEvidence
};
