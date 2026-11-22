const { Notification, RepairOrder, RepairOrderMessage, sequelize } = require('../models');
const { removeRepairImage, saveRepairImage } = require('../middleware/repairImageUpload');

const getAccessibleOrder = async (req) => {
  const order = await RepairOrder.findByPk(req.params.id, { paranoid: false });
  if (!order) return null;
  if (req.user.role === 'maintenance') {
    return Number(order.assignedStaffId) === Number(req.user.staffId) ? order : null;
  }
  if (req.user.role !== 'admin' &&
      ((order.deletedAt && order.deletedBy === 'student') || order.userId !== req.user.id)) {
    return null;
  }
  return order;
};

const listOrderMessages = async (req, res) => {
  try {
    const order = await getAccessibleOrder(req);
    if (!order) {
      return res.status(404).json({ code: 404, msg: '工单不存在或无权查看', data: null });
    }
    const messages = await RepairOrderMessage.findAll({
      where: { orderId: order.id },
      order: [['createdAt', 'DESC']],
      limit: 200,
      attributes: ['id', 'orderId', 'actorRole', 'content', 'imageUrl', 'createdAt']
    });
    return res.status(200).json({
      code: 200,
      msg: '沟通记录查询成功',
      data: messages.reverse()
    });
  } catch (error) {
    console.error('查询工单沟通记录失败:', error);
    return res.status(500).json({ code: 500, msg: '查询沟通记录失败', data: null });
  }
};

const createOrderMessage = async (req, res) => {
  let uploadedFilename;
  try {
    const order = await getAccessibleOrder(req);
    if (!order) {
      return res.status(404).json({ code: 404, msg: '工单不存在或无权操作', data: null });
    }
    const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
    if (!content || content.length > 2000) {
      return res.status(400).json({ code: 400, msg: '补充内容必须为1至2000个字符', data: null });
    }
    if (req.file) uploadedFilename = await saveRepairImage(req.file);
    const imageUrl = uploadedFilename
      ? `${req.protocol}://${req.get('host')}/uploads/${encodeURIComponent(uploadedFilename)}`
      : null;
    const message = await sequelize.transaction(async (transaction) => {
      const createdMessage = await RepairOrderMessage.create({
        orderId: order.id,
        userId: order.userId,
        actorRole: req.user.role,
        actorId: req.user.id,
        content,
        imageUrl
      }, { transaction });
      if (req.user.role === 'admin' || req.user.role === 'maintenance') {
        await Notification.create({
          userId: order.userId,
          orderId: order.id,
          title: '工单收到新的维修回复',
          message: `工单「${order.title}」有新的沟通消息。`
        }, { transaction });
      }
      return createdMessage;
    });
    return res.status(201).json({
      code: 201,
      msg: '补充信息成功',
      data: {
        id: message.id,
        orderId: message.orderId,
        actorRole: message.actorRole,
        content: message.content,
        imageUrl: message.imageUrl,
        createdAt: message.createdAt
      }
    });
  } catch (error) {
    if (uploadedFilename) {
      try {
        await removeRepairImage(uploadedFilename);
      } catch (cleanupError) {
        console.error('清理未关联的沟通图片失败:', cleanupError);
      }
    }
    console.error('发送工单沟通消息失败:', error);
    return res.status(500).json({ code: 500, msg: '发送补充信息失败', data: null });
  }
};

module.exports = { listOrderMessages, createOrderMessage };
