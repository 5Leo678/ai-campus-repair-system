require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const backupDir = path.resolve(process.argv[2] || '');
const confirmationProvided = process.argv.includes('--confirm');

const databaseConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: String(Number(process.env.DB_PORT) || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  name: process.env.DB_NAME || 'campus_repair'
};

const restoreDatabase = (databaseFile) => new Promise((resolve, reject) => {
  const child = spawn('mysql', [
    '--host', databaseConfig.host,
    '--port', databaseConfig.port,
    '--user', databaseConfig.user,
    '--database', databaseConfig.name
  ], {
    env: { ...process.env, MYSQL_PWD: databaseConfig.password },
    stdio: ['pipe', 'inherit', 'inherit']
  });
  const input = fs.createReadStream(databaseFile);
  input.pipe(child.stdin);
  input.once('error', (error) => {
    child.kill();
    reject(error);
  });
  child.once('error', (error) => reject(error));
  child.once('close', (code) => {
    if (code === 0) resolve();
    else reject(new Error(`mysql 退出码：${code}`));
  });
});

const restoreBackup = async () => {
  if (!process.argv[2] || !confirmationProvided) {
    throw new Error('用法：node scripts/restore.js <备份目录> --confirm；该操作会覆盖数据库中的同名表。');
  }

  const databaseFile = path.join(backupDir, 'database.sql');
  const uploadSource = path.join(backupDir, 'uploads');
  const uploadDestination = path.resolve(__dirname, '..', 'uploads');
  if (!fs.existsSync(backupDir) || !fs.statSync(backupDir).isDirectory() ||
      !fs.existsSync(databaseFile) || !fs.statSync(databaseFile).isFile() ||
      !fs.existsSync(uploadSource) || !fs.statSync(uploadSource).isDirectory()) {
    throw new Error('备份目录必须同时包含 database.sql 和 uploads/。');
  }

  await restoreDatabase(databaseFile);
  fs.mkdirSync(uploadDestination, { recursive: true });
  fs.cpSync(uploadSource, uploadDestination, { recursive: true, force: true });
  console.log(`恢复完成：${backupDir}`);
};

restoreBackup().catch((error) => {
  console.error('恢复失败:', error.message);
  process.exitCode = 1;
});
