const assert = require('node:assert/strict');
const { test } = require('node:test');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const Module = require('node:module');

process.env.JWT_SECRET = 'maintenance-workbench-test-secret-32-bytes';

const staffRows = [];
const orderRows = [
  { id: 21, userId: 7, assignedStaffId: 3, title: '水管维修', status: '待处理', assignedTo: '维修人员甲' },
  { id: 22, userId: 8, assignedStaffId: 4, title: '门锁维修', status: '待处理', assignedTo: '维修人员乙' },
  { id: 23, userId: 7, assignedStaffId: 3, title: '灯具维修', status: '处理中', assignedTo: '维修人员甲' },
  { id: 24, userId: 7, assignedStaffId: 3, title: '已完成工单', status: '已完成', assignedTo: '维修人员甲' }
];
const histories = [];
const notifications = [];
const auditRecords = [];
let lastOrderListOptions;

const makeStaff = (values) => {
  const row = {
    id: staffRows.length + 1,
    ...values,
    update: async (updates) => Object.assign(row, updates),
    save: async () => row,
    destroy: async () => {}
  };
  staffRows.push(row);
  return row;
};

const MaintenanceStaff = {
  unscoped: () => ({
    findOne: async ({ where }) => staffRows.find((row) =>
      row.username === where.username && row.type === where.type) || null,
    findByPk: async (id) => staffRows.find((row) => String(row.id) === String(id)) || null
  }),
  findAll: async () => staffRows,
  create: async (values) => {
    if (values.username && staffRows.some((row) => row.username === values.username)) {
      const error = new Error('duplicate username');
      error.name = 'SequelizeUniqueConstraintError';
      throw error;
    }
    return makeStaff(values);
  },
  findByPk: async (id) => staffRows.find((row) => String(row.id) === String(id)) || null
};

