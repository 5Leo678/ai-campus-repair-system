require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const backendRoot = path.resolve(__dirname, '..');
const backupRoot = path.resolve(process.argv[2] || path.join(backendRoot, 'backups'));
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(backupRoot, `backup-${timestamp}`);
const databaseFile = path.join(backupDir, 'database.sql');
const uploadSource = path.join(backendRoot, 'uploads');
const uploadDestination = path.join(backupDir, 'uploads');

const databaseConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: String(Number(process.env.DB_PORT) || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  name: process.env.DB_NAME || 'campus_repair'
};

const runDump = () => new Promise((resolve, reject) => {
  const fileDescriptor = fs.openSync(databaseFile, 'wx');
  const child = spawn('mysqldump', [
    '--host', databaseConfig.host,
    '--port', databaseConfig.port,
    '--user', databaseConfig.user,
    '--single-transaction',
    '--routines',
    '--triggers',
    databaseConfig.name
  ], {
    env: { ...process.env, MYSQL_PWD: databaseConfig.password },
    stdio: ['ignore', fileDescriptor, 'inherit']
  });

  child.once('error', (error) => reject(error));
  child.once('close', (code) => {
    fs.closeSync(fileDescriptor);
    if (code === 0) resolve();
    else reject(new Error(`mysqldump 退出码：${code}`));
  });
});

const createBackup = async () => {
  fs.mkdirSync(backupRoot, { recursive: true });
  fs.mkdirSync(backupDir, { recursive: false });
  try {
    await runDump();
    fs.mkdirSync(uploadDestination, { recursive: true });
    if (fs.existsSync(uploadSource)) {
      fs.cpSync(uploadSource, uploadDestination, { recursive: true });
    }
    console.log(`备份完成：${backupDir}`);
  } catch (error) {
    fs.rmSync(backupDir, { recursive: true, force: true });
    throw error;
  }
};

createBackup().catch((error) => {
  console.error('备份失败:', error.message);
  process.exitCode = 1;
});
