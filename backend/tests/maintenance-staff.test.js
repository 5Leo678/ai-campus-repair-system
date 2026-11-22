const assert = require('node:assert/strict');
const { test } = require('node:test');
const Module = require('node:module');

const staffRecords = [];
const auditRecords = [];
const orderModel = {
  update: async () => [0],
  findAll: async () => [
    { id: 11, status: '待处理', assignedStaffId: 31, assignedTo: null, createdAt: new Date() }
  ]
};
const AdminAuditLog = {
  create: async (record) => {
    auditRecords.push(record);
    return record;
  }
};
const historyModel = { findAll: async () => [] };
const MaintenanceStaff = {
  findAll: async () => staffRecords.slice().sort((left, right) =>
    right.id - left.id),
  create: async (values) => {
    const staff = { id: staffRecords.length + 1, ...values };
    staffRecords.push(staff);
    return staff;
  },
  findByPk: async (id) => {
    const staff = staffRecords.find((item) => String(item.id) === String(id));
    if (!staff) return null;
    const row = {
      ...staff,
      update: async (values) => {
        Object.assign(staff, values);
        Object.assign(row, values);
      },
      destroy: async () => {
        const index = staffRecords.findIndex((item) => item.id === staff.id);
        staffRecords.splice(index, 1);
      }
    };
    return row;
  }
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === '../models') {
    return {
      MaintenanceStaff,
      RepairOrder: orderModel,
      RepairOrderHistory: historyModel,
      AdminAuditLog
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const {
  createMaintenanceStaff,
  deleteMaintenanceStaff,
  getMaintenanceStaff,
  getMaintenanceWorkload,
  updateMaintenanceStaff
} = require('../controllers/maintenanceStaffController');
Module._load = originalLoad;
const admin = { id: 1, role: 'admin' };

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

test('maintenance staff CRUD validates input and persists person and team entries', async () => {
  const createResponseObject = createResponse();
  await createMaintenanceStaff({
    user: admin,
    body: {
      name: ' 水电维修组 ',
      type: 'team',
      phone: ' 123456 ',
      description: ' 校园水电维修 '
    }
  }, createResponseObject);
  assert.equal(createResponseObject.statusCode, 201);
  assert.deepEqual(
    {
      name: createResponseObject.body.data.name,
      type: createResponseObject.body.data.type,
      phone: createResponseObject.body.data.phone,
      description: createResponseObject.body.data.description
    },
    {
      name: '水电维修组',
      type: 'team',
      phone: '123456',
      description: '校园水电维修'
    }
  );

  const invalidResponse = createResponse();
  await createMaintenanceStaff({
    body: { name: '', type: 'crew' }
  }, invalidResponse);
  assert.equal(invalidResponse.statusCode, 400);

  const listResponse = createResponse();
  await getMaintenanceStaff({}, listResponse);
  assert.equal(listResponse.body.data.length, 1);

  const updateResponse = createResponse();
  await updateMaintenanceStaff({
    user: admin,
    params: { id: '1' },
    body: { name: '李师傅', type: 'person', phone: '', description: '' }
  }, updateResponse);
  assert.equal(updateResponse.statusCode, 200);
  assert.equal(updateResponse.body.data.name, '李师傅');
  assert.equal(staffRecords[0].type, 'person');

  const deleteResponse = createResponse();
  await deleteMaintenanceStaff({ user: admin, params: { id: '1' } }, deleteResponse);
  assert.equal(deleteResponse.statusCode, 200);
  assert.equal(staffRecords.length, 0);
});

test('maintenance staff update and delete return 404 for unknown ids', async () => {
  const body = { name: '测试人员', type: 'person' };
  const updateResponse = createResponse();
  await updateMaintenanceStaff({ user: admin, params: { id: '999' }, body }, updateResponse);
  assert.equal(updateResponse.statusCode, 404);

  const deleteResponse = createResponse();
  await deleteMaintenanceStaff({ user: admin, params: { id: '999' } }, deleteResponse);
  assert.equal(deleteResponse.statusCode, 404);
});

test('maintenance workload exposes usernames but never password hashes', async () => {
  staffRecords.push({
    id: 31,
    name: '可登录维修人员',
    type: 'person',
    username: 'workbench.worker',
    passwordHash: '$2b$10$secret-hash-must-not-leak'
  });
  staffRecords.push({
    id: 32,
    name: '无账号维修人员',
    type: 'person',
    username: null,
    passwordHash: null
  });

  const response = createResponse();
  await getMaintenanceWorkload({}, response);

  assert.equal(response.statusCode, 200);
  const worker = response.body.data.staff.find((member) => member.id === 31);
  const noAccount = response.body.data.staff.find((member) => member.id === 32);
  assert.equal(worker.username, 'workbench.worker');
  assert.equal(noAccount.username, null);
  assert.equal(JSON.stringify(response.body).includes('passwordHash'), false);
  assert.equal(JSON.stringify(response.body).includes('$2b$10$secret-hash-must-not-leak'), false);
});
