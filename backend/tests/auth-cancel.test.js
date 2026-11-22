const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const Module = require('node:module');
const { Op } = require('sequelize');

process.env.JWT_SECRET = 'test-jwt-secret-with-at-least-32-bytes';

const student = { id: 7, role: 'student' };
const admin = { id: 12, username: 'campus-admin', name: 'Campus Admin', password: '' };
const orders = [
  { id: 1, userId: 7, status: '待处理' },
  { id: 2, userId: 7, status: '处理中' },
  { id: 3, userId: 9, status: '待处理' },
  { id: 4, userId: 7, status: '已完成' },
  { id: 5, userId: 7, status: '已撤销' },
  { id: 6, userId: 7, status: '待处理' },
  { id: 7, userId: 7, status: '已完成' },
  { id: 8, userId: 7, status: '已完成' },
  { id: 9, userId: 7, status: '已撤销' }
];
let lastListWhere;
let lastListOptions;
let createdOrderValues;
let lastDeleteOptions;
let lastAdminDeleteOptions;
const orderHistory = [];
const notifications = [];
const reviews = new Map();
let lastReviewListOptions;
let reviewRatingOptions;
let lowRatingOptions;
const deletedOrderIds = new Set();
const deletionRoles = new Map();
let aiServiceCalled = false;
let aiServiceResult = { category: '其他故障', suggestion: 'mock AI advice' };

const aiService = {
  VALID_CATEGORIES: ['水电故障', '门窗故障', '网络故障', '其他故障'],
  getRepairAnalysis: async () => {
    aiServiceCalled = true;
    return aiServiceResult;
  }
};

