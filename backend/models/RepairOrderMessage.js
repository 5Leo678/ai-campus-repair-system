const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const RepairOrderMessage = sequelize.define(
  'RepairOrderMessage',
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
    content: {
      type: DataTypes.STRING(2000),
      allowNull: false
    },
    imageUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null
    }
  },
  {
    tableName: 'repair_order_messages',
    timestamps: true,
    updatedAt: false,
    indexes: [{ fields: ['orderId', 'createdAt'] }]
  }
);

module.exports = RepairOrderMessage;
