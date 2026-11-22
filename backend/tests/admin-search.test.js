const assert = require('node:assert/strict');
const Module = require('node:module');
const { test } = require('node:test');
const { Op } = require('sequelize');

let capturedQuery;
const models = {
  AdminAuditLog: {
    findAndCountAll: async (query) => {
      capturedQuery = query;
      return { count: 1, rows: [{ id: 1 }] };
    }
  },
  AdminUser: {},
  RepairOrder: {},
  RepairOrderHistory: {},
  RepairOrderReview: {},
  SystemSetting: {}
};
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === '../models') return models;
  if (request === '../services/adminAudit') return { recordAdminAction: async () => {} };
  return originalLoad.call(this, request, parent, isMain);
};
const { listAdminAuditLogs } = require('../controllers/adminWorkflowController');
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

test('admin audit log search covers action, target, details, and administrator', async () => {
  const response = createResponse();
  await listAdminAuditLogs({ query: { q: '校园管理员', page: '1', size: '20' } }, response);

  assert.equal(response.statusCode, 200);
  const conditions = capturedQuery.where[Op.or];
  assert.ok(conditions.some((item) => item.action));
  assert.ok(conditions.some((item) => item.targetType));
  assert.ok(conditions.some((item) => item.details));
  assert.ok(conditions.some((item) => item['$admin.name$']));
  assert.equal(capturedQuery.include[0].required, false);
});

test('admin audit log search rejects terms longer than 100 characters', async () => {
  const response = createResponse();
  await listAdminAuditLogs({ query: { q: 'x'.repeat(101) } }, response);
  assert.equal(response.statusCode, 400);
});
