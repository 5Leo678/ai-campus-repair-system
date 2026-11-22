const { DataTypes } = require('sequelize');
const { RepairCatalog, SystemSetting } = require('../models');

const ensureColumn = async (queryInterface, tableName, columnName, definition) => {
  const columns = await queryInterface.describeTable(tableName);
  if (!Object.prototype.hasOwnProperty.call(columns, columnName)) {
    await queryInterface.addColumn(tableName, columnName, definition);
  }
};

const ensureUniqueIndex = async (queryInterface, tableName, field, name) => {
  const indexes = await queryInterface.showIndex(tableName);
  if (!indexes.some((index) => index.unique && index.fields.some((item) => item.attribute === field || item.name === field))) {
    await queryInterface.addIndex(tableName, [field], { unique: true, name });
  }
};

const ensureWorkflowFields = async (sequelize) => {
  const queryInterface = sequelize.getQueryInterface();
  const columns = [
    ['maintenance_staff', 'username', {
      type: DataTypes.STRING(64),
      allowNull: true,
      defaultValue: null
    }],
    ['maintenance_staff', 'passwordHash', {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: null
    }],
    ['repair_orders', 'assignedStaffId', {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null
    }],
    ['repair_orders', 'completionNote', {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null
    }],
    ['repair_orders', 'completionImgUrl', {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null
    }],
    ['repair_orders', 'studentConfirmedAt', {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null
    }],
    ['repair_orders', 'reopenRequestedAt', {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null
    }],
    ['repair_orders', 'reopenReason', {
      type: DataTypes.STRING(1000),
      allowNull: true,
      defaultValue: null
    }],
    ['repair_orders', 'adminHiddenAt', {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null
    }],
    ['repair_orders', 'mapAddress', {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: null
    }],
    ['repair_orders', 'latitude', {
      type: DataTypes.DECIMAL(10, 7),
      allowNull: true,
      defaultValue: null
    }],
    ['repair_orders', 'longitude', {
      type: DataTypes.DECIMAL(10, 7),
      allowNull: true,
      defaultValue: null
    }],
    ['repair_orders', 'additionalDescription', {
      type: DataTypes.STRING(1000),
      allowNull: true,
      defaultValue: null
    }],
    ['repair_orders', 'phone', {
      type: DataTypes.STRING(20),
      allowNull: true,
      defaultValue: null
    }],
    ['users', 'avatarUrl', {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null
    }],
    ['repair_order_reviews', 'feedbackType', {
      type: DataTypes.ENUM('quality', 'communication', 'speed', 'result', 'other'),
      allowNull: true,
      defaultValue: null
    }],
    ['repair_order_reviews', 'adminFollowup', {
      type: DataTypes.STRING(1000),
      allowNull: true,
      defaultValue: null
    }],
    ['repair_order_reviews', 'followedUpAt', {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null
    }]
  ];
  for (const [tableName, columnName, definition] of columns) {
    await ensureColumn(queryInterface, tableName, columnName, definition);
  }

  await ensureUniqueIndex(queryInterface, 'maintenance_staff', 'username', 'maintenance_staff_username_unique');
  await queryInterface.changeColumn('repair_order_histories', 'actorRole', {
    type: DataTypes.ENUM('student', 'admin', 'maintenance'),
    allowNull: false
  });
  await queryInterface.changeColumn('repair_order_messages', 'actorRole', {
    type: DataTypes.ENUM('student', 'admin', 'maintenance'),
    allowNull: false
  });

  await Promise.all([
    SystemSetting.findOrCreate({
      where: { key: 'sla.pendingHours' },
      defaults: { value: '24' }
    }),
    SystemSetting.findOrCreate({
      where: { key: 'sla.processingHours' },
      defaults: { value: '72' }
    })
  ]);

  const defaultCategories = ['水电故障', '门窗故障', '网络故障', '其他故障'];
  for (const value of defaultCategories) {
    await RepairCatalog.findOrCreate({
      where: { type: 'category', value },
      defaults: { active: true }
    });
  }
};

module.exports = ensureWorkflowFields;
