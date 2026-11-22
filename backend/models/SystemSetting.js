const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const SystemSetting = sequelize.define('SystemSetting', {
  key: {
    type: DataTypes.STRING(100),
    primaryKey: true,
    allowNull: false
  },
  value: {
    type: DataTypes.TEXT,
    allowNull: false
  }
}, {
  tableName: 'system_settings',
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
});

module.exports = SystemSetting;
