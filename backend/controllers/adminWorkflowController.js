const { Op } = require('sequelize');
const {
  AdminAuditLog,
  AdminUser,
  RepairOrder,
  RepairOrderHistory,
  RepairOrderReview,
  SystemSetting
} = require('../models');
const { recordAdminAction } = require('../services/adminAudit');

const DEFAULT_SLA = { pendingHours: 24, processingHours: 72 };

const getSlaSettings = async () => {
  const rows = await SystemSetting.findAll({
    where: { key: { [Op.in]: ['sla.pendingHours', 'sla.processingHours'] } }
  });
  const values = new Map(rows.map((row) => [row.key, Number(row.value)]));
  return {
    pendingHours: values.get('sla.pendingHours') || DEFAULT_SLA.pendingHours,
    processingHours: values.get('sla.processingHours') || DEFAULT_SLA.processingHours
  };
};

const getAdminSlaSettings = async (_req, res) => {
  try {
    return res.status(200).json({
      code: 200,
      msg: 'SLA设置查询成功',
      data: await getSlaSettings()
    });
  } catch (error) {
    console.error('查询SLA设置失败:', error);
    return res.status(500).json({ code: 500, msg: '查询SLA设置失败', data: null });
  }
};

const updateSlaSettings = async (req, res) => {
  const { pendingHours, processingHours } = req.body || {};
  if (!Number.isInteger(pendingHours) || pendingHours < 1 || pendingHours > 720 ||
      !Number.isInteger(processingHours) || processingHours < 1 || processingHours > 720) {
    return res.status(400).json({
      code: 400,
      msg: '待处理和维修中时限必须为1至720小时的整数',
      data: null
    });
  }
  try {
    await SystemSetting.bulkCreate([
      { key: 'sla.pendingHours', value: String(pendingHours) },
      { key: 'sla.processingHours', value: String(processingHours) }
    ], { updateOnDuplicate: ['value', 'updatedAt'] });
    await recordAdminAction(req.user, 'sla.update', 'settings', 'sla', { pendingHours, processingHours });
    return res.status(200).json({
      code: 200,
      msg: 'SLA设置已更新',
      data: { pendingHours, processingHours }
    });
  } catch (error) {
    console.error('更新SLA设置失败:', error);
    return res.status(500).json({ code: 500, msg: '更新SLA设置失败', data: null });
  }
};

const getSlaAlerts = async (_req, res) => {
  try {
    const settings = await getSlaSettings();
    const orders = await RepairOrder.findAll({
      where: { status: { [Op.in]: ['待处理', '处理中'] } },
      include: [{
        model: RepairOrderHistory,
        as: 'history',
        attributes: ['status', 'createdAt'],
        where: { status: '处理中', eventType: 'status' },
        separate: true,
        order: [['createdAt', 'DESC']],
        limit: 1
      }],
      order: [['createdAt', 'ASC']]
    });
    const now = Date.now();
    const alerts = orders.map((order) => {
      const start = order.status === '处理中' && order.history?.[0]?.status === '处理中'
        ? new Date(order.history[0].createdAt).getTime()
        : new Date(order.createdAt).getTime();
      const limitHours = order.status === '待处理'
        ? settings.pendingHours
        : settings.processingHours;
      const elapsedHours = Math.max(0, (now - start) / 3600000);
      return {
        id: order.id,
        title: order.title,
        status: order.status,
        location: order.location,
        assignedTo: order.assignedTo,
        createdAt: order.createdAt,
        elapsedHours: Number(elapsedHours.toFixed(1)),
        limitHours,
        overdue: elapsedHours >= limitHours,
        nearingDeadline: elapsedHours >= limitHours * 0.8
      };
    }).filter((order) => order.nearingDeadline)
      .sort((left, right) => Number(right.overdue) - Number(left.overdue));

    return res.status(200).json({
      code: 200,
      msg: 'SLA预警查询成功',
      data: { settings, list: alerts, overdueCount: alerts.filter((item) => item.overdue).length }
    });
  } catch (error) {
    console.error('查询SLA预警失败:', error);
    return res.status(500).json({ code: 500, msg: '查询SLA预警失败', data: null });
  }
};

const listAdminAuditLogs = async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const size = Number(req.query.size || 20);
    if (!Number.isInteger(page) || !Number.isInteger(size) || page < 1 || size < 1 || size > 100) {
      return res.status(400).json({ code: 400, msg: '分页参数无效', data: null });
    }
    const rawKeyword = req.query.q ?? '';
    if (typeof rawKeyword !== 'string' || rawKeyword.trim().length > 100) {
      return res.status(400).json({ code: 400, msg: '搜索关键词不能超过100个字符', data: null });
    }
    const keyword = rawKeyword.trim();
    const { count, rows } = await AdminAuditLog.findAndCountAll({
      attributes: ['id', 'adminId', 'action', 'targetType', 'targetId', 'details', 'createdAt'],
      include: [{
        model: AdminUser,
        as: 'admin',
        attributes: ['name', 'username'],
        required: false
      }],
      where: keyword
        ? {
          [Op.or]: [
            { action: { [Op.like]: `%${keyword}%` } },
            { targetType: { [Op.like]: `%${keyword}%` } },
            { targetId: { [Op.like]: `%${keyword}%` } },
            { details: { [Op.like]: `%${keyword}%` } },
            { '$admin.name$': { [Op.like]: `%${keyword}%` } },
            { '$admin.username$': { [Op.like]: `%${keyword}%` } }
          ]
        }
        : {},
      order: [['createdAt', 'DESC']],
      limit: size,
      offset: (page - 1) * size
    });
    return res.status(200).json({
      code: 200,
      msg: '管理员操作记录查询成功',
      data: { list: rows, total: count, page, size, totalPage: Math.ceil(count / size) }
    });
  } catch (error) {
    console.error('查询管理员操作记录失败:', error);
    return res.status(500).json({ code: 500, msg: '查询管理员操作记录失败', data: null });
  }
};

const updateReviewFollowup = async (req, res) => {
  const { note } = req.body || {};
  if (typeof note !== 'string' || note.trim().length > 1000) {
    return res.status(400).json({ code: 400, msg: '跟进记录不能超过1000个字符', data: null });
  }
  try {
    const review = await RepairOrderReview.findOne({
      where: { id: req.params.id },
      include: [{
        model: RepairOrder,
        as: 'order',
        attributes: ['id', 'status'],
        where: { status: '已完成' },
        required: true
      }]
    });
    if (!review) return res.status(404).json({ code: 404, msg: '评价不存在', data: null });
    await review.update({
      adminFollowup: note.trim() || null,
      followedUpAt: note.trim() ? new Date() : null
    });
    await recordAdminAction(req.user, 'review.followup', 'review', review.id, { note: review.adminFollowup });
    return res.status(200).json({ code: 200, msg: '评价跟进记录已保存', data: review });
  } catch (error) {
    console.error('更新评价跟进失败:', error);
    return res.status(500).json({ code: 500, msg: '更新评价跟进失败', data: null });
  }
};

module.exports = {
  getAdminSlaSettings,
  updateSlaSettings,
  getSlaAlerts,
  listAdminAuditLogs,
  updateReviewFollowup
};
