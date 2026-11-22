const api = require('../../utils/request');

const STATUS_DISPLAY = {
  0: { text: '待处理', className: 'pending' },
  1: { text: '维修中', className: 'processing' },
  2: { text: '已完成', className: 'finished' },
  3: { text: '已撤销', className: 'cancelled' },
  待处理: { text: '待处理', className: 'pending' },
  处理中: { text: '维修中', className: 'processing' },
  已完成: { text: '已完成', className: 'finished' },
  已撤销: { text: '已撤销', className: 'cancelled' },
  pending: { text: '待处理', className: 'pending' },
  processing: { text: '维修中', className: 'processing' },
  finished: { text: '已完成', className: 'finished' },
  cancelled: { text: '已撤销', className: 'cancelled' }
};

const formatDateTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

Page({
  data: {
    orders: [],
    allOrders: [],
    searchInput: '',
    searchKeyword: '',
    statusFilter: '',
    statusOptions: [
      { value: '', label: '全部' },
      { value: '待处理', label: '待处理' },
      { value: '处理中', label: '维修中' },
      { value: '已完成', label: '已完成' },
      { value: '已撤销', label: '已撤销' }
    ],
    loading: false,
    loaded: false,
    loadError: false,
    cancelingOrderId: '',
    deletingOrderId: ''
  },

  onShow() {
    if (!wx.getStorageSync('token')) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    this.loadOrders();
  },

  onPullDownRefresh() {
    this.loadOrders().finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  async loadOrders() {
    if (this.data.loading) return;
    this.setData({ loading: true });

    try {
      // 此接口只返回当前 token 对应用户的工单，不调用管理员接口。
      const result = await api.get('/api/order/my');
      if (!Array.isArray(result.data)) {
        throw new Error('工单列表数据格式错误');
      }

      const orders = result.data;
      const formattedOrders = orders.map((order) => {
        const statusInfo = STATUS_DISPLAY[order.status] || {
          text: order.status || '未知状态',
          className: 'pending'
        };

        return {
          ...order,
          statusText: statusInfo.text,
          statusClass: statusInfo.className,
          canCancel: ['待处理', 'pending', 0, '0'].includes(order.status),
          canDelete: ['已完成', 'finished', 2, '2', '已撤销', 'cancelled', 3, '3'].includes(order.status),
          displayTime: formatDateTime(order.createdAt),
          expectedTime: formatDateTime(order.expectedCompletionAt)
        };
      });

      this.setData({
        allOrders: formattedOrders,
        orders: this.filterOrders(formattedOrders, this.data.searchKeyword, this.data.statusFilter),
        loadError: false
      });
    } catch (error) {
      this.setData({ loadError: true });
      if (error && !error.requestHandled) {
        wx.showToast({ title: error.message || '工单列表加载失败', icon: 'none' });
      }
    } finally {
      this.setData({ loading: false, loaded: true });
    }
  },

  handleRefresh() {
    this.loadOrders();
  },

  filterOrders(orders, keyword, statusFilter = this.data.statusFilter) {
    const normalizedKeyword = keyword.trim().toLocaleLowerCase();
    const statusAliases = {
      待处理: ['待处理', 'pending', '0'],
      处理中: ['处理中', '维修中', 'processing', '1'],
      已完成: ['已完成', 'finished', '2'],
      已撤销: ['已撤销', 'cancelled', '3']
    };
    return orders.filter((order) => {
      const matchesStatus = !statusFilter ||
        (statusAliases[statusFilter] || [statusFilter]).includes(String(order.status));
      const matchesKeyword = !normalizedKeyword || [
        order.title,
        order.location,
        order.desc,
        order.aiCategory
      ].some((value) => String(value || '').toLocaleLowerCase().includes(normalizedKeyword));
      return matchesStatus && matchesKeyword;
    });
  },

  handleStatusFilter(event) {
    const statusFilter = event.currentTarget.dataset.status;
    this.setData({
      statusFilter,
      orders: this.filterOrders(this.data.allOrders, this.data.searchKeyword, statusFilter)
    });
  },

  handleSearchInput(event) {
    this.setData({ searchInput: event.detail.value });
  },

  handleSearch() {
    const searchKeyword = this.data.searchInput.trim();
    this.setData({
      searchKeyword,
      orders: this.filterOrders(this.data.allOrders, searchKeyword, this.data.statusFilter)
    });
  },

  handleClearSearch() {
    this.setData({
      searchInput: '',
      searchKeyword: '',
      orders: this.filterOrders(this.data.allOrders, '', this.data.statusFilter)
    });
  },

  handleCancel(event) {
    const { id } = event.currentTarget.dataset;
    if (id === undefined || id === null || id === '') {
      wx.showToast({ title: '工单编号无效', icon: 'none' });
      return;
    }
    if (this.data.cancelingOrderId) return;

    wx.showModal({
      title: '撤销报修工单',
      content: '确定撤销这条待处理工单吗？撤销后仍可在工单列表中查看。',
      confirmText: '确认撤销',
      confirmColor: '#e5484d',
      success: async (result) => {
        if (!result.confirm) return;

        this.setData({ cancelingOrderId: String(id) });
        try {
          await api.post(`/api/order/${encodeURIComponent(id)}/cancel`);
          wx.showToast({ title: '工单已撤销', icon: 'success' });
          await this.loadOrders();
        } catch (error) {
          if (error && !error.requestHandled) {
            wx.showToast({ title: error.message || '撤销失败，请重试', icon: 'none' });
          }
        } finally {
          this.setData({ cancelingOrderId: '' });
        }
      }
    });
  },

  handleDelete(event) {
    const { id, title } = event.currentTarget.dataset;
    if (id === undefined || id === null || id === '') {
      wx.showToast({ title: '工单编号无效', icon: 'none' });
      return;
    }
    if (this.data.deletingOrderId || this.data.cancelingOrderId) return;

    wx.showModal({
      title: '删除工单',
      content: `确定从列表删除工单“${title || id}”吗？删除后将无法在小程序中查看。`,
      confirmText: '确认删除',
      confirmColor: '#e5484d',
      success: async (result) => {
        if (!result.confirm) return;

        this.setData({ deletingOrderId: String(id) });
        try {
          await api.delete(`/api/order/${encodeURIComponent(id)}/my`);
          wx.showToast({ title: '工单已删除', icon: 'success' });
          await this.loadOrders();
        } catch (error) {
          if (error && !error.requestHandled) {
            wx.showToast({ title: error.message || '删除失败，请重试', icon: 'none' });
          }
        } finally {
          this.setData({ deletingOrderId: '' });
        }
      }
    });
  },

  // 仅根据本人列表中的工单 id 打开只读详情。
  handleOpenDetail(event) {
    const { id } = event.currentTarget.dataset;
    if (id === undefined || id === null || id === '') {
      wx.showToast({ title: '工单编号无效', icon: 'none' });
      return;
    }

    wx.navigateTo({
      url: `/pages/order-detail/order-detail?id=${encodeURIComponent(id)}`
    });
  }
});
