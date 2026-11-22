const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const RepairOrder = sequelize.define(
  'RepairOrder',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
      field: 'userId',
      comment: '关联用户表'
    },
    title: {
      type: DataTypes.STRING(200),
      allowNull: false,
      comment: '故障标题'
    },
    desc: {
      type: DataTypes.TEXT,
      allowNull: false,
      comment: '故障描述'
    },
    location: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: '报修地点'
    },
    building: {
      type: DataTypes.STRING(100),
      allowNull: true,
      defaultValue: null,
      comment: '报修楼栋'
    },
    floor: {
      type: DataTypes.STRING(40),
      allowNull: true,
      defaultValue: null,
      comment: '报修楼层'
    },
    room: {
      type: DataTypes.STRING(80),
      allowNull: true,
      defaultValue: null,
      comment: '报修房间或位置'
    },
    mapAddress: {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: null
    },
    latitude: {
      type: DataTypes.DECIMAL(10, 7),
      allowNull: true,
      defaultValue: null
    },
    longitude: {
      type: DataTypes.DECIMAL(10, 7),
      allowNull: true,
      defaultValue: null
    },
    additionalDescription: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      defaultValue: null
    },
    phone: {
      type: DataTypes.STRING(20),
      allowNull: true,
      defaultValue: null,
      comment: '本次报修填写的联系电话'
    },
    imgUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
      comment: '图片地址'
    },
    aiCategory: {
      type: DataTypes.STRING(100),
      allowNull: true,
      defaultValue: null,
      comment: 'AI识别故障分类'
    },
    aiSuggest: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
      comment: 'AI给出的自查建议'
    },
    status: {
      type: DataTypes.ENUM('待处理', '处理中', '已完成', '已撤销'),
      allowNull: false,
      defaultValue: '待处理',
      comment: '工单状态'
    },
    adminRemark: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
      comment: '管理员备注'
    },
    assignedTo: {
      type: DataTypes.STRING(100),
      allowNull: true,
      defaultValue: null,
      comment: '维修负责人或维修组'
    },
    assignedStaffId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
      comment: '关联维修人员/维修组目录'
    },
    completionNote: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null
    },
    completionImgUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null
    },
    studentConfirmedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null
    },
    reopenRequestedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null
    },
    reopenReason: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      defaultValue: null
    },
    deletedBy: {
      type: DataTypes.ENUM('student', 'admin'),
      allowNull: true,
      defaultValue: null,
      comment: '软删除操作人角色'
    },
    adminHiddenAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
      comment: '管理员端隐藏时间，不影响用户端工单'
    }
  },
  {
    tableName: 'repair_orders',
    timestamps: true,
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
    paranoid: true
  }
);

module.exports = RepairOrder;
