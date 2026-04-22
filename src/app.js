const express = require('express');
const userRoutes = require('./routes/userRoutes');
const authRoutes = require('./routes/authRoutes');

const app = express();

app.use(express.json());

app.use('/api/users', userRoutes);
app.use('/api/auth', authRoutes);

app.use((req, res) => {
  return res.status(404).json({ message: 'Ruta no encontrada.' });
});

module.exports = app;
