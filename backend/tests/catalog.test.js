const assert = require('node:assert/strict');
const Module = require('node:module');
const { test } = require('node:test');

let existingEntry;
const adminActions = [];
const models = {
  RepairCatalog: {
    findByPk: async () => existingEntry,
    findOrCreate: async ({ where }) => {
      if (existingEntry) return [existingEntry, false];
      existingEntry = {
        id: 1,
        ...where,
        active: true,
        update: async function update(values) {
          Object.assign(this, values);
        }
      };
      return [existingEntry, true];
    }
  }
};
const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === '../models') return models;
  if (request === '../services/adminAudit') {
    return {
      recordAdminAction: async (...args) => adminActions.push(args)
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const {
  activateCatalogEntry,
  createCatalogEntry
} = require('../controllers/catalogController');
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

test('adding a disabled catalog entry reactivates it with a distinct audit action', async () => {
  existingEntry = {
    id: 9,
    type: 'category',
    value: '网络故障',
    active: false,
    update: async function update(values) {
      Object.assign(this, values);
    }
  };
  adminActions.length = 0;
  const res = response();

  await createCatalogEntry({
    body: { type: 'category', value: '网络故障' },
    user: { id: 1, role: 'admin' }
  }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.msg, '目录项已重新启用');
  assert.equal(existingEntry.active, true);
  assert.equal(adminActions[0][1], 'catalog.activate');
});

test('adding a catalog entry that is already active remains a conflict', async () => {
  existingEntry = {
    id: 10,
    type: 'building',
    value: '1号楼',
    active: true,
    update: async function update(values) {
      Object.assign(this, values);
    }
  };
  const res = response();

  await createCatalogEntry({
    body: { type: 'building', value: '1号楼' },
    user: { id: 1, role: 'admin' }
  }, res);

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.msg, '该目录项已存在');
});

test('activating a disabled catalog entry targets its id and marks it active', async () => {
  existingEntry = {
    id: 21,
    type: 'category',
    value: '其他故障',
    active: false,
    update: async function update(values) {
      Object.assign(this, values);
    }
  };
  adminActions.length = 0;
  const res = response();

  await activateCatalogEntry({
    params: { id: '21' },
    user: { id: 1, role: 'admin' }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.msg, '目录项已重新启用');
  assert.equal(existingEntry.active, true);
  assert.equal(adminActions[0][1], 'catalog.activate');
});

test('activating an already active catalog entry returns a conflict', async () => {
  existingEntry = {
    id: 22,
    type: 'category',
    value: '水电故障',
    active: true,
    update: async function update(values) {
      Object.assign(this, values);
    }
  };
  const res = response();

  await activateCatalogEntry({
    params: { id: '22' },
    user: { id: 1, role: 'admin' }
  }, res);

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.msg, '该目录项已启用');
});
