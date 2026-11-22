require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('node:path');

const { sequelize, testConnection } = require('./config/db');
const models = require('./models');
const router = require('./routes');
const { attachResponseHelpers, errorHandler } = require('./middleware/responseHandler');
const { verifyToken, isAdmin } = require('./middleware/authJwt');
const { validateSecurityConfig } = require('./config/security');
const ensureWorkflowFields = require('./migrations/ensure-workflow-fields');
const requestLogger = require('./middleware/requestLogger');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || !allowedOrigins.length || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Origin is not allowed'));
  }
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(attachResponseHelpers);
if (process.env.NODE_ENV !== 'test') app.use(requestLogger);

const loginAttempts = new Map();
const loginRateLimiter = (req, res, next) => {
  const key = `${req.ip}:${req.body?.username || ''}`;
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const attempts = (loginAttempts.get(key) || []).filter((time) => now - time < windowMs);
  if (attempts.length >= 10) {
    return res.status(429).json({
      code: 429,
      msg: '登录尝试过于频繁，请15分钟后重试',
      data: null
    });
  }
  attempts.push(now);
  loginAttempts.set(key, attempts);
  next();
};

app.use('/api/auth/adminlogin', loginRateLimiter);
app.use('/api/maintenance/auth/login', loginRateLimiter);

app.get('/health', async (_req, res) => {
  try {
    await sequelize.authenticate();
    res.success(200, 'service healthy', {
      service: 'campus-repair-backend',
      database: 'connected'
    });
  } catch (error) {
    res.status(503).json({
      code: 503,
      msg: 'database unavailable',
      data: null
    });
  }
});

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/api', router);

app.get('/', (req, res) => {
  res.success(200, '校园AI报修系统后端服务已启动', {
    service: 'campus-repair-backend'
  });
});

app.use((req, res) => {
  res.status(404).json({
    code: 404,
    msg: '接口不存在',
    data: null
  });
});

app.use(errorHandler);

async function startServer() {
  try {
    validateSecurityConfig();
    await testConnection();

    await sequelize.sync();
    await ensureWorkflowFields(sequelize);
    console.log('✅ 数据库表同步成功');

    app.listen(PORT, () => {
      console.log(`🚀 服务已启动，访问地址: http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('❌ 数据库同步失败或服务启动失败:');
    console.error(error);
    process.exit(1);
  }
}

startServer();

module.exports = app;
