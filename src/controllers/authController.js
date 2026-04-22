const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../config/db');
const { ROLE } = require('./userController');

function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      role: user.role,
      nombre: user.nombre,
      apellido: user.apellido,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN },
  );
}

function isEmpty(value) {
  return !value || String(value).trim() === '';
}

async function loginAdmin(req, res) {
  const { email, password } = req.body;

  if ([email, password].some(isEmpty)) {
    return res.status(400).json({ message: 'email y password son obligatorios.' });
  }

  try {
    const users = await query('SELECT * FROM users WHERE role = ? AND email = ? LIMIT 1', [
      ROLE.ADMIN,
      email.trim().toLowerCase(),
    ]);

    if (!users.length) {
      return res.status(401).json({ message: 'Credenciales invalidas.' });
    }

    const user = users[0];
    const validPassword = await bcrypt.compare(password, user.password_hash || '');

    if (!validPassword) {
      return res.status(401).json({ message: 'Credenciales invalidas.' });
    }

    const token = signToken(user);

    return res.status(200).json({
      message: 'Login de administrador exitoso.',
      token,
      user: {
        id: user.id,
        role: user.role,
        nombre: user.nombre,
        apellido: user.apellido,
        email: user.email,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: 'Error en login de administrador.', error: error.message });
  }
}

async function loginTutor(req, res) {
  const { email, password } = req.body;

  if ([email, password].some(isEmpty)) {
    return res.status(400).json({ message: 'email y password son obligatorios.' });
  }

  try {
    const users = await query('SELECT * FROM users WHERE role = ? AND email = ? LIMIT 1', [
      ROLE.TUTOR,
      email.trim().toLowerCase(),
    ]);

    if (!users.length) {
      return res.status(401).json({ message: 'Credenciales invalidas.' });
    }

    const user = users[0];
    const validPassword = await bcrypt.compare(password, user.password_hash || '');

    if (!validPassword) {
      return res.status(401).json({ message: 'Credenciales invalidas.' });
    }

    const token = signToken(user);

    return res.status(200).json({
      message: 'Login de tutor exitoso.',
      token,
      user: {
        id: user.id,
        role: user.role,
        nombre: user.nombre,
        apellido: user.apellido,
        email: user.email,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: 'Error en login de tutor.', error: error.message });
  }
}

async function loginStudent(req, res) {
  const { student_login_id: studentLoginId } = req.body;

  if (isEmpty(studentLoginId)) {
    return res.status(400).json({ message: 'student_login_id es obligatorio.' });
  }

  try {
    const users = await query('SELECT * FROM users WHERE role = ? AND student_login_id = ? LIMIT 1', [
      ROLE.STUDENT,
      studentLoginId.trim().toLowerCase(),
    ]);

    if (!users.length) {
      return res.status(401).json({ message: 'Alumno no encontrado.' });
    }

    const user = users[0];
    const token = signToken(user);

    return res.status(200).json({
      message: 'Login de alumno exitoso.',
      token,
      user: {
        id: user.id,
        role: user.role,
        nombre: user.nombre,
        apellido: user.apellido,
        student_login_id: user.student_login_id,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: 'Error en login de alumno.', error: error.message });
  }
}

async function me(req, res) {
  return res.status(200).json({ user: req.user });
}

module.exports = {
  loginAdmin,
  loginTutor,
  loginStudent,
  me,
};
