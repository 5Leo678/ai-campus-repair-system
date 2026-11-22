const {
  MaintenanceStaff,
  Notification,
  RepairOrder,
  RepairOrderHistory,
  User,
  sequelize
} = require('../models');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { getJwtSecret } = require('../config/security');
const { saveRepairImage, removeRepairImage } = require('../middleware/repairImageUpload');
const { Op } = require('sequelize');

const response = (res, status, msg, data = null) =>
  res.status(status).json({ code: status, msg, data });

const login = async (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' ||
      !/^[A-Za-z0-9._-]{3,64}$/.test(username.trim()) ||
      typeof password !== 'string' ||
      Buffer.byteLength(password, 'utf8') < 8 ||
      Buffer.byteLength(password, 'utf8') > 72) {
    return response(res, 400, '请输入有效的维修人员账号和密码');
  }

  try {
    const staff = await MaintenanceStaff.unscoped().findOne({
      where: { username: username.trim(), type: 'person' }
    });
    const passwordMatches = staff && staff.passwordHash
      ? await bcrypt.compare(password, staff.passwordHash)
      : false;
    if (!passwordMatches) {
      return response(res, 401, '账号或密码错误');
    }

    const token = jwt.sign({
      id: staff.id,
      staffId: staff.id,
      username: staff.username,
      name: staff.name,
      role: 'maintenance'
    }, getJwtSecret(), { expiresIn: '7d' });

    return response(res, 200, '维修人员登录成功', {
      token,
      user: {
        id: staff.id,
        staffId: staff.id,
        username: staff.username,
        name: staff.name,
        role: 'maintenance'
      }
    });
  } catch (error) {
    console.error('维修人员登录失败:', error);
    return response(res, 500, '维修人员登录失败');
  }
};

const listAssignedOrders = async (req, res) => {
  try {
    const orders = await RepairOrder.findAll({
      where: { assignedStaffId: Number(req.user.staffId) },
      attributes: [
        'id',
        'title',
        'desc',
        'location',
        'building',
        'floor',
        'room',
        'mapAddress',
        'latitude',
        'longitude',
        'additionalDescription',
        'phone',
        'imgUrl',
        'aiCategory',
        'status',
        'assignedTo',
        'assignedStaffId',
        'completionNote',
        'completionImgUrl',
        'createdAt',
        'updatedAt'
      ],
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['nickname', 'phone']
        },
        {
          model: MaintenanceStaff,
          as: 'maintenanceStaff',
          attributes: ['id', 'name', 'type', 'phone']
        }
      ],
      order: [['createdAt', 'DESC']]
    });
    return response(res, 200, '维修工单列表查询成功', orders);
  } catch (error) {
    console.error('查询维修工单列表失败:', error);
    return response(res, 500, '查询维修工单列表失败');
  }
};

const uploadCompletionEvidence = async (req, res) => {
  let filename;
  try {
    if (!req.file) return response(res, 400, '请选择完工照片');

    const result = await sequelize.transaction(async (transaction) => {
      const order = await RepairOrder.findOne({
        where: {
          id: req.params.id,
          assignedStaffId: Number(req.user.staffId)
        },
        transaction,
        lock: transaction.LOCK && transaction.LOCK.UPDATE
      });
      if (!order) return { status: 404, msg: '工单不存在或未分配给当前维修人员' };
      if (!['待处理', '处理中'].includes(order.status)) {
        return { status: 409, msg: '只能为尚未完成的工单上传完工照片' };
      }

      filename = await saveRepairImage(req.file);
      const completionImgUrl =
        `${req.protocol}://${req.get('host')}/uploads/${encodeURIComponent(filename)}`;
      if (typeof order.save === 'function') {
        order.completionImgUrl = completionImgUrl;
        await order.save({ transaction });
      } else if (typeof order.update === 'function') {
        await order.update({ completionImgUrl }, { transaction });
      } else {
        order.completionImgUrl = completionImgUrl;
      }

      await RepairOrderHistory.create({
        orderId: order.id,
        userId: order.userId,
        actorRole: 'maintenance',
        actorId: Number(req.user.staffId),
        eventType: 'note',
        status: order.status,
        assignedTo: order.assignedTo || null,
        remark: '维修人员上传了完工照片'
      }, { transaction });
      return { status: 200, msg: '完工照片上传成功', data: { completionImgUrl } };
    });
    return response(res, result.status, result.msg, result.data || null);
  } catch (error) {
    if (filename) {
      try {
        await removeRepairImage(filename);
      } catch (cleanupError) {
        console.error('清理未关联的完工照片失败:', cleanupError);
      }
    }
    console.error('维修人员上传完工照片失败:', error);
    return response(res, 500, '完工照片上传失败');
  }
};

