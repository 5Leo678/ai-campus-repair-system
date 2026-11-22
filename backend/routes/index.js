const express = require('express');
const router = express.Router();

const { login, adminLogin } = require('../controllers/authController');
const {
  createRepairOrder,
  getMyOrderList,
  cancelMyOrder,
  deleteMyFinishedOrder,
  getAllOrderList,
  deleteOrder,
  updateOrderStatus,
  getOrderDetail,
  confirmOrderCompletion,
  requestOrderReopen,
  reopenOrderForRepair,
  uploadCompletionEvidence
} = require('../controllers/repairOrderController');
const { verifyToken, isAdmin, isMaintenance } = require('../middleware/authJwt');
const {
  login: maintenanceLogin,
  listAssignedOrders,
  uploadCompletionEvidence: uploadMaintenanceCompletionEvidence,
  updateOrderProgress,
  getMaintenanceProfile,
  updateMaintenancePassword,
  listMaintenanceNotices
} = require('../controllers/maintenanceWorkbenchController');
const {
  getMaintenanceStaff,
  createMaintenanceStaff,
  updateMaintenanceStaff,
  deleteMaintenanceStaff,
  getMaintenanceWorkload
} = require('../controllers/maintenanceStaffController');
const { uploadRepairImage } = require('../middleware/repairImageUpload');
const {
  getOrderStats,
  getMyNotifications,
  markNotificationRead,
  createOrderReview,
  getAdminOrderReviews
} = require('../controllers/workflowController');
const {
  getAdminSlaSettings,
  updateSlaSettings,
  getSlaAlerts,
  listAdminAuditLogs,
  updateReviewFollowup
} = require('../controllers/adminWorkflowController');
const {
  getCatalog,
  getAdminCatalog,
  createCatalogEntry,
  updateCatalogEntry,
  activateCatalogEntry,
  deleteCatalogEntry
} = require('../controllers/catalogController');
const { exportOrdersCsv } = require('../controllers/reportController');
const {
  analyzeRepairDescription,
  getAdminRepairInsights,
  reanalyzeRepairOrder
} = require('../controllers/aiController');
const { getMyProfile, updateMyProfile, uploadMyAvatar } = require('../controllers/userController');
const { listOrderMessages, createOrderMessage } = require('../controllers/orderMessageController');

// 微信小程序登录接口
router.post('/auth/login', login);
router.post('/auth/adminlogin', adminLogin);
router.post('/maintenance/auth/login', maintenanceLogin);
router.get('/maintenance/orders', verifyToken, isMaintenance, listAssignedOrders);
router.post('/maintenance/orders/:id/progress', verifyToken, isMaintenance, updateOrderProgress);
router.post(
  '/maintenance/orders/:id/completion-evidence',
  verifyToken,
  isMaintenance,
  uploadRepairImage,
  uploadMaintenanceCompletionEvidence
);
router.get('/maintenance/profile', verifyToken, isMaintenance, getMaintenanceProfile);
router.put('/maintenance/password', verifyToken, isMaintenance, updateMaintenancePassword);
router.get('/maintenance/notices', verifyToken, isMaintenance, listMaintenanceNotices);
router.post('/ai/analyze', verifyToken, analyzeRepairDescription);
router.get('/admin/ai/insights', verifyToken, isAdmin, getAdminRepairInsights);
router.get('/notifications/my', verifyToken, getMyNotifications);
router.put('/notifications/:id/read', verifyToken, markNotificationRead);
router.get('/user/profile', verifyToken, getMyProfile);
router.put('/user/profile', verifyToken, updateMyProfile);
router.post('/user/profile/avatar', verifyToken, uploadRepairImage, uploadMyAvatar);

// 工单接口
router.post('/order/create', verifyToken, uploadRepairImage, createRepairOrder);
router.get('/order/stats', verifyToken, isAdmin, getOrderStats);
router.get('/order/reviews', verifyToken, isAdmin, getAdminOrderReviews);
router.put('/order/reviews/:id/followup', verifyToken, isAdmin, updateReviewFollowup);
router.get('/order/sla-alerts', verifyToken, isAdmin, getSlaAlerts);
router.get('/order/sla-settings', verifyToken, isAdmin, getAdminSlaSettings);
router.put('/order/sla-settings', verifyToken, isAdmin, updateSlaSettings);
router.get('/reports/orders.csv', verifyToken, isAdmin, exportOrdersCsv);
router.get('/admin/audit-logs', verifyToken, isAdmin, listAdminAuditLogs);
router.get('/catalog', verifyToken, getCatalog);
router.get('/admin/catalog', verifyToken, isAdmin, getAdminCatalog);
router.post('/admin/catalog', verifyToken, isAdmin, createCatalogEntry);
router.put('/admin/catalog/:id', verifyToken, isAdmin, updateCatalogEntry);
router.put('/admin/catalog/:id/activate', verifyToken, isAdmin, activateCatalogEntry);
router.delete('/admin/catalog/:id', verifyToken, isAdmin, deleteCatalogEntry);
router.get('/order/my', verifyToken, getMyOrderList);
router.post('/order/:id/cancel', verifyToken, cancelMyOrder);
router.delete('/order/:id/my', verifyToken, deleteMyFinishedOrder);
router.post('/order/:id/confirm-completion', verifyToken, confirmOrderCompletion);
router.post('/order/:id/reopen-request', verifyToken, requestOrderReopen);
router.get('/order/all', verifyToken, isAdmin, getAllOrderList);
router.get('/maintenance-staff/workload', verifyToken, isAdmin, getMaintenanceWorkload);
router.post('/order/:id/reopen', verifyToken, isAdmin, reopenOrderForRepair);
router.post('/admin/order/:id/ai-analysis', verifyToken, isAdmin, reanalyzeRepairOrder);
router.post('/order/:id/completion-evidence', verifyToken, isAdmin, uploadRepairImage, uploadCompletionEvidence);
router.delete('/order/:id', verifyToken, isAdmin, deleteOrder);
router.put('/order/:id/status', verifyToken, isAdmin, updateOrderStatus);
router.post('/order/:id/review', verifyToken, createOrderReview);
router.get('/order/:id/messages', verifyToken, listOrderMessages);
router.post('/order/:id/messages', verifyToken, uploadRepairImage, createOrderMessage);
router.get('/order/:id', verifyToken, getOrderDetail);
router.get('/maintenance-staff', verifyToken, isAdmin, getMaintenanceStaff);
router.post('/maintenance-staff', verifyToken, isAdmin, createMaintenanceStaff);
router.put('/maintenance-staff/:id', verifyToken, isAdmin, updateMaintenanceStaff);
router.delete('/maintenance-staff/:id', verifyToken, isAdmin, deleteMaintenanceStaff);

module.exports = router;
