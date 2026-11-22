const responseFormat = (code, msg, data = null) => ({
  code,
  msg,
  data
});

const attachResponseHelpers = (req, res, next) => {
  res.success = function success(code = 200, msg = 'success', data = null) {
    return res.status(code).json(responseFormat(code, msg, data));
  };

  res.fail = function fail(code = 500, msg = 'error', data = null) {
    return res.status(code).json(responseFormat(code, msg, data));
  };

  next();
};

const errorHandler = (err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json(responseFormat(413, '图片不能超过5MB', null));
  }
  if (err.name === 'MulterError') {
    return res.status(400).json(responseFormat(400, '图片上传请求不正确或图片数量超出限制', null));
  }

  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || '服务器内部错误';

  if (statusCode === 401) {
    return res.status(401).json(responseFormat(401, 'token已过期，请重新登录', null));
  }

  if (statusCode === 403) {
    return res.status(403).json(responseFormat(403, '无权限，只有管理员才能访问', null));
  }

  if (statusCode === 404) {
    return res.status(404).json(responseFormat(404, '请求资源不存在', null));
  }

  return res.status(statusCode).json(responseFormat(statusCode, message, null));
};

module.exports = {
  attachResponseHelpers,
  errorHandler
};
