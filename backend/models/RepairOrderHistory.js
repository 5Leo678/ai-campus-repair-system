const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const RepairOrderHistory = sequelize.define(
  'RepairOrderHistory',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    orderId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'repair_orders', key: 'id' }
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    actorRole: {
      type: DataTypes.ENUM('student', 'admin', 'maintenance'),
      allowNull: false
    },
    actorId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    eventType: {
      type: DataTypes.ENUM('created', 'status', 'assignment', 'note'),
      allowNull: false
    },
    status: {
      type: DataTypes.STRING(32),
      allowNull: true
    },
    assignedTo: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    remark: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  },
  {
    tableName: 'repair_order_histories',
    timestamps: true,
    updatedAt: false
  }
);

module.exports = RepairOrderHistory;
