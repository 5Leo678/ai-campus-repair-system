const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Notification = sequelize.define(
  'Notification',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    orderId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    title: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    message: {
      type: DataTypes.STRING(500),
      allowNull: false
    },
    readAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null
    }
  },
  {
    tableName: 'notifications',
    timestamps: true,
    updatedAt: false
  }
);

module.exports = Notification;
