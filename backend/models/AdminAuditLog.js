const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const AdminAuditLog = sequelize.define('AdminAuditLog', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  adminId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  action: {
    type: DataTypes.STRING(80),
    allowNull: false
  },
  targetType: {
    type: DataTypes.STRING(80),
    allowNull: false
  },
  targetId: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  details: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'admin_audit_logs',
  timestamps: true,
  updatedAt: false,
  indexes: [{ fields: ['createdAt'] }]
});

module.exports = AdminAuditLog;
