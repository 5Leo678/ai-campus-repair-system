const { MaintenanceStaff, RepairOrder, RepairOrderHistory } = require('../models');
const { Op } = require('sequelize');
const bcrypt = require('bcrypt');
const { recordAdminAction } = require('../services/adminAudit');

const normalizeStaffInput = (body = {}, { isUpdate = false } = {}) => {
  const { name, type, phone = '', description = '', username, password } = body;
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 100) {
    return { error: '名称为必填项且不能超过100个字符' };
  }
  if (!['person', 'team'].includes(type)) {
    return { error: '类型必须为 person 或 team' };
  }
  if (typeof phone !== 'string' || phone.trim().length > 30) {
    return { error: '联系电话不能超过30个字符' };
  }
  if (typeof description !== 'string' || description.trim().length > 500) {
    return { error: '备注不能超过500个字符' };
  }

  const normalizedUsername = typeof username === 'string' ? username.trim() : username;
  const hasUsername = normalizedUsername !== undefined && normalizedUsername !== '';
  const hasPassword = typeof password === 'string' && password !== '';
  if (username !== undefined && username !== '' &&
      (typeof username !== 'string' || !/^[A-Za-z0-9._-]{3,64}$/.test(normalizedUsername))) {
    return { error: '登录用户名须为3至64位字母、数字、点、下划线或连字符' };
  }
  if (password !== undefined && password !== '' &&
      (typeof password !== 'string' || Buffer.byteLength(password, 'utf8') < 8 ||
        Buffer.byteLength(password, 'utf8') > 72)) {
    return { error: '登录密码长度须为8至72字节' };
  }
  if (type === 'team' && (hasUsername || hasPassword)) {
    return { error: '维修组不能设置登录账号' };
  }
  if (type === 'person' && hasPassword && !hasUsername) {
    if (!isUpdate) return { error: '新建登录账号时必须同时提供用户名和密码' };
  }
  if (type === 'person' && !isUpdate && hasUsername !== hasPassword) {
    return { error: '新建登录账号时必须同时提供用户名和密码' };
  }

  return {
    value: {
      name: name.trim(),
      type,
      phone: phone.trim() || null,
      description: description.trim() || null,
      ...(hasUsername ? { username: normalizedUsername } : {}),
      ...(hasPassword ? { password } : {})
    },
    hasUsername,
    hasPassword
  };
};

const serializeStaff = (staff) => {
  const value = typeof staff.toJSON === 'function' ? staff.toJSON() : { ...staff };
  delete value.passwordHash;
  delete value.password;
  return value;
};

const isUniqueConstraintError = (error) =>
  error.name === 'SequelizeUniqueConstraintError' || error.name === 'UniqueConstraintError';

const getMaintenanceStaff = async (_req, res) => {
  try {
    const list = await MaintenanceStaff.findAll({
      order: [['createdAt', 'DESC']]
    });
    return res.status(200).json({
      code: 200,
      msg: '维修人员列表查询成功',
      data: list.map(serializeStaff)
    });
  } catch (error) {
    console.error('查询维修人员列表失败:', error);
    return res.status(500).json({
      code: 500,
      msg: '查询维修人员列表失败',
      data: null
    });
  }
};

