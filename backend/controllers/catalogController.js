const { RepairCatalog } = require('../models');
const { recordAdminAction } = require('../services/adminAudit');

const VALID_TYPES = ['category', 'building'];

const getCatalog = async (_req, res) => {
  try {
    const list = await RepairCatalog.findAll({
      where: { active: true },
      order: [['type', 'ASC'], ['value', 'ASC']]
    });
    return res.status(200).json({ code: 200, msg: '报修目录查询成功', data: list });
  } catch (error) {
    console.error('查询报修目录失败:', error);
    return res.status(500).json({ code: 500, msg: '查询报修目录失败', data: null });
  }
};

const getAdminCatalog = async (_req, res) => {
  try {
    const list = await RepairCatalog.findAll({ order: [['type', 'ASC'], ['value', 'ASC']] });
    return res.status(200).json({ code: 200, msg: '报修目录查询成功', data: list });
  } catch (error) {
    console.error('查询报修目录失败:', error);
    return res.status(500).json({ code: 500, msg: '查询报修目录失败', data: null });
  }
};

const validateCatalog = (body = {}) => {
  if (!VALID_TYPES.includes(body.type)) return '类型必须为 category 或 building';
  if (typeof body.value !== 'string' || !body.value.trim() || body.value.trim().length > 100) {
    return '名称为必填项且不能超过100个字符';
  }
  return null;
};

const createCatalogEntry = async (req, res) => {
  const validationError = validateCatalog(req.body);
  if (validationError) return res.status(400).json({ code: 400, msg: validationError, data: null });
  try {
    const value = req.body.value.trim();
    const [entry, created] = await RepairCatalog.findOrCreate({
      where: { type: req.body.type, value },
      defaults: { active: true }
    });
    const wasInactive = !created && !entry.active;
    if (wasInactive) await entry.update({ active: true });
    if (!created && entry.active) {
      if (!wasInactive) {
        return res.status(409).json({ code: 409, msg: '该目录项已存在', data: null });
      }
    }
    const action = wasInactive ? 'catalog.activate' : 'catalog.create';
    const message = wasInactive ? '目录项已重新启用' : '目录项已添加';
    await recordAdminAction(req.user, action, 'catalog', entry.id, { type: entry.type, value });
    return res.status(201).json({ code: 201, msg: message, data: entry });
  } catch (error) {
    console.error('添加报修目录失败:', error);
    return res.status(500).json({ code: 500, msg: '添加报修目录失败', data: null });
  }
};

const updateCatalogEntry = async (req, res) => {
  const validationError = validateCatalog(req.body);
  if (validationError) return res.status(400).json({ code: 400, msg: validationError, data: null });
  try {
    const entry = await RepairCatalog.findByPk(req.params.id);
    if (!entry) return res.status(404).json({ code: 404, msg: '目录项不存在', data: null });
    await entry.update({ type: req.body.type, value: req.body.value.trim() });
    await recordAdminAction(req.user, 'catalog.update', 'catalog', entry.id, { type: entry.type, value: entry.value });
    return res.status(200).json({ code: 200, msg: '目录项已更新', data: entry });
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ code: 409, msg: '该目录项已存在', data: null });
    }
    console.error('更新报修目录失败:', error);
    return res.status(500).json({ code: 500, msg: '更新报修目录失败', data: null });
  }
};

const activateCatalogEntry = async (req, res) => {
  try {
    const entry = await RepairCatalog.findByPk(req.params.id);
    if (!entry) return res.status(404).json({ code: 404, msg: '目录项不存在', data: null });
    if (entry.active) {
      return res.status(409).json({ code: 409, msg: '该目录项已启用', data: null });
    }

    await entry.update({ active: true });
    await recordAdminAction(
      req.user,
      'catalog.activate',
      'catalog',
      entry.id,
      { type: entry.type, value: entry.value }
    );
    return res.status(200).json({ code: 200, msg: '目录项已重新启用', data: entry });
  } catch (error) {
    console.error('重新启用报修目录失败:', error);
    return res.status(500).json({ code: 500, msg: '重新启用报修目录失败', data: null });
  }
};

const deleteCatalogEntry = async (req, res) => {
  try {
    const entry = await RepairCatalog.findByPk(req.params.id);
    if (!entry) return res.status(404).json({ code: 404, msg: '目录项不存在', data: null });
    await entry.update({ active: false });
    await recordAdminAction(req.user, 'catalog.delete', 'catalog', entry.id, { type: entry.type, value: entry.value });
    return res.status(200).json({ code: 200, msg: '目录项已停用', data: null });
  } catch (error) {
    console.error('停用报修目录失败:', error);
    return res.status(500).json({ code: 500, msg: '停用报修目录失败', data: null });
  }
};

module.exports = {
  getCatalog,
  getAdminCatalog,
  createCatalogEntry,
  updateCatalogEntry,
  activateCatalogEntry,
  deleteCatalogEntry
};
