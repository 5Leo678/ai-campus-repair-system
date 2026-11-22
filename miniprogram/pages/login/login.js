const api = require('../../utils/request');

Page({
  data: {
    loading: false
  },

  onShow() {
    const token = wx.getStorageSync('token');
    if (token) {
      wx.switchTab({ url: '/pages/submit/submit' });
    }
  },

  // wx.login 获取的一次性 code 交由后端换取 openid，客户端不接触 appSecret。
  handleWechatLogin() {
    if (this.data.loading) return;
    this.setData({ loading: true });

    wx.login({
      success: (loginResult) => {
        if (!loginResult.code) {
          this.setData({ loading: false });
          wx.showToast({ title: '获取微信登录凭证失败', icon: 'none' });
          return;
        }

        api.post('/api/auth/login', {
          code: loginResult.code,
          nickname: '微信用户'
        }).then((result) => {
          const loginData = result.data || {};
          if (!loginData.token) {
            throw new Error('登录成功响应中未包含 token');
          }

          wx.setStorageSync('token', loginData.token);
          wx.setStorageSync('userInfo', loginData.user || null);

          const app = getApp();
          app.globalData.userInfo = loginData.user || null;

          wx.switchTab({ url: '/pages/submit/submit' });
        }).catch((error) => {
          // 网络或业务错误由请求工具统一提示；此处只处理响应结构异常。
          if (error && error.message && !error.requestHandled) {
            wx.showToast({ title: error.message, icon: 'none' });
          }
        }).finally(() => {
          this.setData({ loading: false });
        });
      },
      fail: () => {
        this.setData({ loading: false });
        wx.showToast({ title: '微信登录失败，请重试', icon: 'none' });
      }
    });
  }
});
