// 小程序全局入口：统一保存当前登录用户信息。
App({
  globalData: {
    userInfo: null
  },

  onLaunch() {
    this.globalData.userInfo = wx.getStorageSync('userInfo') || null;
  }
});
