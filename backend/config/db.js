  const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(
  process.env.DB_NAME || 'campus_repair',
  process.env.DB_USER || 'root',
  process.env.DB_PASS || '',
  {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    dialect: 'mysql',
    logging: false,
    timezone: '+08:00',
    define: {
      timestamps: true,
      charset: 'utf8mb4',
      collate: 'utf8mb4_general_ci'
    }
  }
);

async function testConnection() {
  try {
    await sequelize.authenticate();
    console.log('✅ MySQL connection successful.');
  } catch (error) {
    console.error('❌ MySQL connection failed:');
    console.error(error.message);
  }
}

module.exports = { sequelize, testConnection };
