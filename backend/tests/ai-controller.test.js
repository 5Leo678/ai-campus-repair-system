const assert = require('node:assert/strict');
const Module = require('node:module');
const { test } = require('node:test');

const adminAuditRecords = [];
const updatedOrder = {
  id: 8,
  title: '宿舍灯故障',
  desc: '灯持续闪烁',
  aiCategory: '其他故障',
  aiSuggest: '',
  update: async function update(values) {
    Object.assign(this, values);
  }
};

const RepairOrder = {
  findAll: async ({ attributes }) => {
    if (attributes[0] === 'aiCategory') return [{ aiCategory: '水电故障', count: '3' }];
    return [{ building: '1号楼', count: '2' }];
  },
  count: async ({ where }) => where[Object.getOwnPropertySymbols(where)[0]]
    ? 2
    : 5,
  findOne: async () => updatedOrder
};
const models = { RepairOrder };
const aiService = {
  getRepairAnalysis: async () => ({
    category: '水电故障',
    suggestion: '先关闭开关并联系维修人员'
  }),
  getRepairInsights: async () => ({
    available: true,
    summary: '近期水电报修较多。',
    observations: ['水电故障数量较高'],
    recommendations: ['检查重点楼栋公共设施']
  }),
  isAIConfigured: () => true
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === '../models') return models;
  if (request === '../services/aiService') return aiService;
  if (request === '../services/adminAudit') {
    return {
      recordAdminAction: async (...args) => adminAuditRecords.push(args)
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const {
  analyzeRepairDescription,
  getAdminRepairInsights,
  reanalyzeRepairOrder
} = require('../controllers/aiController');
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

test('student AI analysis validates role and returns safe analysis', async () => {
  const forbidden = createResponse();
  await analyzeRepairDescription({
    user: { id: 5, role: 'admin' },
    body: { description: '灯坏了' }
  }, forbidden);
  assert.equal(forbidden.statusCode, 403);

  const response = createResponse();
  await analyzeRepairDescription({
    user: { id: 5, role: 'student' },
    body: { description: '宿舍灯持续闪烁' }
  }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.data.category, '水电故障');
});

test('admin AI insights return aggregate metrics and AI interpretation', async () => {
  const response = createResponse();
  await getAdminRepairInsights({}, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.data.available, true);
  assert.equal(response.body.data.metrics.categoryCounts[0].count, 3);
  assert.equal(response.body.data.metrics.monthlyCounts.length, 6);
  assert.equal(response.body.data.summary, '近期水电报修较多。');
});

test('admin reanalysis updates the order and records an audit event', async () => {
  const response = createResponse();
  await reanalyzeRepairOrder({
    user: { id: 2, role: 'admin' },
    params: { id: '8' }
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(updatedOrder.aiCategory, '水电故障');
  assert.equal(updatedOrder.aiSuggest, '先关闭开关并联系维修人员');
  assert.equal(adminAuditRecords.at(-1)[1], 'order.ai.reanalyze');
});
