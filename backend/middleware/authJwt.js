const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../config/security');

const responseFormat = (code, msg, data = null) => ({
  code,
  msg,
  data
});

const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json(
      responseFormat(401, '缺少 Authorization 头，未提供 token', null)
    );
  }

  const parts = authHeader.split(' ');

  if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1]) {
    return res.status(401).json(
      responseFormat(401, 'token格式错误，需使用 Bearer token', null)
    );
  }

  const token = parts[1];

  try {
    const decoded = jwt.verify(token, getJwtSecret());
    req.user = decoded;
    return next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json(
        responseFormat(401, 'token已过期，请重新登录', null)
      );
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json(
        responseFormat(401, 'token无效或已被篡改', null)
      );
    }

    if (error.name === 'NotBeforeError') {
      return res.status(401).json(
        responseFormat(401, 'token尚未生效', null)
      );
    }

    return res.status(401).json(
      responseFormat(401, 'token验证失败', null)
    );
  }
};

const isAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json(
      responseFormat(401, '用户未登录或 token 未解析', null)
    );
  }

  const userRole = req.user.role || req.user.userRole;

  if (userRole !== 'admin') {
    return res.status(403).json(
      responseFormat(403, '无权限，只有管理员才能访问', null)
    );
  }

  return next();
};

const isMaintenance = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json(
      responseFormat(401, '用户未登录或 token 未解析', null)
    );
  }

  if (req.user.role !== 'maintenance' ||
      !Number.isSafeInteger(Number(req.user.staffId)) ||
      Number(req.user.staffId) <= 0) {
    return res.status(403).json(
      responseFormat(403, '无权限，只有维修人员才能访问', null)
    );
  }

  return next();
};

module.exports = {
  verifyToken,
  isAdmin,
  isMaintenance
};
