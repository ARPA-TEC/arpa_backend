const bcrypt = require('bcryptjs');
const { query } = require('../config/db');

const ROLE = {
  ADMIN: 'ADMINISTRADOR',
  TUTOR: 'TUTOR',
  STUDENT: 'ALUMNO',
};

function isEmpty(value) {
  return !value || String(value).trim() === '';
}

async function createAdmin(req, res) {
  const { nombre, apellido, email, password } = req.body;

  if ([nombre, apellido, email, password].some(isEmpty)) {
    return res.status(400).json({ message: 'nombre, apellido, email y password son obligatorios.' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);

    const result = await query(
      'INSERT INTO users (role, nombre, apellido, email, password_hash) VALUES (?, ?, ?, ?, ?)',
      [ROLE.ADMIN, nombre.trim(), apellido.trim(), email.trim().toLowerCase(), passwordHash],
    );

    return res.status(201).json({
      message: 'Administrador creado correctamente.',
      user: {
        id: Number(result.insertId),
        role: ROLE.ADMIN,
        nombre: nombre.trim(),
        apellido: apellido.trim(),
        email: email.trim().toLowerCase(),
      },
    });
  } catch (error) {
    if (error && error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'El email ya esta registrado.' });
    }

    return res.status(500).json({ message: 'Error al crear administrador.', error: error.message });
  }
}

async function createTutor(req, res) {
  const { nombre, apellido, email, password } = req.body;

  if ([nombre, apellido, email, password].some(isEmpty)) {
    return res.status(400).json({ message: 'nombre, apellido, email y password son obligatorios.' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);

    const result = await query(
      'INSERT INTO users (role, nombre, apellido, email, password_hash) VALUES (?, ?, ?, ?, ?)',
      [ROLE.TUTOR, nombre.trim(), apellido.trim(), email.trim().toLowerCase(), passwordHash],
    );

    return res.status(201).json({
      message: 'Tutor creado correctamente.',
      user: {
        id: Number(result.insertId),
        role: ROLE.TUTOR,
        nombre: nombre.trim(),
        apellido: apellido.trim(),
        email: email.trim().toLowerCase(),
      },
    });
  } catch (error) {
    if (error && error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'El email ya esta registrado.' });
    }

    return res.status(500).json({ message: 'Error al crear tutor.', error: error.message });
  }
}

async function createStudent(req, res) {
  const { nombre, apellido } = req.body;

  if ([nombre, apellido].some(isEmpty)) {
    return res.status(400).json({ message: 'nombre y apellido son obligatorios para crear un alumno.' });
  }

  try {
    const result = await query(
      'INSERT INTO users (role, nombre, apellido, email, password_hash) VALUES (?, ?, ?, NULL, NULL)',
      [ROLE.STUDENT, nombre.trim(), apellido.trim()],
    );

    return res.status(201).json({
      message: 'Alumno creado correctamente.',
      user: {
        id: Number(result.insertId),
        role: ROLE.STUDENT,
        nombre: nombre.trim(),
        apellido: apellido.trim(),
      },
    });
  } catch (error) {
    if (error && error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Ya existe un alumno con ese nombre y apellido.' });
    }

    return res.status(500).json({ message: 'Error al crear alumno.', error: error.message });
  }
}

module.exports = {
  createAdmin,
  createTutor,
  createStudent,
  ROLE,
};
