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
  if (!value) return '暂无';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const HISTORY_LABELS = {
  created: '工单已提交',
  status: '处理状态更新',
  assignment: '维修任务已分派',
  note: '维修备注更新'
};

const formatUserFacingText = (value) => typeof value === 'string'
  ? value.replace(/学生/g, '用户')
  : value;

Page({
  data: {
    order: null,
    loading: true,
    selectedRating: 0,
    reviewComment: '',
    submittingReview: false,
    reopenReason: '',
    submittingRequest: false,
    messages: [],
    messageInput: '',
    messageImagePath: '',
    sendingMessage: false,
    feedbackTypes: [
      { value: 'quality', label: '维修质量' },
      { value: 'communication', label: '沟通服务' },
      { value: 'speed', label: '处理速度' },
      { value: 'result', label: '问题解决' },
      { value: 'other', label: '其他' }
    ],
    feedbackTypeIndex: 0
  },

  // 详情数据始终从后端按工单 id 获取，后端会校验工单归属。
  onLoad(options) {
    const id = options.id;
    if (!id) {
      wx.showToast({ title: '工单编号无效', icon: 'none' });
      this.setData({ loading: false });
      return;
    }

    this.loadOrder(id);
  },

  async loadOrder(id) {
    try {
      const result = await api.get(`/api/order/${encodeURIComponent(id)}`);
      const order = result.data;
      if (!order || typeof order !== 'object') {
        throw new Error('工单详情数据格式错误');
      }

      const status = STATUS_DISPLAY[order.status] || {
        text: order.status || '未知状态',
        className: 'pending'
      };

      this.setData({
        order: {
          ...order,
          statusText: status.text,
          statusClass: status.className,
          isCompleted: ['已完成', 'finished', 2, '2'].includes(order.status),
          isConfirmed: Boolean(order.studentConfirmedAt),
          displayTime: formatDateTime(order.createdAt),
          expectedTime: formatDateTime(order.expectedCompletionAt),
          feedbackTypeLabel: {
            quality: '维修质量',
            communication: '沟通服务',
            speed: '处理速度',
            result: '问题解决',
            other: '其他'
          }[order.review && order.review.feedbackType] || '',
          ratingValues: [1, 2, 3, 4, 5],
          history: (order.history || []).map((event) => ({
            ...event,
            displayTime: formatDateTime(event.createdAt),
            remark: formatUserFacingText(event.remark),
            eventLabel: HISTORY_LABELS[event.eventType] || '工单进度更新'
          }))
        }
      });
      this.loadMessages(id);
    } catch (error) {
      // 请求失败由请求工具统一提示；本地数据格式异常需要单独告知用户。
      if (error && !error.requestHandled) {
        wx.showToast({ title: error.message || '工单详情加载失败', icon: 'none' });
      }
    } finally {
      this.setData({ loading: false });
    }
  },

  async loadMessages(id) {
    try {
      const result = await api.get(`/api/order/${encodeURIComponent(id)}/messages`);
      this.setData({
        messages: (Array.isArray(result.data) ? result.data : []).map((message) => ({
          ...message,
          senderLabel: message.actorRole === 'admin' ? '维修人员' : '我',
          displayTime: formatDateTime(message.createdAt)
        }))
      });
    } catch (error) {
      if (error && !error.requestHandled) {
        wx.showToast({ title: error.message || '沟通记录加载失败', icon: 'none' });
      }
    }
  },

  previewRepairImage() {
    const imageUrl = this.data.order && this.data.order.imgUrl;
    if (!imageUrl) return;
    wx.previewImage({ current: imageUrl, urls: [imageUrl] });
  },

  previewCompletionImage() {
    const imageUrl = this.data.order && this.data.order.completionImgUrl;
    if (imageUrl) wx.previewImage({ current: imageUrl, urls: [imageUrl] });
  },

  previewMessageImage(event) {
    const imageUrl = event.currentTarget.dataset.url;
    if (imageUrl) wx.previewImage({ current: imageUrl, urls: [imageUrl] });
  },

  openOrderMap() {
    const order = this.data.order;
    if (!order || order.latitude === null || order.latitude === undefined ||
        order.longitude === null || order.longitude === undefined) return;
    wx.openLocation({
      latitude: Number(order.latitude),
      longitude: Number(order.longitude),
      name: order.mapAddress || order.location,
      address: order.mapAddress || order.location,
      scale: 18
    });
  },

  handleSelectRating(event) {
    this.setData({ selectedRating: Number(event.currentTarget.dataset.rating) });
  },

  handleReviewInput(event) {
    this.setData({ reviewComment: event.detail.value });
  },

  handleReopenReasonInput(event) {
    this.setData({ reopenReason: event.detail.value });
  },

  handleMessageInput(event) {
    this.setData({ messageInput: event.detail.value });
  },

  chooseMessageImage() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (result) => this.setData({ messageImagePath: result.tempFilePaths[0] || '' }),
      fail: (error) => {
        if (!error.errMsg || !error.errMsg.includes('cancel')) {
          wx.showToast({ title: '选择图片失败，请重试', icon: 'none' });
        }
      }
    });
  },

  removeMessageImage() {
    this.setData({ messageImagePath: '' });
  },

  async sendMessage() {
    const content = this.data.messageInput.trim();
    if (!content) {
      wx.showToast({ title: '请填写补充内容', icon: 'none' });
      return;
    }
    if (this.data.sendingMessage) return;
    this.setData({ sendingMessage: true });
    try {
      const url = `/api/order/${encodeURIComponent(this.data.order.id)}/messages`;
      if (this.data.messageImagePath) {
        await api.uploadFile(url, this.data.messageImagePath, { content });
      } else {
        await api.post(url, { content });
      }
      this.setData({ messageInput: '', messageImagePath: '' });
      await this.loadMessages(this.data.order.id);
      wx.showToast({ title: '补充信息已发送', icon: 'success' });
    } catch (error) {
      if (error && !error.requestHandled) {
        wx.showToast({ title: error.message || '发送失败，请重试', icon: 'none' });
      }
    } finally {
      this.setData({ sendingMessage: false });
    }
  },

  handleFeedbackTypeChange(event) {
    this.setData({ feedbackTypeIndex: Number(event.detail.value) });
  },

  async confirmCompletion() {
    const id = this.data.order && this.data.order.id;
    if (!id) return;
    try {
      await api.post(`/api/order/${encodeURIComponent(id)}/confirm-completion`, {});
      wx.showToast({ title: '已确认完成', icon: 'success' });
      await this.loadOrder(id);
    } catch (error) {
      if (error && !error.requestHandled) {
        wx.showToast({ title: error.message || '确认失败', icon: 'none' });
      }
    }
  },

  async requestReopen() {
    if (this.data.submittingRequest) return;
    const reason = this.data.reopenReason.trim();
    if (!reason) {
      wx.showToast({ title: '请填写未解决的问题', icon: 'none' });
      return;
    }
    this.setData({ submittingRequest: true });
    try {
      const id = this.data.order.id;
      await api.post(`/api/order/${encodeURIComponent(id)}/reopen-request`, { reason });
      wx.showToast({ title: '已申请重新处理', icon: 'success' });
      await this.loadOrder(id);
    } catch (error) {
      if (error && !error.requestHandled) {
        wx.showToast({ title: error.message || '申请失败', icon: 'none' });
      }
    } finally {
      this.setData({ submittingRequest: false });
    }
  },

  async submitReview() {
    if (this.data.submittingReview) return;
    if (!this.data.selectedRating) {
      wx.showToast({ title: '请先选择评分', icon: 'none' });
      return;
    }

    this.setData({ submittingReview: true });
    try {
      const id = this.data.order.id;
      await api.post(`/api/order/${encodeURIComponent(id)}/review`, {
        rating: this.data.selectedRating,
        comment: this.data.reviewComment.trim(),
        feedbackType: this.data.feedbackTypes[this.data.feedbackTypeIndex].value
      });
      wx.showToast({ title: '评价提交成功', icon: 'success' });
      await this.loadOrder(id);
    } catch (error) {
      if (error && !error.requestHandled) {
        wx.showToast({ title: error.message || '评价提交失败', icon: 'none' });
      }
    } finally {
      this.setData({ submittingReview: false });
    }
  }
});
