const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const RepairOrderReview = sequelize.define(
  'RepairOrderReview',
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
      unique: true,
      references: { model: 'repair_orders', key: 'id' }
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    rating: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: { min: 1, max: 5 }
    },
    comment: {
      type: DataTypes.STRING(1000),
      allowNull: true
    },
    feedbackType: {
      type: DataTypes.ENUM('quality', 'communication', 'speed', 'result', 'other'),
      allowNull: true,
      defaultValue: null
    },
    adminFollowup: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      defaultValue: null
    },
    followedUpAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null
    }
  },
  {
    tableName: 'repair_order_reviews',
    timestamps: true,
    updatedAt: false
  }
);

module.exports = RepairOrderReview;
