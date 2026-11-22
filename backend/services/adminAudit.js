const { AdminAuditLog } = require('../models');

const recordAdminAction = async (admin, action, targetType, targetId, details = null, options = {}) => {
  await AdminAuditLog.create({
    adminId: admin.id,
    action,
    targetType,
    targetId: targetId === null || targetId === undefined ? null : String(targetId),
    details: details ? JSON.stringify(details) : null
  }, options);
};

module.exports = { recordAdminAction };
