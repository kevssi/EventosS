const mysql = require('mysql2/promise');
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const databaseUrl = process.env.DATABASE_URL || process.env.MYSQL_URL || null;

let poolConfig;
if (databaseUrl) {
  // mysql2 no acepta uri como clave de objeto — hay que parsear la URL manualmente
  let parsed = {};
  try {
    const u = new URL(databaseUrl);
    parsed = {
      host: u.hostname,
      port: u.port ? parseInt(u.port, 10) : 3306,
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: u.pathname.replace(/^\//, '')
    };
  } catch (_err) {
    console.warn('[database] No se pudo parsear DATABASE_URL:', _err.message);
  }

  poolConfig = {
    ...parsed,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: {
      rejectUnauthorized: false
    }
  };
} else {
  const missing = ['DB_HOST', 'DB_USER', 'DB_NAME'].filter((name) => !process.env[name]);
  if (missing.length > 0) {
    // Warn in console but do NOT throw — let the server start and fail gracefully per-request
    console.warn(`[database] Advertencia: Faltan variables de entorno: ${missing.join(', ')}. Las consultas a BD fallarán.`);
  }

  poolConfig = {
    host: process.env.DB_HOST || process.env.MYSQLHOST || process.env.MYSQL_HOST,
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : (process.env.MYSQLPORT ? parseInt(process.env.MYSQLPORT, 10) : (process.env.MYSQL_PORT ? parseInt(process.env.MYSQL_PORT, 10) : 3306)),
    user: process.env.DB_USER || process.env.MYSQLUSER || process.env.MYSQL_USER,
    password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || process.env.MYSQL_PASSWORD || '',
    database: process.env.DB_NAME || process.env.MYSQLDATABASE || process.env.MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: {
      rejectUnauthorized: false
    }
  };
}

const pool = mysql.createPool(poolConfig);

module.exports = pool;