const RepairOrder = {
  findAll: async (options) => {
    lastOrderListOptions = options;
    return orderRows.filter((order) =>
      order.assignedStaffId === options.where.assignedStaffId);
  },
  findOne: async ({ where }) => {
    const order = orderRows.find((item) =>
      String(item.id) === String(where.id) &&
      item.assignedStaffId === where.assignedStaffId);
    return order || null;
  },
  count: async ({ where }) => orderRows.filter((order) =>
    order.assignedStaffId === where.assignedStaffId &&
    (!where.status || order.status === where.status)).length
};
const RepairOrderHistory = {
  create: async (values) => {
    histories.push(values);
    return values;
  },
  findAll: async () => histories
};
const Notification = {
  create: async (values) => {
    notifications.push(values);
    return values;
  }
};
const sequelize = {
  transaction: async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } })
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === '../models') {
    return {
      MaintenanceStaff,
      Notification,
      RepairOrder,
      RepairOrderHistory,
      User: {},
      sequelize
    };
  }
  if (request === '../middleware/repairImageUpload') {
    return {
      saveRepairImage: async () => 'maintenance-evidence.png',
      removeRepairImage: async () => {}
    };
  }
  if (request === '../services/adminAudit') {
    return {
      recordAdminAction: async (...args) => auditRecords.push(args)
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const {
  createMaintenanceStaff,
  updateMaintenanceStaff
} = require('../controllers/maintenanceStaffController');
const {
  login,
  listAssignedOrders,
  uploadCompletionEvidence,
  updateOrderProgress,
  getMaintenanceProfile,
  updateMaintenancePassword,
  listMaintenanceNotices
} = require('../controllers/maintenanceWorkbenchController');
Module._load = originalLoad;

const { isAdmin, isMaintenance } = require('../middleware/authJwt');

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

const callRole = (middleware, user) => {
  const result = { next: false, response: createResponse() };
  middleware({ user }, result.response, () => { result.next = true; });
  return result;
};

test('maintenance staff CRUD creates credentials only for persons and never returns hashes', async () => {
  const invalid = createResponse();
  await createMaintenanceStaff({
    user: { id: 1, role: 'admin' },
    body: { name: '缺少密码', type: 'person', username: 'worker.no-pass' }
  }, invalid);
  assert.equal(invalid.statusCode, 400);

  const team = createResponse();
  await createMaintenanceStaff({
    user: { id: 1, role: 'admin' },
    body: { name: '维修组', type: 'team', username: 'team.login', password: 'secure-pass-1' }
  }, team);
  assert.equal(team.statusCode, 400);

  const created = createResponse();
  await createMaintenanceStaff({
    user: { id: 1, role: 'admin' },
    body: {
      name: '维修人员甲',
      type: 'person',
      username: 'worker.alpha',
      password: 'secure-pass-1'
    }
  }, created);
  assert.equal(created.statusCode, 201);
  assert.equal(created.body.data.username, 'worker.alpha');
  assert.equal(Object.hasOwn(created.body.data, 'passwordHash'), false);
  assert.equal(Object.hasOwn(created.body.data, 'password'), false);
  assert.ok(await bcrypt.compare('secure-pass-1', staffRows[0].passwordHash));
  assert.equal(JSON.stringify(auditRecords).includes(staffRows[0].passwordHash), false);

  const duplicate = createResponse();
  await createMaintenanceStaff({
    user: { id: 1, role: 'admin' },
    body: {
      name: '重复人员',
      type: 'person',
      username: 'worker.alpha',
      password: 'secure-pass-2'
    }
  }, duplicate);
  assert.equal(duplicate.statusCode, 409);

  const oldHash = staffRows[0].passwordHash;
  const updated = createResponse();
  await updateMaintenanceStaff({
    user: { id: 1, role: 'admin' },
    params: { id: String(staffRows[0].id) },
    body: {
      name: '维修人员甲',
      type: 'person',
      username: 'worker.alpha',
      password: ''
    }
  }, updated);
  assert.equal(updated.statusCode, 200);
  assert.equal(staffRows[0].passwordHash, oldHash);
  assert.equal(Object.hasOwn(updated.body.data, 'passwordHash'), false);

  const passwordReset = createResponse();
  await updateMaintenanceStaff({
    user: { id: 1, role: 'admin' },
    params: { id: String(staffRows[0].id) },
    body: {
      name: '维修人员甲',
      type: 'person',
      username: '',
      password: 'secure-pass-3'
    }
  }, passwordReset);
  assert.equal(passwordReset.statusCode, 200);
  assert.notEqual(staffRows[0].passwordHash, oldHash);
  assert.ok(await bcrypt.compare('secure-pass-3', staffRows[0].passwordHash));
});

test('maintenance login issues a maintenance token and rejects invalid credentials', async () => {
  const success = createResponse();
  await login({ body: { username: ' worker.alpha ', password: 'secure-pass-3' } }, success);
  assert.equal(success.statusCode, 200);
  assert.equal(success.body.data.user.role, 'maintenance');
  assert.equal(success.body.data.user.staffId, staffRows[0].id);
  const decoded = jwt.verify(success.body.data.token, process.env.JWT_SECRET);
  assert.equal(decoded.role, 'maintenance');
  assert.equal(decoded.staffId, staffRows[0].id);
  assert.equal(JSON.stringify(success.body).includes(staffRows[0].passwordHash), false);

  for (const body of [
    { username: 'worker.alpha', password: 'wrong-password' },
    { username: 'worker alpha', password: 'secure-pass-1' },
    { username: 'worker.alpha', password: 'short' }
  ]) {
    const failure = createResponse();
    await login({ body }, failure);
    assert.ok([400, 401].includes(failure.statusCode));
  }
});

test('maintenance role is isolated and existing admin role checks remain strict', () => {
  assert.equal(callRole(isMaintenance, { role: 'maintenance', staffId: 3 }).next, true);
  assert.equal(callRole(isMaintenance, { role: 'maintenance' }).response.statusCode, 403);
  assert.equal(callRole(isMaintenance, { role: 'admin', id: 1 }).response.statusCode, 403);
  assert.equal(callRole(isAdmin, { role: 'admin', id: 1 }).next, true);
  assert.equal(callRole(isAdmin, { role: 'maintenance', staffId: 3 }).response.statusCode, 403);
});

test('maintenance order list and progress are limited to assigned staff and allowed transitions', async () => {
  const list = createResponse();
  await listAssignedOrders({ user: { role: 'maintenance', staffId: 3 } }, list);
  assert.equal(list.statusCode, 200);
  assert.deepEqual(list.body.data.map((order) => order.id), [21, 23, 24]);
  assert.equal(lastOrderListOptions.where.assignedStaffId, 3);
  assert.ok(lastOrderListOptions.attributes.includes('latitude'));
  assert.ok(lastOrderListOptions.attributes.includes('completionImgUrl'));
  assert.deepEqual(
    lastOrderListOptions.include.map((item) => item.attributes),
    [['nickname', 'phone'], ['id', 'name', 'type', 'phone']]
  );

  const forbiddenEvidence = createResponse();
  await uploadCompletionEvidence({
    user: { role: 'maintenance', staffId: 4 },
    params: { id: '23' },
    file: { mimetype: 'image/png', buffer: Buffer.from('image') },
    protocol: 'https',
    get: () => 'campus.example'
  }, forbiddenEvidence);
  assert.equal(forbiddenEvidence.statusCode, 404);
  assert.equal(orderRows[2].completionImgUrl, undefined);

  const evidence = createResponse();
  await uploadCompletionEvidence({
    user: { role: 'maintenance', staffId: 3 },
    params: { id: '23' },
    file: { mimetype: 'image/png', buffer: Buffer.from('image') },
    protocol: 'https',
    get: () => 'campus.example'
  }, evidence);
  assert.equal(evidence.statusCode, 200);
  assert.equal(
    evidence.body.data.completionImgUrl,
    'https://campus.example/uploads/maintenance-evidence.png'
  );
  assert.equal(orderRows[2].completionImgUrl, evidence.body.data.completionImgUrl);

  const unassignedWorker = createResponse();
  await updateOrderProgress({
    user: { role: 'maintenance', staffId: 4 },
    params: { id: '21' },
    body: { status: '处理中' }
  }, unassignedWorker);
  assert.equal(unassignedWorker.statusCode, 404);
  assert.equal(orderRows[0].status, '待处理');

  const invalidTransition = createResponse();
  await updateOrderProgress({
    user: { role: 'maintenance', staffId: 3 },
    params: { id: '21' },
    body: { status: '已完成' }
  }, invalidTransition);
  assert.equal(invalidTransition.statusCode, 409);

  const started = createResponse();
  await updateOrderProgress({
    user: { role: 'maintenance', staffId: 3 },
    params: { id: '21' },
    body: { status: '处理中' }
  }, started);
  assert.equal(started.statusCode, 200);
  assert.equal(orderRows[0].status, '处理中');
  assert.equal(histories.at(-1).actorRole, 'maintenance');
  assert.equal(notifications.at(-1).userId, 7);

  const completed = createResponse();
  await updateOrderProgress({
    user: { role: 'maintenance', staffId: 3 },
    params: { id: '21' },
    body: { status: '已完成', completionNote: '更换阀门并测试正常' }
  }, completed);
  assert.equal(completed.statusCode, 200);
  assert.equal(orderRows[0].completionNote, '更换阀门并测试正常');
  assert.equal(histories.at(-1).status, '已完成');
  assert.equal(histories.at(-1).remark, '更换阀门并测试正常');
  assert.equal(notifications.at(-1).userId, 7);

  const cannotRepeat = createResponse();
  await updateOrderProgress({
    user: { role: 'maintenance', staffId: 3 },
    params: { id: '21' },
    body: { status: '处理中' }
  }, cannotRepeat);
  assert.equal(cannotRepeat.statusCode, 409);
});

test('maintenance profile, password and notices endpoints provide assigned staff capabilities', async () => {
  const profile = createResponse();
  await getMaintenanceProfile({
    user: { role: 'maintenance', staffId: staffRows[0].id }
  }, profile);
  assert.equal(profile.statusCode, 200);
  assert.equal(profile.body.data.name, '维修人员甲');
  assert.equal(profile.body.data.stats.total >= 0, true);
  assert.equal(Object.hasOwn(profile.body.data, 'passwordHash'), false);

  const wrongPassword = createResponse();
  await updateMaintenancePassword({
    user: { role: 'maintenance', staffId: staffRows[0].id },
    body: { currentPassword: 'wrong-password', newPassword: 'new-secure-pass-1' }
  }, wrongPassword);
  assert.equal(wrongPassword.statusCode, 401);

  const changed = createResponse();
  await updateMaintenancePassword({
    user: { role: 'maintenance', staffId: staffRows[0].id },
    body: { currentPassword: 'secure-pass-3', newPassword: 'new-secure-pass-1' }
  }, changed);
  assert.equal(changed.statusCode, 200);
  assert.ok(await bcrypt.compare('new-secure-pass-1', staffRows[0].passwordHash));

  const notices = createResponse();
  await listMaintenanceNotices({
    user: { role: 'maintenance', staffId: 3 }
  }, notices);
  assert.equal(notices.statusCode, 200);
  assert.ok(Array.isArray(notices.body.data));
});
