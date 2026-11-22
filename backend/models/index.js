const { sequelize } = require('../config/db');
const User = require('./User');
const RepairOrder = require('./RepairOrder');
const AdminUser = require('./AdminUser');
const RepairOrderHistory = require('./RepairOrderHistory');
const Notification = require('./Notification');
const RepairOrderReview = require('./RepairOrderReview');
const RepairOrderMessage = require('./RepairOrderMessage');
const MaintenanceStaff = require('./MaintenanceStaff');
const SystemSetting = require('./SystemSetting');
const RepairCatalog = require('./RepairCatalog');
const AdminAuditLog = require('./AdminAuditLog');

User.hasMany(RepairOrder, {
  foreignKey: 'userId',
  as: 'repairOrders',
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE'
});

RepairOrder.belongsTo(User, {
  foreignKey: 'userId',
  as: 'user'
});

RepairOrder.hasMany(RepairOrderHistory, { foreignKey: 'orderId', as: 'history' });
RepairOrderHistory.belongsTo(RepairOrder, { foreignKey: 'orderId', as: 'order' });
RepairOrder.hasOne(RepairOrderReview, { foreignKey: 'orderId', as: 'review' });
RepairOrderReview.belongsTo(RepairOrder, { foreignKey: 'orderId', as: 'order' });
RepairOrderReview.belongsTo(User, { foreignKey: 'userId', as: 'user' });
RepairOrder.hasMany(RepairOrderMessage, { foreignKey: 'orderId', as: 'messages' });
RepairOrderMessage.belongsTo(RepairOrder, { foreignKey: 'orderId', as: 'order' });
RepairOrder.belongsTo(MaintenanceStaff, { foreignKey: 'assignedStaffId', as: 'maintenanceStaff' });
User.hasMany(Notification, { foreignKey: 'userId', as: 'notifications' });
Notification.belongsTo(RepairOrder, { foreignKey: 'orderId', as: 'order' });
AdminAuditLog.belongsTo(AdminUser, { foreignKey: 'adminId', as: 'admin' });

module.exports = {
  sequelize,
  User,
  RepairOrder,
  AdminUser,
  RepairOrderHistory,
  Notification,
  RepairOrderReview,
  RepairOrderMessage,
  MaintenanceStaff,
  SystemSetting,
  RepairCatalog,
  AdminAuditLog
};
