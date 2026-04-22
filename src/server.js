require('dotenv').config();
const app = require('./app');
const { query, pool } = require('./config/db');

const port = Number(process.env.PORT);

async function startServer() {
  try {
    await query('SELECT 1');

    app.listen(port, () => {
      // eslint-disable-next-line no-console
      console.log(`Servidor corriendo en http://localhost:${port}`);
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('No se pudo iniciar el servidor:', error.message);
    await pool.end();
    process.exit(1);
  }
}

startServer();