const updateOrderProgress = async (req, res) => {
  const { status, completionNote } = req.body || {};
  if (completionNote !== undefined &&
      (typeof completionNote !== 'string' || completionNote.trim().length > 2000)) {
    return response(res, 400, '完工说明不能超过2000个字符');
  }

  try {
    const result = await sequelize.transaction(async (transaction) => {
      const order = await RepairOrder.findOne({
        where: {
          id: req.params.id,
          assignedStaffId: Number(req.user.staffId)
        },
        transaction,
        lock: transaction.LOCK && transaction.LOCK.UPDATE
      });
      if (!order) return { status: 404, msg: '工单不存在或未分配给当前维修人员' };

      const validNextStatus = order.status === '待处理'
        ? '处理中'
        : order.status === '处理中'
          ? '已完成'
          : null;
      if (!validNextStatus || status !== validNextStatus) {
        return { status: 409, msg: '工单状态不允许执行此转换' };
      }

      const updates = { status };
      if (completionNote !== undefined) updates.completionNote = completionNote.trim() || null;
      if (typeof order.update === 'function') {
        await order.update(updates, { transaction });
      } else {
        Object.assign(order, updates);
      }

      const remark = completionNote === undefined ? null : completionNote.trim() || null;
      await RepairOrderHistory.create({
        orderId: order.id,
        userId: order.userId,
        actorRole: 'maintenance',
        actorId: Number(req.user.staffId),
        eventType: 'status',
        status,
        assignedTo: order.assignedTo || null,
        remark
      }, { transaction });
      await Notification.create({
        userId: order.userId,
        orderId: order.id,
        title: status === '处理中' ? '维修工单已开始处理' : '维修工单已完成',
        message: status === '处理中'
          ? `工单「${order.title}」已开始处理。`
          : `工单「${order.title}」已完成${remark ? `，完工说明：${remark}` : '。'}`
      }, { transaction });

      return { status: 200, msg: '工单进度更新成功', order };
    });

    return response(res, result.status, result.msg, result.order || null);
  } catch (error) {
    console.error('更新维修工单进度失败:', error);
    return response(res, 500, '更新维修工单进度失败');
  }
};

const getMaintenanceProfile = async (req, res) => {
  try {
    const staff = await MaintenanceStaff.findByPk(Number(req.user.staffId));
    if (!staff) return response(res, 404, '维修人员不存在');
    const [pending, processing, finished] = await Promise.all([
      RepairOrder.count({ where: { assignedStaffId: staff.id, status: '待处理' } }),
      RepairOrder.count({ where: { assignedStaffId: staff.id, status: '处理中' } }),
      RepairOrder.count({ where: { assignedStaffId: staff.id, status: '已完成' } })
    ]);
    return response(res, 200, '维修人员资料查询成功', {
      id: staff.id,
      name: staff.name,
      username: staff.username,
      phone: staff.phone,
      type: staff.type,
      description: staff.description,
      stats: { pending, processing, finished, total: pending + processing + finished }
    });
  } catch (error) {
    console.error('查询维修人员资料失败:', error);
    return response(res, 500, '查询维修人员资料失败');
  }
};

const updateMaintenancePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
    return response(res, 400, '请输入当前密码和新密码');
  }
  if (Buffer.byteLength(newPassword, 'utf8') < 8 || Buffer.byteLength(newPassword, 'utf8') > 72) {
    return response(res, 400, '新密码长度须为8至72字节');
  }
  if (currentPassword === newPassword) {
    return response(res, 400, '新密码不能与当前密码相同');
  }
  try {
    const staff = await MaintenanceStaff.unscoped().findByPk(Number(req.user.staffId));
    if (!staff || !staff.passwordHash) return response(res, 404, '维修人员登录账号不存在');
    const matches = await bcrypt.compare(currentPassword, staff.passwordHash);
    if (!matches) return response(res, 401, '当前密码错误');
    staff.passwordHash = await bcrypt.hash(newPassword, 10);
    await staff.save();
    return response(res, 200, '密码修改成功');
  } catch (error) {
    console.error('修改维修人员密码失败:', error);
    return response(res, 500, '密码修改失败');
  }
};

const listMaintenanceNotices = async (req, res) => {
  try {
    const orders = await RepairOrder.findAll({
      where: { assignedStaffId: Number(req.user.staffId) },
      attributes: ['id', 'title', 'status', 'updatedAt'],
      order: [['updatedAt', 'DESC']]
    });
    const orderIds = orders.map((order) => order.id);
    if (!orderIds.length) return response(res, 200, '通知查询成功', []);
    const histories = await RepairOrderHistory.findAll({
      where: {
        orderId: { [Op.in]: orderIds },
        eventType: { [Op.in]: ['status', 'created', 'note', 'assigned'] }
      },
      order: [['createdAt', 'DESC']],
      limit: 30
    });
    const orderMap = new Map(orders.map((order) => [order.id, order]));
    const notices = histories.map((history) => {
      const order = orderMap.get(history.orderId);
      let message = history.remark || '工单状态有更新';
      if (history.eventType === 'created') message = '工单已分派给你';
      if (history.eventType === 'status' && history.status === '处理中') message = '工单已进入维修中';
      if (history.eventType === 'status' && history.status === '已完成') message = '工单已标记完成';
      return {
        id: history.id,
        orderId: history.orderId,
        title: order?.title || `工单 #${history.orderId}`,
        message,
        status: history.status || order?.status || '',
        createdAt: history.createdAt
      };
    });
    return response(res, 200, '通知查询成功', notices);
  } catch (error) {
    console.error('查询维修人员通知失败:', error);
    return response(res, 500, '通知查询失败');
  }
};

module.exports = {
  login,
  listAssignedOrders,
  uploadCompletionEvidence,
  updateOrderProgress,
  getMaintenanceProfile,
  updateMaintenancePassword,
  listMaintenanceNotices
};