const createMaintenanceStaff = async (req, res) => {
  const normalized = normalizeStaffInput(req.body);
  if (normalized.error) {
    return res.status(400).json({
      code: 400,
      msg: normalized.error,
      data: null
    });
  }

  try {
    const values = { ...normalized.value };
    const password = values.password;
    delete values.password;
    if (normalized.hasPassword) values.passwordHash = await bcrypt.hash(password, 10);
    const staff = await MaintenanceStaff.create(values);
    const auditValues = { ...values };
    delete auditValues.passwordHash;
    await recordAdminAction(req.user, 'maintenance.create', 'maintenance_staff', staff.id, auditValues);
    return res.status(201).json({
      code: 201,
      msg: '维修人员创建成功',
      data: serializeStaff(staff)
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return res.status(409).json({ code: 409, msg: '登录用户名已被使用', data: null });
    }
    console.error('创建维修人员失败:', error);
    return res.status(500).json({
      code: 500,
      msg: '创建维修人员失败',
      data: null
    });
  }
};

const updateMaintenanceStaff = async (req, res) => {
  const normalized = normalizeStaffInput(req.body, { isUpdate: true });
  if (normalized.error) {
    return res.status(400).json({
      code: 400,
      msg: normalized.error,
      data: null
    });
  }

  try {
    const staff = await MaintenanceStaff.findByPk(req.params.id);
    if (!staff) {
      return res.status(404).json({
        code: 404,
        msg: '维修人员或维修组不存在',
        data: null
      });
    }

    const values = { ...normalized.value };
    const password = values.password;
    delete values.password;
    if (values.type === 'person' && values.username && !staff.username && !normalized.hasPassword) {
      return res.status(400).json({
        code: 400,
        msg: '新建登录账号时必须同时提供用户名和密码',
        data: null
      });
    }
    if (values.type === 'person' && normalized.hasPassword && !values.username && !staff.username) {
      return res.status(400).json({
        code: 400,
        msg: '设置登录密码时必须先提供用户名',
        data: null
      });
    }
    if (normalized.hasPassword) values.passwordHash = await bcrypt.hash(password, 10);
    if (values.type === 'team') {
      values.username = null;
      values.passwordHash = null;
    } else if (values.type === 'person' && !values.username && !staff.username) {
      values.username = null;
    }

    await staff.update(values);
    const auditValues = { ...values };
    delete auditValues.passwordHash;
    await recordAdminAction(req.user, 'maintenance.update', 'maintenance_staff', staff.id, auditValues);
    return res.status(200).json({
      code: 200,
      msg: '维修人员更新成功',
      data: serializeStaff(staff)
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return res.status(409).json({ code: 409, msg: '登录用户名已被使用', data: null });
    }
    console.error('更新维修人员失败:', error);
    return res.status(500).json({
      code: 500,
      msg: '更新维修人员失败',
      data: null
    });
  }
};

const deleteMaintenanceStaff = async (req, res) => {
  try {
    const staff = await MaintenanceStaff.findByPk(req.params.id);
    if (!staff) {
      return res.status(404).json({
        code: 404,
        msg: '维修人员或维修组不存在',
        data: null
      });
    }

    await RepairOrder.update(
      { assignedStaffId: null },
      { where: { assignedStaffId: staff.id } }
    );
    await staff.destroy();
    await recordAdminAction(req.user, 'maintenance.delete', 'maintenance_staff', staff.id, { name: staff.name });
    return res.status(200).json({
      code: 200,
      msg: '维修人员删除成功',
      data: null
    });
  } catch (error) {
    console.error('删除维修人员失败:', error);
    return res.status(500).json({
      code: 500,
      msg: '删除维修人员失败',
      data: null
    });
  }
};

const getMaintenanceWorkload = async (_req, res) => {
  try {
    const [staff, orders, history] = await Promise.all([
      MaintenanceStaff.findAll({ order: [['name', 'ASC']] }),
      RepairOrder.findAll({
        attributes: ['id', 'status', 'assignedTo', 'assignedStaffId', 'createdAt'],
        where: { status: { [Op.ne]: '已撤销' } }
      }),
      RepairOrderHistory.findAll({
        attributes: ['orderId', 'status', 'createdAt'],
        where: { status: '已完成' },
        order: [['createdAt', 'ASC']]
      })
    ]);
    const firstCompleted = new Map();
    for (const event of history) {
      if (!firstCompleted.has(String(event.orderId))) {
        firstCompleted.set(String(event.orderId), new Date(event.createdAt).getTime());
      }
    }

    const workloads = staff.map((member) => {
      const assigned = orders.filter((order) =>
        order.assignedStaffId === member.id || (!order.assignedStaffId && order.assignedTo === member.name));
      const durations = assigned
        .map((order) => firstCompleted.get(String(order.id)) - new Date(order.createdAt).getTime())
        .filter((duration) => Number.isFinite(duration) && duration >= 0);
      return {
        id: member.id,
        name: member.name,
        type: member.type,
        username: member.username || null,
        total: assigned.length,
        pending: assigned.filter((order) => order.status === '待处理').length,
        processing: assigned.filter((order) => order.status === '处理中').length,
        finished: assigned.filter((order) => order.status === '已完成').length,
        averageResolutionHours: durations.length
          ? Number((durations.reduce((sum, duration) => sum + duration, 0) / durations.length / 3600000).toFixed(1))
          : null
      };
    });
    const assignedOrderCount = orders.filter((order) => order.assignedStaffId || order.assignedTo).length;
    return res.status(200).json({
      code: 200,
      msg: '维修工作量查询成功',
      data: {
        staff: workloads,
        totalOrders: orders.length,
        unassignedCount: orders.length - assignedOrderCount
      }
    });
  } catch (error) {
    console.error('查询维修工作量失败:', error);
    return res.status(500).json({ code: 500, msg: '查询维修工作量失败', data: null });
  }
};

module.exports = {
  getMaintenanceStaff,
  createMaintenanceStaff,
  updateMaintenanceStaff,
  deleteMaintenanceStaff,
  getMaintenanceWorkload
};
