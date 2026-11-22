const api = require('../../utils/request');

const STATUS_TEXT = {
  待处理: '待处理',
  处理中: '维修中',
  已完成: '已完成',
  已撤销: '已撤销',
  pending: '待处理',
  processing: '维修中',
  finished: '已完成',
  cancelled: '已撤销',
  0: '待处理',
  1: '维修中',
  2: '已完成',
  3: '已撤销'
};

const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
};

Page({
  data: {
    nickname: '',
    wxUserId: '',
    phone: '',
    avatarUrl: '',
    memberSince: '—',
    avatarText: '用',
    loading: true,
    saving: false,
    uploadingAvatar: false,
    refreshing: false,
    unreadCount: 0,
    orderStats: {
      total: 0,
      pending: 0,
      processing: 0,
      finished: 0
    },
    recentOrders: []
  },

  onShow() {
    this.loadPageData();
  },

  async loadPageData() {
    if (this.data.refreshing) return;
    this.setData({ refreshing: true });
    await Promise.all([
      this.loadProfile(),
      this.loadOrderSummary(),
      this.loadUnreadCount()
    ]);
    this.setData({ loading: false, refreshing: false });
  },

  async loadProfile() {
    try {
      const result = await api.get('/api/user/profile');
      const nickname = result.data.nickname || '微信用户';
      this.setData({
        nickname,
        wxUserId: result.data.id || '',
        phone: result.data.phone || '',
        avatarUrl: result.data.avatarUrl || '',
        memberSince: formatDate(result.data.createdAt),
        avatarText: nickname.slice(0, 1)
      });
    } catch (error) {
      if (error && !error.requestHandled) {
        wx.showToast({ title: error.message || '资料加载失败', icon: 'none' });
      }
    }
  },

  async loadOrderSummary() {
    try {
      const result = await api.get('/api/order/my');
      if (!Array.isArray(result.data)) throw new Error('工单列表数据格式错误');
      const orders = result.data;
      const orderStats = {
        total: orders.length,
        pending: orders.filter((order) => ['待处理', 'pending', 0, '0'].includes(order.status)).length,
        processing: orders.filter((order) => ['处理中', '维修中', 'processing', 1, '1'].includes(order.status)).length,
        finished: orders.filter((order) => ['已完成', 'finished', 2, '2'].includes(order.status)).length
      };
      const recentOrders = orders.slice(0, 3).map((order) => ({
        ...order,
        statusText: STATUS_TEXT[order.status] || '状态未知',
        dateText: formatDate(order.createdAt)
      }));
      this.setData({ orderStats, recentOrders });
    } catch (error) {
      if (error && !error.requestHandled) {
        wx.showToast({ title: error.message || '工单概览加载失败', icon: 'none' });
      }
    }
  },

  async loadUnreadCount() {
    try {
      const result = await api.get('/api/notifications/my');
      this.setData({ unreadCount: Number(result.data?.unreadCount) || 0 });
    } catch (error) {
      if (error && !error.requestHandled) {
        wx.showToast({ title: error.message || '通知状态加载失败', icon: 'none' });
      }
    }
  },

  handleInput(event) {
    this.setData({ [event.currentTarget.dataset.field]: event.detail.value });
  },

  chooseAvatar() {
    if (this.data.uploadingAvatar) return;
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: async (result) => {
        const filePath = result.tempFilePaths[0];
        if (!filePath) return;
        this.setData({ uploadingAvatar: true });
        try {
          const response = await api.uploadFile('/api/user/profile/avatar', filePath);
          const avatarUrl = response.data && response.data.avatarUrl;
          if (!avatarUrl) throw new Error('服务器未返回头像地址');
          const userInfo = wx.getStorageSync('userInfo') || {};
          const updatedUserInfo = { ...userInfo, avatarUrl };
          wx.setStorageSync('userInfo', updatedUserInfo);
          getApp().globalData.userInfo = updatedUserInfo;
          this.setData({ avatarUrl });
          wx.showToast({ title: '头像上传成功', icon: 'success' });
        } catch (error) {
          if (error && !error.requestHandled) {
            wx.showToast({ title: error.message || '头像上传失败', icon: 'none' });
          }
        } finally {
          this.setData({ uploadingAvatar: false });
        }
      },
      fail: (error) => {
        if (!error.errMsg || !error.errMsg.includes('cancel')) {
          wx.showToast({ title: '选择头像失败，请重试', icon: 'none' });
        }
      }
    });
  },

  async saveProfile() {
    const nickname = this.data.nickname.trim();
    const phone = this.data.phone.trim();
    if (!nickname) {
      wx.showToast({ title: '请填写昵称', icon: 'none' });
      return;
    }
    if (phone && !/^[0-9+\-\s()]{7,20}$/.test(phone)) {
      wx.showToast({ title: '请输入有效的联系电话', icon: 'none' });
      return;
    }
    if (this.data.saving) return;
    this.setData({ saving: true });
    try {
      const result = await api.put('/api/user/profile', { nickname, phone });
      const userInfo = wx.getStorageSync('userInfo') || {};
      const updatedUserInfo = { ...userInfo, ...result.data };
      wx.setStorageSync('userInfo', updatedUserInfo);
      getApp().globalData.userInfo = updatedUserInfo;
      this.setData({ avatarText: nickname.slice(0, 1) });
      wx.showToast({ title: '资料已保存', icon: 'success' });
    } catch (error) {
      if (error && !error.requestHandled) {
        wx.showToast({ title: error.message || '资料保存失败', icon: 'none' });
      }
    } finally {
      this.setData({ saving: false });
    }
  },

  logout() {
    wx.showModal({
      title: '退出登录',
      content: '确定退出当前账号吗？本机保存的报修草稿不会删除。',
      confirmText: '退出登录',
      confirmColor: '#d9534f',
      success: (result) => {
        if (!result.confirm) return;
        wx.removeStorageSync('token');
        wx.removeStorageSync('userInfo');
        getApp().globalData.userInfo = null;
        wx.reLaunch({ url: '/pages/login/login' });
      }
    });
  },

  openMyOrders() {
    wx.switchTab({ url: '/pages/myorder/myorder' });
  },

  openSubmit() {
    wx.switchTab({ url: '/pages/submit/submit' });
  },

  openNotifications() {
    wx.navigateTo({ url: '/pages/notifications/notifications' });
  },

  openRecentOrder(event) {
    const id = event.currentTarget.dataset.id;
    if (id === undefined || id === null || id === '') return;
    wx.navigateTo({
      url: `/pages/order-detail/order-detail?id=${encodeURIComponent(id)}`
    });
  }
});
