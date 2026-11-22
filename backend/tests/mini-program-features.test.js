const assert = require('node:assert/strict');
const Module = require('node:module');
const { test } = require('node:test');

const savedUsers = new Map();
const existingOrders = new Map([
  ['11', { id: 11, userId: 7, title: '灯损坏', deletedAt: null }],
  ['12', { id: 12, userId: 9, title: '水管漏水', deletedAt: null }]
]);
const savedMessages = [];
const savedNotifications = [];
const removedImages = [];
let transactionCount = 0;
let savedImageName = 'message-image.png';
const models = {
  User: {
    findByPk: async (id) => savedUsers.get(id) || null
  },
  RepairOrder: {
    findByPk: async (id) => existingOrders.get(String(id)) || null
  },
  RepairOrderMessage: {
    findAll: async ({ where, attributes }) => {
      assert.deepEqual(where, { orderId: 11 });
      assert.ok(!attributes.includes('actorId'));
      return savedMessages
        .filter((message) => message.orderId === 11)
        .map((message) => Object.fromEntries(attributes.map((attribute) => [
          attribute,
          message[attribute]
        ])));
    },
    create: async (values) => {
      const message = { id: savedMessages.length + 1, createdAt: new Date(), ...values };
      savedMessages.push(message);
      return message;
    }
  },
  Notification: {
    create: async (values) => {
      savedNotifications.push(values);
      return values;
    }
  },
  sequelize: {
    transaction: async (callback) => {
      transactionCount += 1;
      return callback({});
    }
  }
};
const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === '../models') return models;
  if (request === '../middleware/repairImageUpload') {
    return {
      saveRepairImage: async () => savedImageName,
      removeRepairImage: async (filename) => removedImages.push(filename)
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const {
  getMyProfile,
  updateMyProfile,
  uploadMyAvatar
} = require('../controllers/userController');
const { createOrderMessage, listOrderMessages } = require('../controllers/orderMessageController');
Module._load = originalLoad;

const response = () => ({
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

test('profile updates accept only editable fields and deny administrator tokens', async () => {
  const saved = {
    id: 7,
    nickname: '旧昵称',
    phone: null,
    role: 'student',
    openid: 'private-openid',
    save: async function save() { this.saved = true; }
  };
  savedUsers.set(7, saved);

  const updated = response();
  await updateMyProfile({
    user: { id: 7, role: 'student' },
    body: { nickname: '新昵称', phone: '13800138000', role: 'admin', openid: 'attacker' }
  }, updated);
  assert.equal(updated.statusCode, 200);
  assert.equal(saved.nickname, '新昵称');
  assert.equal(saved.role, 'student');
  assert.equal(saved.openid, 'private-openid');

  const denied = response();
  await getMyProfile({ user: { id: 7, role: 'admin' } }, denied);
  assert.equal(denied.statusCode, 403);
});

test('avatar upload updates only the authenticated user and rejects admin role', async () => {
  removedImages.length = 0;
  const saved = {
    id: 7,
    avatarUrl: null,
    save: async function save() { this.saved = true; }
  };
  savedUsers.set(7, saved);

  const uploaded = response();
  await uploadMyAvatar({
    user: { id: 7, role: 'student' },
    file: { mimetype: 'image/png' },
    protocol: 'http',
    get: () => 'localhost:3000'
  }, uploaded);
  assert.equal(uploaded.statusCode, 200);
  assert.equal(saved.avatarUrl, 'http://localhost:3000/uploads/message-image.png');
  assert.equal(uploaded.body.data.avatarUrl, saved.avatarUrl);

  const denied = response();
  await uploadMyAvatar({
    user: { id: 14, role: 'admin' },
    file: { mimetype: 'image/png' }
  }, denied);
  assert.equal(denied.statusCode, 403);

  const missingFile = response();
  await uploadMyAvatar({ user: { id: 7, role: 'student' } }, missingFile);
  assert.equal(missingFile.statusCode, 400);

  const missingUser = response();
  await uploadMyAvatar({
    user: { id: 99, role: 'student' },
    file: { mimetype: 'image/png' }
  }, missingUser);
  assert.equal(missingUser.statusCode, 404);

  savedImageName = 'orphaned-avatar.png';
  const failingUser = {
    id: 8,
    save: async () => { throw new Error('database unavailable'); }
  };
  savedUsers.set(8, failingUser);
  const failedUpload = response();
  await uploadMyAvatar({
    user: { id: 8, role: 'student' },
    file: { mimetype: 'image/png' },
    protocol: 'http',
    get: () => 'localhost:3000'
  }, failedUpload);
  assert.equal(failedUpload.statusCode, 500);
  assert.deepEqual(removedImages, ['orphaned-avatar.png']);
  savedImageName = 'message-image.png';
});

test('messages are restricted to the owner and reads omit private actor identifiers', async () => {
  savedMessages.length = 0;
  const denied = response();
  await createOrderMessage({
    user: { id: 7, role: 'student' },
    params: { id: '12' },
    body: { content: '不属于我的工单' }
  }, denied);
  assert.equal(denied.statusCode, 404);
  assert.equal(savedMessages.length, 0);

  const created = response();
  await createOrderMessage({
    user: { id: 7, role: 'student' },
    params: { id: '11' },
    body: { content: '补充一下故障发生时间' },
    protocol: 'http',
    get: () => 'localhost:3000'
  }, created);
  assert.equal(created.statusCode, 201);

  const listed = response();
  await listOrderMessages({
    user: { id: 7, role: 'student' },
    params: { id: '11' }
  }, listed);
  assert.equal(listed.statusCode, 200);
  assert.equal(listed.body.data.length, 1);
  assert.equal(Object.prototype.hasOwnProperty.call(listed.body.data[0], 'actorId'), false);
});

test('administrator replies create a user notification transactionally', async () => {
  const created = response();
  await createOrderMessage({
    user: { id: 14, role: 'admin' },
    params: { id: '11' },
    body: { content: '维修人员已收到补充信息' },
    protocol: 'http',
    get: () => 'localhost:3000'
  }, created);
  assert.equal(created.statusCode, 201);
  assert.equal(transactionCount, 2);
  assert.equal(savedNotifications.length, 1);
  assert.equal(savedNotifications[0].userId, 7);
});

test('message content is validated before persistence', async () => {
  const invalid = response();
  await createOrderMessage({
    user: { id: 7, role: 'student' },
    params: { id: '11' },
    body: { content: '   ' }
  }, invalid);
  assert.equal(invalid.statusCode, 400);
});
