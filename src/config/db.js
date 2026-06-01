const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
});

async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

module.exports = {
  pool,
  query,
};

console.log({
  DB_HOST: process.env.DB_HOST,
  DB_PORT: process.env.DB_PORT,
  DB_USER: process.env.DB_USER,
  DB_NAME: process.env.DB_NAME,
});

pool.query('SHOW TABLES')
  .then(([rows]) => console.log(rows))
  .catch(err => console.error(err));

  (async () => {
    try {
      const [tables] = await pool.query('SHOW TABLES');
      console.log('TABLAS:', tables);
    } catch (err) {
      console.error('ERROR DB:', err);
    }
  })();

  (async () => {
    const [rows] = await pool.query(`
      SELECT
        DATABASE() AS db,
        USER() AS user,
        @@port AS port
    `);
  
    console.log(rows);
  })();