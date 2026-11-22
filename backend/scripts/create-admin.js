const bcrypt = require('bcrypt');
const { sequelize } = require('../config/db');
const { AdminUser } = require('../models');

const promptHidden = (prompt) => new Promise((resolve, reject) => {
  const input = process.stdin;
  if (!input.isTTY || typeof input.setRawMode !== 'function') {
    reject(new Error('Run this script in an interactive terminal.'));
    return;
  }

  let value = '';
  const cleanup = () => {
    input.removeListener('data', onData);
    input.setRawMode(false);
    input.pause();
    process.stdout.write('\n');
  };
  const onData = (key) => {
    const character = key.toString('utf8');
    if (character === '\u0003') {
      cleanup();
      reject(new Error('Operation cancelled.'));
    } else if (character === '\r' || character === '\n') {
      cleanup();
      resolve(value);
    } else if (character === '\u007f' || character === '\b') {
      value = value.slice(0, -1);
    } else if (character >= ' ') {
      value += character;
    }
  };

  process.stdout.write(prompt);
  input.setRawMode(true);
  input.resume();
  input.on('data', onData);
});

const main = async () => {
  const [username, name] = process.argv.slice(2);
  if (!username || !name || username.length > 64 || name.length > 64) {
    throw new Error('Usage: node scripts/create-admin.js <username> <display-name>');
  }

  const password = await promptHidden('Admin password (12-72 bytes): ');
  const confirmation = await promptHidden('Confirm password: ');
  const passwordLength = Buffer.byteLength(password, 'utf8');
  if (password !== confirmation) {
    throw new Error('Passwords do not match.');
  }
  if (passwordLength < 12 || passwordLength > 72) {
    throw new Error('Password must be between 12 and 72 bytes.');
  }

  await sequelize.authenticate();
  await AdminUser.sync();

  const existingAdmin = await AdminUser.findOne({ where: { username } });
  if (existingAdmin) {
    throw new Error('An administrator with this username already exists.');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await AdminUser.create({ username, name, password: passwordHash });
  console.log(`Administrator "${username}" created.`);
};

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
