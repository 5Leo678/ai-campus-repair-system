const api = require('../../utils/request');

const formatDateTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
};

Page({
  data: {
    notifications: [],
    loading: true
  },

  onLoad() {
    this.loadNotifications();
  },

  async loadNotifications() {
    try {
      const result = await api.get('/api/notifications/my');
      const notifications = result.data.list.map((item) => ({
        ...item,
        displayTime: formatDateTime(item.createdAt)
      }));
      this.setData({ notifications });
    } catch (error) {
      if (error && !error.requestHandled) {
        wx.showToast({ title: error.message || '消息加载失败', icon: 'none' });
      }
    } finally {
      this.setData({ loading: false });
    }
  },

  async openNotification(event) {
    const { id, orderId } = event.currentTarget.dataset;
    try {
      await api.request({
        url: `/api/notifications/${encodeURIComponent(id)}/read`,
        method: 'PUT'
      });
    } catch (error) {
      if (error && !error.requestHandled) {
        wx.showToast({ title: error.message || '消息更新失败', icon: 'none' });
      }
      return;
    }

    if (orderId) {
      wx.navigateTo({
        url: `/pages/order-detail/order-detail?id=${encodeURIComponent(orderId)}`
      });
    } else {
      this.loadNotifications();
    }
  }
});
