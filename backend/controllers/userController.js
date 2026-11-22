const { User } = require('../models');
const { removeRepairImage, saveRepairImage } = require('../middleware/repairImageUpload');

const getMyProfile = async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ code: 403, msg: '无权访问用户资料', data: null });
    }
    const user = await User.findByPk(req.user.id, {
      attributes: ['id', 'nickname', 'phone', 'avatarUrl', 'createdAt']
    });
    if (!user) {
      return res.status(404).json({ code: 404, msg: '用户资料不存在', data: null });
    }
    return res.status(200).json({ code: 200, msg: '资料查询成功', data: user });
  } catch (error) {
    console.error('查询用户资料失败:', error);
    return res.status(500).json({ code: 500, msg: '查询用户资料失败', data: null });
  }
};

const uploadMyAvatar = async (req, res) => {
  let filename;
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ code: 403, msg: '无权修改用户头像', data: null });
    }
    if (!req.file) {
      return res.status(400).json({ code: 400, msg: '请选择头像图片', data: null });
    }
    const user = await User.findByPk(req.user.id);
    if (!user) {
      return res.status(404).json({ code: 404, msg: '用户资料不存在', data: null });
    }
    filename = await saveRepairImage(req.file);
    user.avatarUrl = `${req.protocol}://${req.get('host')}/uploads/${encodeURIComponent(filename)}`;
    await user.save();
    return res.status(200).json({
      code: 200,
      msg: '头像上传成功',
      data: { avatarUrl: user.avatarUrl }
    });
  } catch (error) {
    if (filename) {
      try {
        await removeRepairImage(filename);
      } catch (cleanupError) {
        console.error('清理未关联的用户头像失败:', cleanupError);
      }
    }
    console.error('上传用户头像失败:', error);
    return res.status(500).json({ code: 500, msg: '头像上传失败', data: null });
  }
};

const updateMyProfile = async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ code: 403, msg: '无权修改用户资料', data: null });
    }
    const { nickname, phone } = req.body || {};
    if (typeof nickname !== 'string' || nickname.trim().length < 1 || nickname.trim().length > 64) {
      return res.status(400).json({ code: 400, msg: '昵称必须为1至64个字符', data: null });
    }
    if (typeof phone !== 'string' || phone.trim().length > 20 ||
        (phone.trim() && !/^[0-9+\-\s()]{7,20}$/.test(phone.trim()))) {
      return res.status(400).json({ code: 400, msg: '联系电话格式无效', data: null });
    }
    const user = await User.findByPk(req.user.id);
    if (!user) {
      return res.status(404).json({ code: 404, msg: '用户资料不存在', data: null });
    }
    user.nickname = nickname.trim();
    user.phone = phone.trim() || null;
    await user.save();
    return res.status(200).json({
      code: 200,
      msg: '资料更新成功',
      data: { id: user.id, nickname: user.nickname, phone: user.phone }
    });
  } catch (error) {
    console.error('更新用户资料失败:', error);
    return res.status(500).json({ code: 500, msg: '更新用户资料失败', data: null });
  }
};

module.exports = { getMyProfile, updateMyProfile, uploadMyAvatar };
