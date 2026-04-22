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

function normalizeChunk(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function firstWord(value) {
  return value.trim().split(/\s+/)[0] || '';
}

async function generateStudentLoginId(nombre, apellido) {
  const firstName = firstWord(nombre);
  const firstSurname = firstWord(apellido);
  const base = `${normalizeChunk(firstName)}${normalizeChunk(firstSurname)}`;

  if (!base) {
    throw new Error('No se pudo generar el identificador del alumno.');
  }

  const rows = await query(
    'SELECT student_login_id FROM users WHERE role = ? AND student_login_id LIKE ?',
    [ROLE.STUDENT, `${base}%`],
  );

  let maxIncrement = 0;

  for (const row of rows) {
    const currentId = row.student_login_id || '';
    const match = currentId.match(new RegExp(`^${base}(\\d+)$`));

    if (match) {
      const value = Number(match[1]);
      if (!Number.isNaN(value) && value > maxIncrement) {
        maxIncrement = value;
      }
    }
  }

  return `${base}${maxIncrement + 1}`;
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
    const cleanName = nombre.trim();
    const cleanSurname = apellido.trim();
    let result;
    let studentLoginId;

    // Reintento corto por si hay colision en alta concurrencia.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      studentLoginId = await generateStudentLoginId(cleanName, cleanSurname);

      try {
        result = await query(
          'INSERT INTO users (role, nombre, apellido, email, password_hash, student_login_id) VALUES (?, ?, ?, NULL, NULL, ?)',
          [ROLE.STUDENT, cleanName, cleanSurname, studentLoginId],
        );
        break;
      } catch (error) {
        if (error && error.code === 'ER_DUP_ENTRY') {
          continue;
        }
        throw error;
      }
    }

    if (!result) {
      return res.status(500).json({ message: 'No se pudo generar un identificador unico para el alumno.' });
    }

    return res.status(201).json({
      message: 'Alumno creado correctamente.',
      user: {
        id: Number(result.insertId),
        role: ROLE.STUDENT,
        nombre: cleanName,
        apellido: cleanSurname,
        student_login_id: studentLoginId,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: 'Error al crear alumno.', error: error.message });
  }
}

module.exports = {
  createAdmin,
  createTutor,
  createStudent,
  ROLE,
};
