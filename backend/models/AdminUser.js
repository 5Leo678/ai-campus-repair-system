const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const AdminUser = sequelize.define(
  'AdminUser',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    username: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
      comment: '后台管理员用户名'
    },
    password: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'bcrypt加密后的密码'
    },
    name: {
      type: DataTypes.STRING(64),
      allowNull: false,
      comment: '管理员姓名'
    }
  },
  {
    tableName: 'admin_users',
    timestamps: true,
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  }
);

module.exports = AdminUser;
