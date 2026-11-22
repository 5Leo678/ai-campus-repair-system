const { Op, literal } = require('sequelize');
const { RepairOrder, User } = require('../models');
const { recordAdminAction } = require('../services/adminAudit');

const escapeCsv = (value) => {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[\u0000-\u0020]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};

const exportOrdersCsv = async (req, res) => {
  try {
    const where = {
      [Op.and]: [
        { status: { [Op.ne]: '已撤销' } },
        { [Op.or]: [{ deletedAt: null }, { deletedBy: 'student' }] },
        { adminHiddenAt: null }
      ]
    };
    const statusMap = { pending: '待处理', processing: '处理中', finished: '已完成' };
    if (req.query.status !== undefined) {
      if (!Object.hasOwn(statusMap, req.query.status)) {
        return res.status(400).json({ code: 400, msg: 'status参数无效', data: null });
      }
      where[Op.and].push({ status: statusMap[req.query.status] });
    }

    if (req.query.category !== undefined) {
      if (typeof req.query.category !== 'string' ||
          !req.query.category.trim() || req.query.category.length > 100) {
        return res.status(400).json({ code: 400, msg: 'category参数无效', data: null });
      }
      where[Op.and].push({ aiCategory: req.query.category });
    }

    if (req.query.location !== undefined) {
      if (typeof req.query.location !== 'string' || req.query.location.length > 100) {
        return res.status(400).json({ code: 400, msg: 'location参数无效', data: null });
      }
      if (req.query.location.trim()) {
        const pattern = `%${req.query.location.trim()}%`;
        where[Op.and].push({
          [Op.or]: [
            { building: { [Op.like]: pattern } },
            { floor: { [Op.like]: pattern } },
            { room: { [Op.like]: pattern } },
            { location: { [Op.like]: pattern } }
          ]
        });
      }
    }

    if (req.query.q !== undefined) {
      if (typeof req.query.q !== 'string' || req.query.q.trim().length > 100) {
        return res.status(400).json({ code: 400, msg: 'q参数不能超过100个字符', data: null });
      }
      const keyword = req.query.q.trim();
      if (keyword) {
        const pattern = `%${keyword}%`;
        where[Op.and].push({
          [Op.or]: [
            { title: { [Op.like]: pattern } },
            { desc: { [Op.like]: pattern } },
            { location: { [Op.like]: pattern } },
            { building: { [Op.like]: pattern } },
            { floor: { [Op.like]: pattern } },
            { room: { [Op.like]: pattern } },
            { '$user.nickname$': { [Op.like]: pattern } },
            { '$user.phone$': { [Op.like]: pattern } },
            { phone: { [Op.like]: pattern } }
          ]
        });
      }
    }

    if (req.query.from || req.query.to) {
      const isDate = (value) => {
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
        const [year, month, day] = value.split('-').map(Number);
        const date = new Date(`${value}T00:00:00`);
        return date.getFullYear() === year &&
          date.getMonth() + 1 === month &&
          date.getDate() === day;
      };
      if ((req.query.from && !isDate(req.query.from)) ||
          (req.query.to && !isDate(req.query.to))) {
        return res.status(400).json({ code: 400, msg: '日期格式必须为 YYYY-MM-DD', data: null });
      }
      const createdAt = {};
      if (req.query.from) createdAt[Op.gte] = new Date(`${req.query.from}T00:00:00`);
      if (req.query.to) createdAt[Op.lte] = new Date(`${req.query.to}T23:59:59.999`);
      if (req.query.from && req.query.to && createdAt[Op.gte] > createdAt[Op.lte]) {
        return res.status(400).json({ code: 400, msg: '开始日期不能晚于结束日期', data: null });
      }
      where[Op.and].push({ createdAt });
    }

    if (req.query.sort !== undefined &&
        !['newest', 'oldest', 'waiting'].includes(req.query.sort)) {
      return res.status(400).json({ code: 400, msg: 'sort参数无效', data: null });
    }

    const orders = await RepairOrder.findAll({
      where,
      paranoid: false,
      include: [{
        model: User,
        as: 'user',
        attributes: ['nickname', 'phone'],
        required: false
      }],
      order: req.query.sort === 'oldest'
        ? [['createdAt', 'ASC']]
        : req.query.sort === 'waiting'
          ? [
            [literal("CASE WHEN status = '待处理' THEN 0 WHEN status = '处理中' THEN 1 ELSE 2 END"), 'ASC'],
            ['createdAt', 'ASC']
          ]
          : [['createdAt', 'DESC']]
    });
    const header = ['工单编号', '标题', '故障描述', '地点', '状态', '故障类型', '负责人', '报修人', '联系电话', '提交时间', '完成时间'];
    const rows = orders.map((order) => [
      order.id,
      order.title,
      order.desc,
      order.location,
      order.status,
      order.aiCategory,
      order.assignedTo,
      order.user?.nickname,
      order.phone || order.user?.phone,
      order.createdAt?.toISOString(),
      order.status === '已完成' ? order.updatedAt?.toISOString() : ''
    ]);
    const csv = `\uFEFF${[header, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\r\n')}`;
    await recordAdminAction(req.user, 'report.export', 'orders', null, { count: orders.length });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="repair-orders.csv"');
    return res.status(200).send(csv);
  } catch (error) {
    console.error('导出工单报表失败:', error);
    return res.status(500).json({ code: 500, msg: '导出工单报表失败', data: null });
  }
};

module.exports = { exportOrdersCsv };
