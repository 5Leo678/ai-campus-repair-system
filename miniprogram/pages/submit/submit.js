const api = require('../../utils/request');
const draftStorage = require('../../utils/draftStorage');

const DEFAULT_CATEGORIES = ['水电故障', '门窗故障', '网络故障', '其他故障'];

Page({
  data: {
    building: '',
    floor: '',
    room: '',
    mapAddress: '',
    latitude: null,
    longitude: null,
    additionalDescription: '',
    desc: '',
    phone: '',
    imagePath: '',
    imageIsSaved: false,
    aiAnalysis: null,
    aiAnalyzing: false,
    categoryOptions: ['请选择故障类型', ...DEFAULT_CATEGORIES],
    buildingOptions: [],
    categoryIndex: 0,
    categoryValue: '',
    submitting: false,
    hasDraft: false,
    draftSavedAt: '',
    draftCount: 0
  },

  onShow() {
    if (!wx.getStorageSync('token')) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    this.restoreActiveDraft();
    this.loadRepairCatalog();
  },

  restoreActiveDraft() {
    const drafts = draftStorage.getDrafts();
    const activeDraftId = draftStorage.getActiveDraftId();
    const shouldRestore = !this.draftLoaded || activeDraftId !== this.loadedDraftId;
    if (shouldRestore) {
      const draft = activeDraftId ? draftStorage.getDraftById(activeDraftId) : null;
      if (draft) {
        this.setData({
          ...draft,
          hasDraft: true,
          draftSavedAt: this.formatDraftTime(draft.savedAt)
        });
      } else {
        this.resetFormFields();
      }
      this.loadedDraftId = draft ? draft.id : '';
      this.draftLoaded = true;
    }
    this.setData({
      draftCount: drafts.length,
      hasDraft: Boolean(this.loadedDraftId),
      draftSavedAt: this.loadedDraftId
        ? this.formatDraftTime(draftStorage.getDraftById(this.loadedDraftId)?.savedAt)
        : ''
    });
  },

  formatDraftTime(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (number) => String(number).padStart(2, '0');
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  },

  saveDraft(updates = {}) {
    const fields = {
      building: this.data.building,
      floor: this.data.floor,
      room: this.data.room,
      mapAddress: this.data.mapAddress,
      latitude: this.data.latitude,
      longitude: this.data.longitude,
      additionalDescription: this.data.additionalDescription,
      desc: this.data.desc,
      phone: this.data.phone,
      imagePath: this.data.imagePath,
      imageIsSaved: this.data.imageIsSaved,
      categoryIndex: this.data.categoryIndex,
      categoryValue: this.data.categoryValue,
      ...updates
    };
    if (!fields.imageIsSaved) fields.imagePath = '';
    const draft = draftStorage.saveDraft(fields);
    if (!draft) return false;
    this.loadedDraftId = draft.id;
    this.setData({
      hasDraft: true,
      draftSavedAt: this.formatDraftTime(draft.savedAt),
      draftCount: draftStorage.getDrafts().length
    });
    return draft;
  },

  handleSaveDraft() {
    if (this.data.submitting) return;
    if (this.saveDraft()) {
      wx.showToast({ title: '草稿已保存', icon: 'success' });
    } else {
      wx.showToast({ title: '当前没有可保存的内容', icon: 'none' });
    }
  },

  async handleSaveAsNewDraft() {
    if (this.data.submitting) return;
    let imagePath = '';
    let imageIsSaved = false;
    if (this.data.imageIsSaved && this.data.imagePath) {
      imagePath = await this.copySavedImage(this.data.imagePath);
      imageIsSaved = Boolean(imagePath);
      if (!imageIsSaved) {
        wx.showToast({ title: '图片未能复制到新草稿，其他内容仍可保存', icon: 'none' });
      }
    }
    const fields = {
      building: this.data.building,
      floor: this.data.floor,
      room: this.data.room,
      mapAddress: this.data.mapAddress,
      latitude: this.data.latitude,
      longitude: this.data.longitude,
      additionalDescription: this.data.additionalDescription,
      desc: this.data.desc,
      phone: this.data.phone,
      imagePath,
      imageIsSaved,
      categoryIndex: this.data.categoryIndex,
      categoryValue: this.data.categoryValue
    };
    const draft = draftStorage.saveDraft(fields, { createNew: true });
    if (!draft) {
      wx.showToast({ title: '请先填写内容再保存草稿', icon: 'none' });
      return;
    }
    this.loadedDraftId = draft.id;
    this.setData({ imagePath, imageIsSaved });
    this.setData({
      hasDraft: true,
      draftCount: draftStorage.getDrafts().length,
      draftSavedAt: this.formatDraftTime(draft.savedAt)
    });
    wx.showToast({ title: '已另存为新草稿', icon: 'success' });
  },

  copySavedImage(filePath) {
    const extension = filePath.match(/\.[a-zA-Z0-9]+$/)?.[0] || '.jpg';
    const destination = `${wx.env.USER_DATA_PATH}/repair-draft-${Date.now()}${extension}`;
    return new Promise((resolve) => {
      wx.getFileSystemManager().copyFile({
        srcPath: filePath,
        destPath: destination,
        success: () => resolve(destination),
        fail: (error) => {
          console.warn('复制草稿图片失败:', error);
          resolve('');
        }
      });
    });
  },

  resetFormFields() {
    this.setData({
      building: '',
      floor: '',
      room: '',
      mapAddress: '',
      latitude: null,
      longitude: null,
      additionalDescription: '',
      desc: '',
      phone: '',
      imagePath: '',
      imageIsSaved: false,
      aiAnalysis: null,
      categoryIndex: 0,
      categoryValue: '',
      hasDraft: false,
      draftSavedAt: ''
    });
  },

  handleClearDraft() {
    if (!this.data.hasDraft || this.data.submitting) return;
    wx.showModal({
      title: '清空报修草稿',
      content: '确定清空当前保存的报修内容吗？',
      confirmText: '清空草稿',
      confirmColor: '#e5484d',
      success: (result) => {
        if (!result.confirm) return;
        const draftId = this.loadedDraftId;
        const draft = draftId ? draftStorage.getDraftById(draftId) : null;
        if (draft) this.removeSavedImage(draft.imagePath, draft.imageIsSaved);
        const remainingDrafts = draftStorage.removeDraft(draftId);
        this.loadedDraftId = '';
        this.resetFormFields();
        this.setData({ draftCount: remainingDrafts.length });
        wx.showToast({ title: '草稿已清空', icon: 'success' });
      }
    });
  },

  async loadRepairCatalog() {
    try {
      const result = await api.get('/api/catalog');
      const entries = Array.isArray(result.data) ? result.data : [];
      const categories = entries.filter((entry) => entry.type === 'category').map((entry) => entry.value);
      const buildings = entries.filter((entry) => entry.type === 'building').map((entry) => entry.value);
      if (categories.length) {
        const selectedCategory = this.data.categoryValue ||
          this.data.categoryOptions[this.data.categoryIndex];
        const categoryOptions = ['请选择故障类型', ...categories];
        this.setData({
          categoryOptions,
          categoryIndex: Math.max(categoryOptions.indexOf(selectedCategory), 0),
          categoryValue: categoryOptions.includes(selectedCategory) ? selectedCategory : ''
        });
      }
      this.setData({ buildingOptions: buildings });
    } catch (error) {
      if (error && !error.requestHandled) {
        wx.showToast({ title: error.message || '加载报修目录失败', icon: 'none' });
      }
    }
  },

  handleInput(event) {
    const field = event.currentTarget.dataset.field;
    const updates = { [field]: event.detail.value };
    if (field === 'desc') updates.aiAnalysis = null;
    this.setData(updates);
    this.saveDraft(updates);
  },

  async analyzeDescription() {
    const description = this.data.desc.trim();
    if (!description) {
      wx.showToast({ title: '请先填写故障描述', icon: 'none' });
      return;
    }
    if (this.data.aiAnalyzing) return;

    this.setData({ aiAnalyzing: true, aiAnalysis: null });
    try {
      const response = await api.post('/api/ai/analyze', { description });
      this.setData({ aiAnalysis: response.data });
    } catch (error) {
      if (error && !error.requestHandled) {
        wx.showToast({ title: error.message || 'AI 分析失败，请稍后重试', icon: 'none' });
      }
    } finally {
      this.setData({ aiAnalyzing: false });
    }
  },

  handleCategoryChange(event) {
    const categoryIndex = Number(event.detail.value);
    const categoryValue = this.data.categoryOptions[categoryIndex] || '';
    this.setData({ categoryIndex, categoryValue });
    this.saveDraft({ categoryIndex, categoryValue });
  },

  selectBuilding(event) {
    const building = event.currentTarget.dataset.building;
    this.setData({ building });
    this.saveDraft({ building });
  },

  chooseMapLocation() {
    wx.chooseLocation({
      success: (result) => {
        const updates = {
          mapAddress: result.address || result.name || '',
          latitude: Number(result.latitude),
          longitude: Number(result.longitude)
        };
        this.setData(updates);
        this.saveDraft(updates);
      },
      fail: (error) => {
        if (!error.errMsg || !error.errMsg.includes('cancel')) {
          wx.showToast({ title: '地图选点失败，请检查定位权限', icon: 'none' });
        }
      }
    });
  },

  scanLocationCode() {
    wx.scanCode({
      onlyFromCamera: false,
      scanType: ['qrCode'],
      success: (result) => {
        const prefix = 'campus-repair-location:v1:';
        if (typeof result.result !== 'string' || !result.result.startsWith(prefix)) {
          wx.showToast({ title: '二维码不是有效的报修地点码', icon: 'none' });
          return;
        }

        try {
          const location = JSON.parse(decodeURIComponent(result.result.slice(prefix.length)));
          if (!location || typeof location !== 'object' ||
              typeof location.building !== 'string' || !location.building.trim() ||
              (location.floor !== undefined && typeof location.floor !== 'string') ||
              (location.room !== undefined && typeof location.room !== 'string') ||
              location.building.length > 100 ||
              (location.floor || '').length > 40 ||
              (location.room || '').length > 80) {
            throw new Error('地点二维码数据无效');
          }
          const updates = {
            building: location.building.trim(),
            floor: (location.floor || '').trim(),
            room: (location.room || '').trim()
          };
          this.setData(updates);
          this.saveDraft(updates);
          wx.showToast({ title: '报修地点已填入', icon: 'success' });
        } catch (error) {
          wx.showToast({ title: '地点二维码数据无效', icon: 'none' });
        }
      },
      fail: (error) => {
        if (!error.errMsg || !error.errMsg.includes('cancel')) {
          wx.showToast({ title: '扫码失败，请重试', icon: 'none' });
        }
      }
    });
  },

  handleChooseImage() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (result) => {
        const tempFilePath = result.tempFilePaths[0] || '';
        if (!tempFilePath) return;
        wx.saveFile({
          tempFilePath,
          success: (savedResult) => {
            this.removeSavedImage(this.data.imagePath, this.data.imageIsSaved);
            this.setData({
              imagePath: savedResult.savedFilePath,
              imageIsSaved: true
            });
            this.saveDraft({
              imagePath: savedResult.savedFilePath,
              imageIsSaved: true
            });
          },
          fail: () => {
            this.setData({ imagePath: tempFilePath, imageIsSaved: false });
            this.saveDraft({ imagePath: tempFilePath, imageIsSaved: false });
            wx.showToast({ title: '图片暂不能长期保存，草稿中的其他内容不受影响', icon: 'none' });
          }
        });
      },
      fail: (error) => {
        if (!error.errMsg || !error.errMsg.includes('cancel')) {
          wx.showToast({ title: '选择图片失败，请重试', icon: 'none' });
        }
      }
    });
  },

  handlePreviewImage() {
    if (!this.data.imagePath) return;
    wx.previewImage({
      current: this.data.imagePath,
      urls: [this.data.imagePath]
    });
  },

  handleRemoveImage() {
    this.removeSavedImage(this.data.imagePath, this.data.imageIsSaved);
    this.setData({ imagePath: '', imageIsSaved: false });
    this.saveDraft({ imagePath: '', imageIsSaved: false });
  },

  removeSavedImage(filePath, isSaved) {
    if (!isSaved || !filePath) return;
    wx.removeSavedFile({
      filePath,
      fail: (error) => {
        console.warn('清理已保存的报修草稿图片失败:', error);
      }
    });
  },

  async handleSubmit() {
    if (this.data.submitting) return;

    const building = this.data.building.trim();
    const floor = this.data.floor.trim();
    const room = this.data.room.trim();
    const location = [building, floor && `${floor}层`, room].filter(Boolean).join(' ');
    const desc = this.data.desc.trim();
    const phone = this.data.phone.trim();
    const category = this.data.categoryOptions[this.data.categoryIndex];

    if (!building || !room) {
      wx.showToast({ title: '请填写楼栋和房间/具体位置', icon: 'none' });
      return;
    }
    if (!desc) {
      wx.showToast({ title: '请输入故障描述', icon: 'none' });
      return;
    }
    if (!category || this.data.categoryIndex === 0) {
      wx.showToast({ title: '请选择故障类型', icon: 'none' });
      return;
    }
    if (!phone) {
      wx.showToast({ title: '请输入联系电话', icon: 'none' });
      return;
    }
    if (!/^[0-9+\-\s()]{7,20}$/.test(phone)) {
      wx.showToast({ title: '请输入有效的联系电话', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });

    try {
      const orderData = {
        title: desc.slice(0, 30),
        desc,
        location,
        building,
        floor,
        room,
        phone,
        mapAddress: this.data.mapAddress,
        additionalDescription: this.data.additionalDescription.trim(),
        category
      };
      if (Number.isFinite(this.data.latitude) && Number.isFinite(this.data.longitude)) {
        orderData.latitude = this.data.latitude;
        orderData.longitude = this.data.longitude;
      }

      if (this.data.imagePath) {
        await api.uploadFile('/api/order/create', this.data.imagePath, orderData);
      } else {
        await api.post('/api/order/create', orderData);
      }

      wx.showToast({ title: '报修提交成功', icon: 'success' });
      const submittedDraftId = this.loadedDraftId;
      const submittedDraft = submittedDraftId
        ? draftStorage.getDraftById(submittedDraftId)
        : null;
      const remainingDrafts = submittedDraftId
        ? draftStorage.removeDraft(submittedDraftId)
        : draftStorage.getDrafts();
      this.removeSavedImage(
        submittedDraft?.imagePath || this.data.imagePath,
        submittedDraft?.imageIsSaved || this.data.imageIsSaved
      );
      this.loadedDraftId = '';
      this.setData({
        building: '',
        floor: '',
        room: '',
        mapAddress: '',
        latitude: null,
        longitude: null,
        additionalDescription: '',
        desc: '',
        phone: '',
        imagePath: '',
        imageIsSaved: false,
        aiAnalysis: null,
        categoryIndex: 0,
        categoryValue: ''
      });
      this.setData({
        hasDraft: false,
        draftSavedAt: '',
        draftCount: remainingDrafts.length
      });
    } catch (error) {
      // request 工具会提示 HTTP/网络错误；这里补充提示本地流程错误。
      if (error && !error.requestHandled) {
        wx.showToast({ title: error.message || error.errMsg || '提交失败，请重试', icon: 'none' });
      }
    } finally {
      this.setData({ submitting: false });
    }
  }
});
