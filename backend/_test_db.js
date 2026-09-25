const mysql = require('mysql2/promise');
(async () => {
  try {
    console.log('Testing connection to 127.0.0.1:3306...');
    const conn = await mysql.createConnection({
      host: '127.0.0.1',
      port: 3306,
      user: 'root'
    });
    const [rows] = await conn.execute('SHOW DATABASES');
    console.log('Connected! Databases:', rows.map(r => Object.values(r)[0]));
    await conn.end();
  } catch (e) {
    console.error('FAILED:', e.message);
  }
})();
