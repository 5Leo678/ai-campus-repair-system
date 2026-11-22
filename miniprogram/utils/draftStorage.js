const getUserId = () => {
  const userInfo = wx.getStorageSync('userInfo') || {};
  return userInfo.id || 'current';
};

const getDraftsKey = () => `repairDrafts_${getUserId()}`;
const getActiveDraftKey = () => `activeRepairDraft_${getUserId()}`;
const getLegacyDraftKey = () => `repairDraft_${getUserId()}`;

const createDraftId = () => `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const getDrafts = () => {
  const storedDrafts = wx.getStorageSync(getDraftsKey());
  if (Array.isArray(storedDrafts)) return storedDrafts;

  const legacyDraft = wx.getStorageSync(getLegacyDraftKey());
  if (!legacyDraft || typeof legacyDraft !== 'object') return [];

  const migratedDraft = {
    ...legacyDraft,
    imagePath: legacyDraft.imageIsSaved ? legacyDraft.imagePath : '',
    imageIsSaved: Boolean(legacyDraft.imageIsSaved && legacyDraft.imagePath),
    id: createDraftId(),
    title: legacyDraft.desc || legacyDraft.building || '未命名报修草稿',
    savedAt: legacyDraft.savedAt || new Date().toISOString()
  };
  wx.setStorageSync(getDraftsKey(), [migratedDraft]);
  wx.setStorageSync(getActiveDraftKey(), migratedDraft.id);
  wx.removeStorageSync(getLegacyDraftKey());
  return [migratedDraft];
};

const getActiveDraftId = () => wx.getStorageSync(getActiveDraftKey()) || '';

const setActiveDraftId = (id) => {
  if (id) wx.setStorageSync(getActiveDraftKey(), id);
  else wx.removeStorageSync(getActiveDraftKey());
};

const saveDraft = (fields, { createNew = false } = {}) => {
  const hasContent = [
    fields.building,
    fields.floor,
    fields.room,
    fields.mapAddress,
    fields.additionalDescription,
    fields.desc,
    fields.phone,
    fields.imagePath,
    fields.categoryValue
  ].some((value) => String(value || '').trim());
  if (!hasContent) return null;

  const drafts = getDrafts();
  const activeId = createNew ? '' : getActiveDraftId();
  const existingIndex = drafts.findIndex((draft) => draft.id === activeId);
  const existing = existingIndex >= 0 ? drafts[existingIndex] : null;
  const savedAt = new Date().toISOString();
  const title = [
    String(fields.building || '').trim(),
    String(fields.room || '').trim()
  ].filter(Boolean).join(' ');
  const draft = {
    ...fields,
    id: existing ? existing.id : createDraftId(),
    title: String(fields.desc || '').trim().slice(0, 40) || title || '未命名报修草稿',
    savedAt
  };

  if (existingIndex >= 0) drafts.splice(existingIndex, 1);
  drafts.unshift(draft);
  wx.setStorageSync(getDraftsKey(), drafts);
  setActiveDraftId(draft.id);
  return draft;
};

const removeDraft = (id) => {
  const drafts = getDrafts().filter((draft) => draft.id !== id);
  wx.setStorageSync(getDraftsKey(), drafts);
  if (getActiveDraftId() === id) setActiveDraftId('');
  return drafts;
};

const getDraftById = (id) => getDrafts().find((draft) => draft.id === id) || null;

module.exports = {
  getDrafts,
  getActiveDraftId,
  setActiveDraftId,
  saveDraft,
  removeDraft,
  getDraftById
};
