const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const RepairCatalog = sequelize.define('RepairCatalog', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  type: {
    type: DataTypes.ENUM('category', 'building'),
    allowNull: false
  },
  value: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  }
}, {
  tableName: 'repair_catalogs',
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  indexes: [{ unique: true, fields: ['type', 'value'] }]
});

module.exports = RepairCatalog;
