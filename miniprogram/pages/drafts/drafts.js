const draftStorage = require('../../utils/draftStorage');

const formatDateTime = (value) => {
  if (!value) return '保存时间未知';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '保存时间未知';
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

Page({
  data: {
    drafts: [],
    loading: true
  },

  onLoad() {
    if (!wx.getStorageSync('token')) {
      wx.reLaunch({ url: '/pages/login/login' });
    }
  },

  onShow() {
    if (wx.getStorageSync('token')) this.loadDrafts();
  },

  loadDrafts() {
    try {
      const drafts = draftStorage.getDrafts().map((draft) => ({
        ...draft,
        displayTitle: draft.title || draft.desc || '未命名报修草稿',
        displayLocation: [draft.building, draft.floor && `${draft.floor}层`, draft.room]
          .filter(Boolean)
          .join(' ') || draft.mapAddress || '尚未填写报修地点',
        displayDescription: draft.desc || '尚未填写故障描述',
        displayTime: formatDateTime(draft.savedAt),
        hasImage: Boolean(draft.imagePath && draft.imageIsSaved)
      }));
      this.setData({ drafts, loading: false });
    } catch (error) {
      console.error('读取本地报修草稿失败:', error);
      this.setData({ loading: false });
      wx.showToast({ title: '读取草稿失败，请重试', icon: 'none' });
    }
  },

  continueDraft(event) {
    const { id } = event.currentTarget.dataset;
    if (!id) return;
    draftStorage.setActiveDraftId(id);
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
      return;
    }
    wx.switchTab({ url: '/pages/submit/submit' });
  },

  createDraft() {
    draftStorage.setActiveDraftId('');
    wx.switchTab({ url: '/pages/submit/submit' });
  },

  deleteDraft(event) {
    const { id } = event.currentTarget.dataset;
    if (!id) return;
    const draft = draftStorage.getDraftById(id);
    wx.showModal({
      title: '删除草稿',
      content: `确定删除“${draft?.title || '未命名报修草稿'}”吗？`,
      confirmText: '删除',
      confirmColor: '#e5484d',
      success: (result) => {
        if (!result.confirm) return;
        if (draft && draft.imageIsSaved && draft.imagePath) {
          wx.removeSavedFile({
            filePath: draft.imagePath,
            fail: (error) => console.warn('清理草稿图片失败:', error)
          });
        }
        draftStorage.removeDraft(id);
        this.loadDrafts();
        wx.showToast({ title: '草稿已删除', icon: 'success' });
      }
    });
  }
});
