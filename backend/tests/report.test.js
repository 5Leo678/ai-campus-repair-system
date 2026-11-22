const assert = require('node:assert/strict');
const Module = require('node:module');
const { test } = require('node:test');
const { Op } = require('sequelize');

let lastQuery;
const adminAuditRecords = [];
const orders = [{
  id: 21,
  title: '=HYPERLINK("https://example.test")',
  desc: '灯不亮',
  location: '1号楼 101',
  status: '已完成',
  aiCategory: '水电故障',
  assignedTo: '维修组',
  createdAt: new Date('2026-03-01T04:00:00Z'),
  updatedAt: new Date('2026-03-02T04:00:00Z'),
  user: { nickname: '用户', phone: '13800000000' }
}];
const models = {
  RepairOrder: {
    findAll: async (query) => {
      lastQuery = query;
      return orders;
    }
  },
  User: {},
  AdminAuditLog: {
    create: async (record) => {
      adminAuditRecords.push(record);
      return record;
    }
  }
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === '../models') return models;
  return originalLoad.call(this, request, parent, isMain);
};
const { exportOrdersCsv } = require('../controllers/reportController');
Module._load = originalLoad;

const createResponse = () => ({
  statusCode: 200,
  headers: {},
  status(code) {
    this.statusCode = code;
    return this;
  },
  setHeader(name, value) {
    this.headers[name] = value;
  },
  send(body) {
    this.body = body;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  }
});

test('CSV export applies the selected filters and prevents formula injection', async () => {
  const response = createResponse();
  await exportOrdersCsv({
    user: { id: 4 },
    query: {
      status: 'finished',
      category: '新类别',
      location: '1号楼',
      q: '灯',
      from: '2026-03-01',
      to: '2026-03-31',
      sort: 'waiting'
    }
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['Content-Type'], 'text/csv; charset=utf-8');
  assert.match(response.body, /'=HYPERLINK/);
  assert.match(response.body, /工单编号/);
  assert.equal(lastQuery.paranoid, false);
  const filters = lastQuery.where[Op.and];
  assert.ok(filters.some((filter) => filter.status === '已完成'));
  assert.ok(filters.some((filter) => filter.aiCategory === '新类别'));
  assert.ok(filters.some((filter) => filter.createdAt));
  assert.equal(adminAuditRecords[adminAuditRecords.length - 1].action, 'report.export');
});

test('CSV export rejects unsupported filters before querying orders', async () => {
  const response = createResponse();
  const queryBeforeRequest = lastQuery;
  await exportOrdersCsv({ user: { id: 4 }, query: { from: '2026-02-31' } }, response);
  assert.equal(response.statusCode, 400);
  assert.equal(lastQuery, queryBeforeRequest);
});
