const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const MaintenanceStaff = sequelize.define(
  'MaintenanceStaff',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: '维修人员或维修组名称'
    },
    type: {
      type: DataTypes.ENUM('person', 'team'),
      allowNull: false,
      defaultValue: 'person',
      comment: '维修主体类型'
    },
    phone: {
      type: DataTypes.STRING(30),
      allowNull: true,
      defaultValue: null,
      comment: '联系电话'
    },
    username: {
      type: DataTypes.STRING(64),
      allowNull: true,
      defaultValue: null,
      unique: true,
      comment: '维修人员登录用户名'
    },
    passwordHash: {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: null,
      comment: 'bcrypt加密后的登录密码'
    },
    description: {
      type: DataTypes.STRING(500),
      allowNull: true,
      defaultValue: null,
      comment: '备注说明'
    }
  },
  {
    tableName: 'maintenance_staff',
    defaultScope: {
      attributes: { exclude: ['passwordHash'] }
    },
    timestamps: true,
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  }
);

module.exports = MaintenanceStaff;
