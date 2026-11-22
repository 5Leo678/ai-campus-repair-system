const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const User = sequelize.define(
  'User',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    openid: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
      field: 'openid',
      comment: '小程序用户唯一标识'
    },
    nickname: {
      type: DataTypes.STRING(64),
      allowNull: true,
      defaultValue: null,
      comment: '用户昵称'
    },
    phone: {
      type: DataTypes.STRING(20),
      allowNull: true,
      defaultValue: null,
      comment: '手机号'
    },
    avatarUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
      comment: '用户头像图片地址'
    },
    role: {
      type: DataTypes.ENUM('student', 'admin'),
      allowNull: false,
      defaultValue: 'student',
      comment: '用户角色：student / admin'
    }
  },
  {
    tableName: 'users',
    timestamps: true,
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  }
);

module.exports = User;
