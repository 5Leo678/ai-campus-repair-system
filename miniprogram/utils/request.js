// 所有后端请求统一经过此处：拼接基础地址、注入 token、处理错误和 401。
const BASE_URL = 'http://localhost:3000/api';
const TOKEN_KEY = 'token';

let redirectingToLogin = false;

const buildRequestUrl = (url) => `${BASE_URL}${url.replace(/^\/api(?=\/|$)/, '')}`;

const showErrorToast = (message) => {
  wx.showToast({
    title: message || '请求失败，请稍后重试',
    icon: 'none',
    duration: 2500
  });
};

const createHandledError = (message, sourceError) => {
  const error = new Error(message);
  error.requestHandled = true;
  if (sourceError) error.sourceError = sourceError;
  return error;
};

const redirectToLogin = () => {
  if (redirectingToLogin) return;
  redirectingToLogin = true;
  wx.removeStorageSync(TOKEN_KEY);
  wx.removeStorageSync('userInfo');

  wx.reLaunch({
    url: '/pages/login/login',
    complete: () => {
      setTimeout(() => {
        redirectingToLogin = false;
      }, 1000);
    }
  });
};

const request = ({ url, method = 'GET', data = {}, header = {} }) => new Promise((resolve, reject) => {
  const token = wx.getStorageSync(TOKEN_KEY);
  const requestHeader = {
    'content-type': 'application/json',
    ...header
  };

  if (token) {
    requestHeader.Authorization = `Bearer ${token}`;
  }

  wx.request({
    url: buildRequestUrl(url),
    method,
    data,
    header: requestHeader,
    success: (response) => {
      const body = response.data || {};
      const code = Number(body.code || response.statusCode);

      if (response.statusCode === 401 || code === 401) {
        showErrorToast(body.msg || '登录状态已失效，请重新登录');
        redirectToLogin();
        reject(createHandledError(body.msg || '未登录'));
        return;
      }

      if (response.statusCode < 200 || response.statusCode >= 300 ||
          (body.code !== undefined && ![200, 201].includes(Number(body.code)))) {
        const message = body.msg || '请求失败，请稍后重试';
        showErrorToast(message);
        reject(createHandledError(message));
        return;
      }

      resolve(body);
    },
    fail: (error) => {
      const message = error.errMsg || '网络连接失败，请检查服务地址和网络';
      showErrorToast(message);
      reject(createHandledError(message, error));
    }
  });
});

const uploadFile = (url, filePath, formData = {}) => new Promise((resolve, reject) => {
  const token = wx.getStorageSync(TOKEN_KEY);
  const header = {};

  if (token) {
    header.Authorization = `Bearer ${token}`;
  }

  wx.uploadFile({
    url: buildRequestUrl(url),
    filePath,
    name: 'image',
    formData,
    header,
    success: (response) => {
      let body;
      try {
        body = typeof response.data === 'string'
          ? JSON.parse(response.data)
          : response.data;
      } catch (error) {
        const message = '服务器返回了无法识别的上传结果';
        showErrorToast(message);
        reject(createHandledError(message, error));
        return;
      }

      body = body || {};
      const code = Number(body.code || response.statusCode);
      if (response.statusCode === 401 || code === 401) {
        showErrorToast(body.msg || '登录状态已失效，请重新登录');
        redirectToLogin();
        reject(createHandledError(body.msg || '未登录'));
        return;
      }

      if (response.statusCode < 200 || response.statusCode >= 300 ||
          (body.code !== undefined && ![200, 201].includes(Number(body.code)))) {
        const message = body.msg || '图片上传失败，请稍后重试';
        showErrorToast(message);
        reject(createHandledError(message));
        return;
      }

      resolve(body);
    },
    fail: (error) => {
      const message = error.errMsg || '图片上传失败，请检查网络连接';
      showErrorToast(message);
      reject(createHandledError(message, error));
    }
  });
});

module.exports = {
  request,
  get: (url, data) => request({ url, method: 'GET', data }),
  post: (url, data) => request({ url, method: 'POST', data }),
  put: (url, data) => request({ url, method: 'PUT', data }),
  delete: (url, data) => request({ url, method: 'DELETE', data }),
  uploadFile
};
