const mysql = require('mysql2/promise');

(async () => {
  try {
    const connection = await mysql.createConnection({
      host: 'maglev.proxy.rlwy.net',
      port: 57840,
      user: 'root',
      password: 'bdrkGrNiXjKzodLKVHNPonETwdNBWfKm',
      database: 'sistema_eventos',
      ssl: { rejectUnauthorized: false }
    });
    const [rows] = await connection.query('SHOW TABLES');
    console.log('Conexión exitosa. Tablas:');
    console.table(rows);
    await connection.end();
    process.exit(0);
  } catch (err) {
    console.error('Error de conexión:', err.message);
    process.exit(1);
  }
})();
