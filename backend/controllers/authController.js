const jwt = require('jsonwebtoken');
const axios = require('axios');
const bcrypt = require('bcrypt');
const { User, AdminUser } = require('../models');
const { getJwtSecret } = require('../config/security');

const getOpenidFromCode = async (code) => {
  const { WX_APPID, WX_APP_SECRET } = process.env;
  if (!WX_APPID || !WX_APP_SECRET) {
    throw new Error('微信登录未配置 WX_APPID 或 WX_APP_SECRET');
  }

  const response = await axios.get('https://api.weixin.qq.com/sns/jscode2session', {
    params: {
      appid: WX_APPID,
      secret: WX_APP_SECRET,
      js_code: code,
      grant_type: 'authorization_code'
    },
    timeout: 10000
  });

  if (!response.data.openid || response.data.errcode) {
    throw new Error(`微信登录凭证校验失败: ${response.data.errmsg || '未返回 openid'}`);
  }

  return response.data.openid;
};

const login = async (req, res) => {
  try {
    const { code, nickname, phone } = req.body || {};
    const openid = code ? await getOpenidFromCode(code) : null;

    if (!openid || !String(openid).trim()) {
      return res.status(400).json({
        code: 400,
        msg: '微信登录 code 不能为空',
        data: null
      });
    }

    let user = await User.findOne({ where: { openid } });

    if (!user) {
      user = await User.create({
        openid,
        nickname: nickname || '微信用户',
        phone: phone || null,
        role: 'student'
      });
    } else {
      if (nickname) user.nickname = nickname;
      if (phone) user.phone = phone;
      await user.save();
    }

    const token = jwt.sign(
      {
        id: user.id,
        openid: user.openid,
        role: user.role,
        nickname: user.nickname
      },
      getJwtSecret(),
      {
        expiresIn: '7d'
      }
    );

    return res.status(200).json({
      code: 200,
      msg: '登录成功',
      data: {
        token,
        user: {
          id: user.id,
          openid: user.openid,
          nickname: user.nickname,
          phone: user.phone,
          role: user.role
        }
      }
    });
  } catch (error) {
    console.error('微信登录失败:', error);
    return res.status(500).json({
      code: 500,
      msg: '登录失败',
      data: null
    });
  }
};

module.exports = {
  login
};

// 管理员账号密码登录
const adminLogin = async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string' ||
        !username.trim() || !password || Buffer.byteLength(password, 'utf8') > 72) {
      return res.status(400).json({
        code: 400,
        msg: '请输入有效的管理员账号和密码',
        data: null
      });
    }

    const admin = await AdminUser.findOne({
      where: { username: username.trim() }
    });
    const passwordMatches = admin
      ? await bcrypt.compare(password, admin.password)
      : false;

    if (!admin || !passwordMatches) {
      return res.status(401).json({
        code: 401,
        msg: '账号或密码错误',
        data: null
      });
    }

    const token = jwt.sign(
      {
        id: admin.id,
        username: admin.username,
        role: 'admin',
        name: admin.name
      },
      getJwtSecret(),
      { expiresIn: '7d' }
    );
    return res.status(200).json({
      code: 200,
      msg: '管理员登录成功',
      data: {
        token,
        user: {
          id: admin.id,
          username: admin.username,
          name: admin.name,
          role: 'admin'
        }
      }
    });
  } catch (error) {
    console.error('管理员登录失败：', error);
    return res.status(500).json({
      code: 500,
      msg: '管理员登录失败',
      data: null
    });
  }
};

module.exports = {
  login,
  adminLogin
};