const RepairOrder = {
  create: async (values) => {
    createdOrderValues = values;
    return { id: 100, ...values };
  },
  findOne: async (options) => orders.find((item) =>
    String(item.id) === String(options.where.id) &&
    String(item.userId) === String(options.where.userId) &&
    (!deletedOrderIds.has(item.id) || options.paranoid === false)) || null,
  findByPk: async (id, options = {}) => {
    const order = orders.find((item) =>
      String(item.id) === String(id) &&
      (!deletedOrderIds.has(item.id) || options.paranoid === false));
    if (!order) return null;
    return {
      ...order,
      title: order.title || `Order ${order.id}`,
      assignedTo: order.assignedTo || null,
      save: async function save() {
        Object.assign(order, this);
      }
    };
  },
  count: async ({ where }) => {
    const status = where[Op.and].find((condition) =>
      typeof condition.status === 'string')?.status;
    return orders.filter((order) => order.status === status).length;
  },
  findAll: async (options = {}) => {
    if (options.group) return [];
    const ids = options.where?.id?.[Op.in];
    if (ids) return orders.filter((order) => ids.includes(order.id));
    return [];
  },
  findAll: async ({ where, paranoid = true }) => orders.filter((item) => {
    if (String(item.userId) !== String(where.userId)) return false;
    if (!paranoid) {
      return !deletedOrderIds.has(item.id) || deletionRoles.get(item.id) === 'admin';
    }
    return !deletedOrderIds.has(item.id);
  }),
  destroy: async (options) => {
    lastDeleteOptions = options;
    const { where } = options;
    const order = orders.find((item) =>
      String(item.id) === String(where.id) &&
      String(item.userId) === String(where.userId) &&
      where.status[Op.in].includes(item.status) &&
      !deletedOrderIds.has(item.id));
    if (!order) return 0;
    deletedOrderIds.add(order.id);
    return 1;
  },
  update: async (values, options) => {
    if (options.paranoid === false && values.adminHiddenAt) {
      lastAdminDeleteOptions = options;
      const order = orders.find((item) =>
        String(item.id) === String(options.where.id) &&
        (!deletedOrderIds.has(item.id) || options.paranoid === false));
      if (!order) return [0];
      Object.assign(order, values);
      return [1];
    }
    const id = Number(options.where.id);
    const order = orders.find((item) =>
      item.id === id &&
      String(item.userId) === String(options.where.userId) &&
      (!options.where.status || (
        options.where.status[Op.in]
          ? options.where.status[Op.in].includes(item.status)
          : item.status === options.where.status
      )) &&
      (!Object.prototype.hasOwnProperty.call(options.where, 'deletedAt') ||
        (!options.where.deletedAt && !deletedOrderIds.has(item.id))));
    if (!order) return [0];
    if (values.deletedAt) {
      deletedOrderIds.add(id);
      deletionRoles.set(id, values.deletedBy);
    } else {
      Object.assign(order, values);
    }
    return [1];
  },
  findAndCountAll: async (options) => {
    const { where } = options;
    lastListWhere = where;
    lastListOptions = options;
    const list = orders.filter((order) => {
      if (order.status === '已撤销') return false;
      if (order.adminHiddenAt) return false;
      if (deletedOrderIds.has(order.id) && deletionRoles.get(order.id) === 'admin') return false;
      const selectedStatus = where[Op.and].find((condition) => condition.status === '待处理' ||
        condition.status === '处理中' || condition.status === '已完成');
      return !selectedStatus || order.status === selectedStatus.status;
    });
    return { count: list.length, rows: list };
  }
};
const RepairOrderHistory = {
  create: async (event) => {
    const savedEvent = { id: orderHistory.length + 1, createdAt: new Date(), ...event };
    orderHistory.push(savedEvent);
    return savedEvent;
  },
  findAll: async ({ where } = {}) => orderHistory.filter((event) =>
    !where || Object.entries(where).every(([key, value]) => event[key] === value))
};
const Notification = {
  create: async (notification) => {
    const savedNotification = { id: notifications.length + 1, readAt: null, ...notification };
    notifications.push(savedNotification);
    return savedNotification;
  },
  findAll: async ({ where }) => notifications.filter((item) => item.userId === where.userId),
  count: async ({ where }) => notifications.filter((item) =>
    item.userId === where.userId && (!Object.prototype.hasOwnProperty.call(where, 'readAt') || item.readAt === null)).length,
  update: async (values, { where }) => {
    const item = notifications.find((notification) =>
      String(notification.id) === String(where.id) &&
      notification.userId === where.userId &&
      notification.readAt === null);
    if (!item) return [0];
    Object.assign(item, values);
    return [1];
  },
  findOne: async ({ where }) => notifications.find((item) =>
    String(item.id) === String(where.id) && item.userId === where.userId) || null
};
const RepairOrderReview = {
  findOrCreate: async ({ where, defaults }) => {
    if (reviews.has(where.orderId)) return [reviews.get(where.orderId), false];
    const review = { id: reviews.size + 1, ...defaults, orderId: where.orderId };
    reviews.set(where.orderId, review);
    return [review, true];
  },
  findAndCountAll: async (options) => {
    lastReviewListOptions = options;
    return { count: 1, rows: [{ id: 1, rating: 5, comment: '处理及时' }] };
  },
  findAll: async (options) => {
    reviewRatingOptions = options;
    return [{ rating: 5 }];
  },
  count: async (options) => {
    lowRatingOptions = options;
    return 0;
  }
};
const AdminAuditLog = { create: async () => ({}) };
const RepairCatalog = {
  findAll: async () => aiService.VALID_CATEGORIES.map((value) => ({ value })),
  count: async () => aiService.VALID_CATEGORIES.length
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === '../models') {
    return {
      sequelize: { transaction: async (callback) => callback({}) },
      User: {},
      AdminUser: { findOne: async ({ where }) => where.username === admin.username ? admin : null },
      RepairOrder,
      RepairOrderHistory,
      Notification,
      RepairOrderReview,
      AdminAuditLog,
      SystemSetting: {
        findAll: async () => [
          { key: 'sla.pendingHours', value: '24' },
          { key: 'sla.processingHours', value: '72' }
        ]
      },
      RepairCatalog,
      MaintenanceStaff: { findByPk: async () => null }
    };
  }
  if (request === '../services/aiService') return aiService;
  if (request === '../middleware/repairImageUpload') {
    return {
      saveRepairImage: async () => 'test-image.png',
      removeRepairImage: async () => {}
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const { adminLogin } = require('../controllers/authController');
const {
  cancelMyOrder,
  createRepairOrder,
  deleteOrder,
  deleteMyFinishedOrder,
  getAllOrderList,
  getMyOrderList
} = require('../controllers/repairOrderController');
const {
  getOrderStats,
  getMyNotifications,
  markNotificationRead,
  createOrderReview,
  getAdminOrderReviews
} = require('../controllers/workflowController');
const { getJwtSecret } = require('../config/security');
Module._load = originalLoad;

const createResponse = () => ({
  statusCode: 200,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  }
});

before(async () => {
  admin.password = await bcrypt.hash('correct-horse-campus-password', 4);
});

after(() => {
  delete process.env.JWT_SECRET;
});

test('admin login checks the stored bcrypt hash and signs an admin token', async () => {
  const response = createResponse();
  await adminLogin({
    body: { username: admin.username, password: 'correct-horse-campus-password' }
  }, response);

  assert.equal(response.statusCode, 200);
  const payload = jwt.verify(response.body.data.token, process.env.JWT_SECRET);
  assert.equal(payload.id, admin.id);
  assert.equal(payload.role, 'admin');
});

test('admin login rejects legacy hard-coded credentials and wrong passwords', async () => {
  for (const body of [
    { username: 'admin', password: '123456' },
    { username: admin.username, password: 'wrong-password' }
  ]) {
    const response = createResponse();
    await adminLogin({ body }, response);
    assert.equal(response.statusCode, 401);
  }
});

test('admin login rejects missing and oversized input', async () => {
  for (const body of [
    {},
    { username: admin.username, password: 'x'.repeat(73) }
  ]) {
    const response = createResponse();
    await adminLogin({ body }, response);
    assert.equal(response.statusCode, 400);
  }
});

test('JWT signing requires a secret with at least 32 bytes', () => {
  process.env.JWT_SECRET = 'short-secret';
  assert.throws(getJwtSecret, /at least 32 bytes/);

  const strongSecret = 'test-jwt-secret-with-at-least-32-bytes';
  process.env.JWT_SECRET = strongSecret;
  assert.equal(getJwtSecret(), strongSecret);
});

test('students can cancel only their own pending orders', async () => {
  const success = createResponse();
  await cancelMyOrder({ user: student, params: { id: '1' } }, success);
  assert.equal(success.statusCode, 200);
  assert.equal(orders[0].status, '已撤销');

  const processing = createResponse();
  await cancelMyOrder({ user: student, params: { id: '2' } }, processing);
  assert.equal(processing.statusCode, 409);

  const otherUser = createResponse();
  await cancelMyOrder({ user: student, params: { id: '3' } }, otherUser);
  assert.equal(otherUser.statusCode, 404);
  assert.equal(orders[2].status, '待处理');
});

test('cancellation requires an authenticated user', async () => {
  const response = createResponse();
  await cancelMyOrder({ user: null, params: { id: '1' } }, response);
  assert.equal(response.statusCode, 401);
});

test('students can hide only their own completed or cancelled orders from student lists', async () => {
  for (const id of [4, 5]) {
    const response = createResponse();
    await deleteMyFinishedOrder({ user: student, params: { id: String(id) } }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(deletedOrderIds.has(id), true);
    assert.equal(deletionRoles.get(id), 'student');
  }

  const pending = createResponse();
  await deleteMyFinishedOrder({ user: student, params: { id: '6' } }, pending);
  assert.equal(pending.statusCode, 409);

  const otherUser = createResponse();
  await deleteMyFinishedOrder({ user: student, params: { id: '3' } }, otherUser);
  assert.equal(otherUser.statusCode, 404);
  assert.equal(deletedOrderIds.has(3), false);

  const studentList = createResponse();
  await getMyOrderList({ user: student }, studentList);
  assert.ok(!studentList.body.data.some((order) => order.id === 4 || order.id === 5));
});

test('student-hidden completed orders stay visible to admins with a deletion marker', async () => {
  const hideForStudent = createResponse();
  await deleteMyFinishedOrder({ user: student, params: { id: '8' } }, hideForStudent);
  assert.equal(hideForStudent.statusCode, 200);

  deletedOrderIds.add(7);
  deletionRoles.set(7, 'admin');
  deletedOrderIds.add(9);
  deletionRoles.set(9, 'student');

  const response = createResponse();
  await getAllOrderList({ query: {} }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(lastListOptions.paranoid, false);
  assert.ok(response.body.data.list.some((order) => order.id === 8));
  assert.ok(!response.body.data.list.some((order) => order.id === 7));
  assert.ok(!response.body.data.list.some((order) => order.id === 9));
});

test('admins cannot use the student self-delete endpoint', async () => {
  const response = createResponse();
  await deleteMyFinishedOrder({
    user: { id: 12, role: 'admin' },
    params: { id: '4' }
  }, response);
  assert.equal(response.statusCode, 403);
});

test('admin deletion only hides the order from the admin list', async () => {
  const visibleToStudent = { id: 16, userId: student.id, status: '已完成' };
  orders.push(visibleToStudent);

  const response = createResponse();
  await deleteOrder({ user: admin, params: { id: '16' } }, response);

  assert.equal(response.statusCode, 200);
  assert.ok(visibleToStudent.adminHiddenAt);
  assert.equal(visibleToStudent.deletedAt, undefined);
  assert.equal(visibleToStudent.deletedBy, undefined);
  assert.deepEqual(lastAdminDeleteOptions.where, {
    id: '16',
    status: '已完成',
    adminHiddenAt: null
  });

  const studentList = createResponse();
  await getMyOrderList({ user: student }, studentList);
  assert.ok(studentList.body.data.some((order) => order.id === 16));

  const adminList = createResponse();
  await getAllOrderList({ query: {} }, adminList);
  assert.ok(!adminList.body.data.list.some((order) => order.id === 16));
});

test('admin deletion preserves a student-hidden order state', async () => {
  deletedOrderIds.add(4);
  deletionRoles.set(4, 'student');

  const response = createResponse();
  await deleteOrder({ user: admin, params: { id: '4' } }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(deletedOrderIds.has(4), true);
  assert.equal(deletionRoles.get(4), 'student');
  assert.ok(orders.find((order) => order.id === 4).adminHiddenAt);
  assert.equal(lastAdminDeleteOptions.paranoid, false);

  const listResponse = createResponse();
  await getAllOrderList({ query: {} }, listResponse);
  assert.ok(!listResponse.body.data.list.some((order) => order.id === 4));
});

test('admins cannot delete pending or processing orders', async () => {
  for (const [id, status] of [[13, '待处理'], [14, '处理中']]) {
    orders.push({ id, userId: student.id, status });
    const response = createResponse();
    await deleteOrder({ params: { id: String(id) } }, response);

    assert.equal(response.statusCode, 409);
    assert.equal(deletedOrderIds.has(id), false);
  }
});

test('admin order list always excludes cancelled orders, including with a status filter', async () => {
  for (const query of [{}, { status: 'pending' }]) {
    const response = createResponse();
    await getAllOrderList({ query }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(lastListOptions.paranoid, false);
    assert.deepEqual(lastListWhere[Op.and][0], {
      status: { [Op.ne]: '已撤销' }
    });
    assert.deepEqual(lastListWhere[Op.and][1][Op.or], [
      { deletedAt: null },
      { deletedBy: 'student' }
    ]);
    assert.deepEqual(lastListWhere[Op.and][2], { adminHiddenAt: null });
    if (query.status) {
      assert.deepEqual(lastListWhere[Op.and][3], { status: '待处理' });
    } else {
      assert.equal(lastListWhere[Op.and].length, 3);
    }
  }
});

test('admin order list searches order fields and student contact fields', async () => {
  const response = createResponse();
  await getAllOrderList({
    query: { q: '  dorm  ', status: 'pending', page: '2', size: '5' }
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(lastListOptions.offset, 5);
  assert.equal(lastListOptions.limit, 5);
  assert.equal(lastListOptions.distinct, true);

  const searchCondition = lastListWhere[Op.and].find((condition) =>
    condition[Op.or]?.some((field) => Object.prototype.hasOwnProperty.call(field, 'title')));
  assert.ok(searchCondition);
  assert.deepEqual(searchCondition[Op.or], [
    { title: { [Op.like]: '%dorm%' } },
    { desc: { [Op.like]: '%dorm%' } },
    { location: { [Op.like]: '%dorm%' } },
    { building: { [Op.like]: '%dorm%' } },
    { floor: { [Op.like]: '%dorm%' } },
    { room: { [Op.like]: '%dorm%' } },
    { phone: { [Op.like]: '%dorm%' } },
    { '$user.nickname$': { [Op.like]: '%dorm%' } },
    { '$user.phone$': { [Op.like]: '%dorm%' } }
  ]);
});

test('admin order list rejects search terms longer than 100 characters', async () => {
  const response = createResponse();
  await getAllOrderList({ query: { q: 'x'.repeat(101) } }, response);
  assert.equal(response.statusCode, 400);
});

test('admin order list applies category, location, date and sort filters', async () => {
  const response = createResponse();
  await getAllOrderList({
    query: {
      category: '水电故障',
      location: '1号楼',
      from: '2026-10-01',
      to: '2026-10-28',
      sort: 'waiting'
    }
  }, response);
  assert.equal(response.statusCode, 200);
  assert.ok(lastListWhere[Op.and].some((condition) => condition.aiCategory === '水电故障'));
  assert.ok(lastListWhere[Op.and].some((condition) => condition.createdAt));
  assert.equal(lastListOptions.order[0][0].val.includes("status = '待处理'"), true);
  assert.deepEqual(lastListOptions.order[1], ['createdAt', 'ASC']);

  const invalidDate = createResponse();
  await getAllOrderList({ query: { from: 'not-a-date' } }, invalidDate);
  assert.equal(invalidDate.statusCode, 400);
});

test('repair order creation persists a validated user-selected category and AI advice', async () => {
  aiServiceCalled = false;
  aiServiceResult = { category: '其他故障', suggestion: 'mock AI advice' };
  const response = createResponse();
  await createRepairOrder({
    user: student,
    body: {
      title: '漏水',
      desc: '水龙头附近漏水',
      location: '宿舍',
      mapAddress: '宿舍楼入口',
      latitude: 31.2304,
      longitude: 121.4737,
      additionalDescription: '靠近东侧入口',
      phone: '13800138000',
      category: '水电故障'
    }
  }, response);

  assert.equal(response.statusCode, 201);
  assert.equal(createdOrderValues.aiCategory, '水电故障');
  assert.equal(createdOrderValues.aiSuggest, 'mock AI advice');
  assert.equal(createdOrderValues.mapAddress, '宿舍楼入口');
  assert.equal(createdOrderValues.latitude, 31.2304);
  assert.equal(createdOrderValues.longitude, 121.4737);
  assert.equal(createdOrderValues.additionalDescription, '靠近东侧入口');
  assert.equal(createdOrderValues.phone, '13800138000');
  assert.equal(aiServiceCalled, true);
});

test('repair order creation rejects invalid map coordinates', async () => {
  const response = createResponse();
  await createRepairOrder({
    user: student,
    body: {
      title: '灯损坏',
      desc: '灯无法点亮',
      location: '宿舍',
      latitude: 95,
      longitude: 121
    }
  }, response);
  assert.equal(response.statusCode, 400);
});

test('repair order creation stores an uploaded image URL', async () => {
  const response = createResponse();
  await createRepairOrder({
    user: student,
    protocol: 'http',
    get: () => 'localhost:3000',
    file: {},
    body: {
      title: '漏水',
      desc: '水龙头附近漏水',
      location: '宿舍',
      category: '水电故障'
    }
  }, response);

  assert.equal(response.statusCode, 201);
  assert.equal(createdOrderValues.imgUrl, 'http://localhost:3000/uploads/test-image.png');
});

test('repair order creation rejects an unsupported category before running AI', async () => {
  aiServiceCalled = false;
  const response = createResponse();
  await createRepairOrder({
    user: student,
    body: {
      title: '设备故障',
      desc: '设备无法工作',
      location: '宿舍',
      category: '非法类型'
    }
  }, response);

  assert.equal(response.statusCode, 400);
  assert.equal(aiServiceCalled, false);
});

test('only students can submit, confirm, or request reopening repair orders', async () => {
  const adminUser = { id: admin.id, role: 'admin' };
  const submitResponse = createResponse();
  await createRepairOrder({ user: adminUser, body: {} }, submitResponse);
  assert.equal(submitResponse.statusCode, 403);

  const controller = require('../controllers/repairOrderController');
  const confirmResponse = createResponse();
  await controller.confirmOrderCompletion({
    user: adminUser,
    params: { id: '4' }
  }, confirmResponse);
  assert.equal(confirmResponse.statusCode, 403);

  const reopenResponse = createResponse();
  await controller.requestOrderReopen({
    user: adminUser,
    params: { id: '4' },
    body: { reason: '仍未修好' }
  }, reopenResponse);
  assert.equal(reopenResponse.statusCode, 403);
});

test('admin status and assignment changes are recorded and notify the student', async () => {
  const order = { id: 11, userId: student.id, title: '灯坏了', status: '待处理' };
  orders.push(order);
  const response = createResponse();
  await require('../controllers/repairOrderController').updateOrderStatus({
    user: { id: admin.id, role: 'admin' },
    params: { id: '11' },
    body: { status: 'processing', assignedTo: '水电维修组' }
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(order.status, '处理中');
  assert.equal(order.assignedTo, '水电维修组');
  assert.ok(orderHistory.some((event) => event.orderId === 11 && event.eventType === 'status'));
  assert.ok(notifications.some((item) => item.orderId === 11 && item.userId === student.id));
});

test('admins cannot edit completed orders', async () => {
  const order = { id: 15, userId: student.id, title: '已修复的灯', status: '已完成' };
  orders.push(order);
  const response = createResponse();
  await require('../controllers/repairOrderController').updateOrderStatus({
    user: { id: admin.id, role: 'admin' },
    params: { id: '15' },
    body: { status: 'processing', assignedTo: '水电维修组' }
  }, response);

  assert.equal(response.statusCode, 409);
  assert.equal(order.status, '已完成');
  assert.equal(order.assignedTo, undefined);
  assert.ok(!orderHistory.some((event) => event.orderId === 15));
});

test('students can rate completed orders once only', async () => {
  const order = { id: 12, userId: student.id, status: '已完成' };
  orders.push(order);

  const firstReview = createResponse();
  await createOrderReview({
    user: student,
    params: { id: '12' },
    body: { rating: 5, comment: '处理及时', feedbackType: 'quality' }
  }, firstReview);
  assert.equal(firstReview.statusCode, 201);
  assert.equal(firstReview.body.data.feedbackType, 'quality');

  const duplicateReview = createResponse();
  await createOrderReview({
    user: student,
    params: { id: '12' },
    body: { rating: 4 }
  }, duplicateReview);
  assert.equal(duplicateReview.statusCode, 409);

  const invalidRating = createResponse();
  await createOrderReview({
    user: student,
    params: { id: '12' },
    body: { rating: 6 }
  }, invalidRating);
  assert.equal(invalidRating.statusCode, 400);

  const invalidFeedbackType = createResponse();
  await createOrderReview({
    user: student,
    params: { id: '12' },
    body: { rating: 5, feedbackType: 'invalid' }
  }, invalidFeedbackType);
  assert.equal(invalidFeedbackType.statusCode, 400);
});

test('admins can list paginated reviews for completed orders', async () => {
  const response = createResponse();
  await getAdminOrderReviews({ query: { page: '2', size: '5' } }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.data.total, 1);
  assert.equal(response.body.data.page, 2);
  assert.equal(response.body.data.size, 5);
  assert.equal(response.body.data.totalPage, 1);
  assert.equal(lastReviewListOptions.offset, 5);
  assert.equal(lastReviewListOptions.limit, 5);
  assert.deepEqual(lastReviewListOptions.include[0].where, { status: '已完成' });
  assert.deepEqual(reviewRatingOptions.include[0].where, { status: '已完成' });
  assert.deepEqual(lowRatingOptions.include[0].where, { status: '已完成' });
});

test('admin review search matches review, order, and user fields', async () => {
  const response = createResponse();
  await getAdminOrderReviews({ query: { q: '漏水', page: '1', size: '10' } }, response);

  assert.equal(response.statusCode, 200);
  const search = lastReviewListOptions.where[Op.or];
  assert.ok(search.some((condition) => condition.comment));
  assert.ok(search.some((condition) => condition['$order.title$']));
  assert.ok(search.some((condition) => condition['$user.nickname$']));
  assert.deepEqual(reviewRatingOptions.where, lastReviewListOptions.where);
});

test('review list rejects invalid pagination', async () => {
  const response = createResponse();
  await getAdminOrderReviews({ query: { page: '0', size: '101' } }, response);
  assert.equal(response.statusCode, 400);
});

test('review list rejects search terms longer than 100 characters', async () => {
  const response = createResponse();
  await getAdminOrderReviews({ query: { q: 'x'.repeat(101) } }, response);
  assert.equal(response.statusCode, 400);
});

test('students can read and mark only their own in-app notifications', async () => {
  const createdNotification = notifications[0];
  assert.ok(createdNotification);
  const listResponse = createResponse();
  await getMyNotifications({ user: student }, listResponse);
  assert.ok(listResponse.body.data.list.some((item) => item.userId === student.id));

  const markResponse = createResponse();
  await markNotificationRead({
    user: student,
    params: { id: String(createdNotification.id) }
  }, markResponse);
  assert.equal(markResponse.statusCode, 200);
  assert.ok(createdNotification.readAt);

  const forbiddenNotification = { id: 999, userId: 55, readAt: null };
  notifications.push(forbiddenNotification);
  const forbidden = createResponse();
  await markNotificationRead({ user: student, params: { id: '999' } }, forbidden);
  assert.equal(forbidden.statusCode, 404);
});

test('admin dashboard reports queue metrics and grouped breakdowns', async () => {
  const response = createResponse();
  await getOrderStats({}, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.data.statusCounts['待处理'], orders.filter((item) => item.status === '待处理').length);
  assert.ok(Array.isArray(response.body.data.categories));
  assert.ok(Array.isArray(response.body.data.locations));
});
