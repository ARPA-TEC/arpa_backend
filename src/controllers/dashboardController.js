const { query, pool } = require('../config/db');
const { ROLE } = require('./userController');

const SKILL_LABELS = {
  comprension_lectora: 'Reading',
  expresion_oral: 'Speaking',
  comprension_auditiva: 'Listening',
  expresion_escrita: 'Writing',
};

function isEmpty(value) {
  return !value || String(value).trim() === '';
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function normalizeChunk(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function firstWord(value) {
  return value.trim().split(/\s+/)[0] || '';
}

function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('es-MX');
}

function buildSkillMap(rows, keyField) {
  return rows.reduce((acc, row) => {
    if (!acc[row[keyField]]) acc[row[keyField]] = {};
    const label = SKILL_LABELS[row.habilidad];
    if (label) acc[row[keyField]][label] = toNumber(row.puntuacion);
    return acc;
  }, {});
}

function buildStudentCard(studentRow, progressByUserId) {
  const card = {
    id: Number(studentRow.user_id),
    id_estudiante: Number(studentRow.id_estudiante),
    name: `${studentRow.nombre} ${studentRow.apellido}`,
    level: studentRow.nivel,
    student_login_id: studentRow.student_login_id,
    skills: progressByUserId[studentRow.user_id] || {},
  };
  if (studentRow.tutor_nombre && studentRow.tutor_apellido)
    card.tutor = `${studentRow.tutor_nombre} ${studentRow.tutor_apellido}`;
  if (studentRow.tutor_email) card.tutor_email = studentRow.tutor_email;
  return card;
}

function buildTutorCard(tutorRow, logsByTutorId) {
  return {
    id: Number(tutorRow.user_id),
    id_tutor: Number(tutorRow.id_tutor),
    name: `${tutorRow.nombre} ${tutorRow.apellido}`,
    email: tutorRow.email,
    matricula: tutorRow.matricula ?? null,
    hrs: toNumber(tutorRow.horas_acumuladas),
    logs: logsByTutorId[tutorRow.id_tutor] || [],
    clase_url: tutorRow.clase_url ?? null,
  };
}

async function getAdminStudents(req, res) {
  const [students, progressRows] = await Promise.all([
    query(
      `SELECT u.id AS user_id, u.nombre, u.apellido, u.student_login_id, e.id_estudiante,
         n.codigo_mcer AS nivel, tu.id_tutor, tu.horas_acumuladas, tu.clase_url
         tutor_user.nombre AS tutor_nombre, tutor_user.apellido AS tutor_apellido, tutor_user.email AS tutor_email
       FROM users u
       JOIN estudiantes e ON e.id_usuario = u.id
       JOIN tutores tu ON tu.id_tutor = e.id_tutor
       JOIN users tutor_user ON tutor_user.id = tu.id_usuario
       JOIN nivel_idioma n ON n.id_nivel = e.id_nivel
       WHERE u.role = ? AND u.activo = TRUE ORDER BY u.nombre, u.apellido`,
      [ROLE.STUDENT],
    ),
    query(
      `SELECT u.id AS user_id, pe.habilidad, pe.puntuacion
       FROM progreso_estudiante pe
       JOIN estudiantes e ON e.id_estudiante = pe.id_estudiante
       JOIN users u ON u.id = e.id_usuario
       WHERE u.role = ? AND u.activo = TRUE ORDER BY pe.id_progreso`,
      [ROLE.STUDENT],
    ),
  ]);
  const progressByUserId = buildSkillMap(progressRows, 'user_id');
  return res.status(200).json({ students: students.map((s) => buildStudentCard(s, progressByUserId)) });
}

async function getAdminTutors(req, res) {
  const [tutors, bitacoras, horasExtras] = await Promise.all([
    query(
      `SELECT u.id AS user_id, u.nombre, u.apellido, u.email,
         tu.id_tutor, tu.matricula, tu.horas_acumuladas, tu.horas_requeridas, tu.estado
       FROM tutores tu
       JOIN users u ON u.id = tu.id_usuario
       WHERE u.role = ? AND u.activo = TRUE ORDER BY u.nombre, u.apellido`,
      [ROLE.TUTOR],
    ),
    query(
      `SELECT b.id_tutor, b.fecha_sesion, b.duracion_horas, b.notas,
         stu_u.nombre AS estudiante_nombre, stu_u.apellido AS estudiante_apellido
       FROM bitacoras b
       JOIN estudiantes e ON e.id_estudiante = b.id_estudiante
       JOIN users stu_u ON stu_u.id = e.id_usuario
       ORDER BY b.fecha_registro DESC, b.id_bitacora DESC`,
    ),
    query(
      `SELECT he.id_tutor, he.fecha, he.horas, he.motivo, u.nombre AS admin_nombre
       FROM horas_extras he
       JOIN users u ON u.id = he.agregado_por
       ORDER BY he.fecha_registro DESC`,
    ),
  ]);

  const logsByTutorId = {};

  for (const row of bitacoras) {
    if (!logsByTutorId[row.id_tutor]) logsByTutorId[row.id_tutor] = [];
    logsByTutorId[row.id_tutor].push({
      ref: `${row.estudiante_nombre} ${row.estudiante_apellido}`,
      date: formatDate(row.fecha_sesion),
      duration: toNumber(row.duracion_horas),
      notes: row.notas,
    });
  }

  for (const row of horasExtras) {
    if (!logsByTutorId[row.id_tutor]) logsByTutorId[row.id_tutor] = [];
    logsByTutorId[row.id_tutor].push({
      motivo: row.motivo,
      fecha: formatDate(row.fecha),
      horas: toNumber(row.horas),
      agregado_por: row.admin_nombre,
    });
  }

  return res.status(200).json({
    tutors: tutors.map((tutorRow) => buildTutorCard(tutorRow, logsByTutorId)),
  });
}

async function getStudentDashboard(req, res) {
  const studentMatches = await query(
    `SELECT u.id AS user_id, u.nombre, u.apellido, u.student_login_id,
       n.codigo_mcer AS nivel, tutor_user.nombre AS tutor_nombre,
       tutor_user.apellido AS tutor_apellido, tutor_user.email AS tutor_email, e.id_estudiante
     FROM users u
     JOIN estudiantes e ON e.id_usuario = u.id
     JOIN tutores tu ON tu.id_tutor = e.id_tutor
     JOIN users tutor_user ON tutor_user.id = tu.id_usuario
     JOIN nivel_idioma n ON n.id_nivel = e.id_nivel
     WHERE u.id = ? AND u.role = ? AND u.activo = TRUE LIMIT 1`,
    [req.user.id, ROLE.STUDENT],
  );
  if (!studentMatches.length) return res.status(404).json({ message: 'Alumno no encontrado.' });
  const studentRow = studentMatches[0];
  const progressRows = await query(
    `SELECT pe.habilidad, pe.puntuacion FROM progreso_estudiante pe WHERE pe.id_estudiante = ?`,
    [studentRow.id_estudiante],
  );
  const progress = progressRows.reduce((acc, row) => {
    const label = SKILL_LABELS[row.habilidad];
    if (label) acc[label] = toNumber(row.puntuacion);
    return acc;
  }, {});
  return res.status(200).json({
    student: { id: Number(studentRow.user_id), name: `${studentRow.nombre} ${studentRow.apellido}`, login_id: studentRow.student_login_id },
    tutor: { name: `${studentRow.tutor_nombre} ${studentRow.tutor_apellido}`, email: studentRow.tutor_email },
    progress: { level: studentRow.nivel, skills: progress },
  });
}

async function getTutorDashboard(req, res) {
  const tutorRows = await query(
    `SELECT u.id AS user_id, u.nombre, u.apellido, u.email,
       tu.id_tutor, tu.horas_acumuladas, tu.horas_requeridas
     FROM users u
     JOIN tutores tu ON tu.id_usuario = u.id
     WHERE u.id = ? AND u.role = ? AND u.activo = TRUE LIMIT 1`,
    [req.user.id, ROLE.TUTOR],
  );
  if (!tutorRows.length) return res.status(404).json({ message: 'Tutor no encontrado.' });
  const tutorRow = tutorRows[0];
  const [studentRows, progressRows, bitacoras, incidencias] = await Promise.all([
    query(
      `SELECT u.id AS user_id, u.nombre, u.apellido, u.student_login_id,
         n.codigo_mcer AS nivel, e.id_estudiante
       FROM estudiantes e
       JOIN users u ON u.id = e.id_usuario
       JOIN nivel_idioma n ON n.id_nivel = e.id_nivel
       WHERE e.id_tutor = ? AND u.activo = TRUE ORDER BY u.nombre, u.apellido`,
      [tutorRow.id_tutor],
    ),
    query(
      `SELECT u.id AS user_id, pe.habilidad, pe.puntuacion
       FROM progreso_estudiante pe
       JOIN estudiantes e ON e.id_estudiante = pe.id_estudiante
       JOIN users u ON u.id = e.id_usuario
       WHERE e.id_tutor = ? AND u.activo = TRUE ORDER BY pe.id_progreso`,
      [tutorRow.id_tutor],
    ),
    query(
      `SELECT b.id_bitacora, b.id_tutor, b.fecha_sesion, b.duracion_horas, b.notas, b.evidencia_url,
         stu_u.nombre AS estudiante_nombre, stu_u.apellido AS estudiante_apellido
       FROM bitacoras b
       JOIN estudiantes e ON e.id_estudiante = b.id_estudiante
       JOIN users stu_u ON stu_u.id = e.id_usuario
       WHERE b.id_tutor = ? ORDER BY b.fecha_registro DESC, b.id_bitacora DESC`,
      [tutorRow.id_tutor],
    ),
    query(
      `SELECT i.id_incidencia, i.fecha_incidente, i.descripcion, i.evidencia_url,
         stu_u.nombre AS estudiante_nombre, stu_u.apellido AS estudiante_apellido
       FROM incidencias i
       JOIN bitacoras b ON b.id_bitacora = i.id_bitacora
       JOIN estudiantes e ON e.id_estudiante = b.id_estudiante
       JOIN users stu_u ON stu_u.id = e.id_usuario
       WHERE b.id_tutor = ? ORDER BY i.fecha_registro DESC, i.id_incidencia DESC`,
      [tutorRow.id_tutor],
    ),
  ]);
  const progressByUserId = buildSkillMap(progressRows, 'user_id');
  return res.status(200).json({
    tutor: {
      id: Number(tutorRow.user_id),
      name: `${tutorRow.nombre} ${tutorRow.apellido}`,
      email: tutorRow.email,
      horas_completadas: toNumber(tutorRow.horas_acumuladas),
      horas_total: toNumber(tutorRow.horas_requeridas),
    },
    students: studentRows.map((s) => buildStudentCard(s, progressByUserId)),
    bitacoras: bitacoras.map((row) => ({
      id: Number(row.id_bitacora),
      estudiante: `${row.estudiante_nombre} ${row.estudiante_apellido}`,
      fecha: formatDate(row.fecha_sesion),
      duracion_horas: toNumber(row.duracion_horas),
      notas: row.notas,
      evidencia_url: row.evidencia_url || null,
    })),
    incidencias: incidencias.map((row) => ({
      id: Number(row.id_incidencia),
      estudiante: `${row.estudiante_nombre} ${row.estudiante_apellido}`,
      fecha: formatDate(row.fecha_incidente),
      descripcion: row.descripcion,
      evidencia_url: row.evidencia_url || null,
    })),
  });
}

async function addTutorBitacora(req, res) {
  const idEstudiante = req.body.id_estudiante ?? req.body.student_id;
  const fechaSesion = req.body.fecha_sesion ?? req.body.fecha;
  const duracionHoras = req.body.duracion_horas ?? req.body.duracion;
  const notas = req.body.notas ?? '';
  const evidenciaUrl = req.body.evidencia_url ?? null;

  if ([idEstudiante, fechaSesion, duracionHoras].some(isEmpty)) {
    return res.status(400).json({ message: 'id_estudiante, fecha_sesion y duracion_horas son obligatorios.' });
  }
  const parsedDuration = Number(duracionHoras);
  if (Number.isNaN(parsedDuration) || parsedDuration <= 0) {
    return res.status(400).json({ message: 'duracion_horas debe ser un numero mayor a 0.' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const tutorRows = await connection.execute(
      `SELECT tu.id_tutor FROM tutores tu JOIN users u ON u.id = tu.id_usuario
       WHERE u.id = ? AND u.role = ? AND u.activo = TRUE LIMIT 1`,
      [req.user.id, ROLE.TUTOR],
    );
    if (!tutorRows[0].length) {
      await connection.rollback();
      return res.status(404).json({ message: 'Tutor no encontrado.' });
    }
    const tutorId = tutorRows[0][0].id_tutor;
    const studentRows = await connection.execute(
      `SELECT e.id_estudiante FROM estudiantes e WHERE e.id_estudiante = ? AND e.id_tutor = ? LIMIT 1`,
      [idEstudiante, tutorId],
    );
    if (!studentRows[0].length) {
      await connection.rollback();
      return res.status(404).json({ message: 'Alumno no encontrado para este tutor.' });
    }
    const [insertResult] = await connection.execute(
      `INSERT INTO bitacoras (id_tutor, id_estudiante, fecha_sesion, duracion_horas, notas, evidencia_url)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [tutorId, idEstudiante, fechaSesion, parsedDuration, notas || null, evidenciaUrl],
    );
    await connection.execute(
      `UPDATE tutores SET horas_acumuladas = horas_acumuladas + ? WHERE id_tutor = ?`,
      [parsedDuration, tutorId],
    );
    await connection.commit();
    return res.status(201).json({
      message: 'Bitacora creada correctamente.',
      bitacora: {
        id: Number(insertResult.insertId),
        id_estudiante: Number(idEstudiante),
        fecha_sesion: fechaSesion,
        duracion_horas: parsedDuration,
        notas: notas || null,
        evidencia_url: evidenciaUrl,
      },
    });
  } catch (error) {
    await connection.rollback();
    return res.status(500).json({ message: 'Error al crear bitacora.', error: error.message });
  } finally {
    connection.release();
  }
}

async function createStudent(req, res) {
  const { nombre, apellido, id_tutor, id_nivel } = req.body;
  if ([nombre, apellido, id_tutor, id_nivel].some(isEmpty)) {
    return res.status(400).json({ message: 'nombre, apellido, id_tutor e id_nivel son obligatorios.' });
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const base = `${normalizeChunk(firstWord(nombre))}${normalizeChunk(firstWord(apellido))}`;
    const [existing] = await connection.execute(
      'SELECT student_login_id FROM users WHERE role = ? AND student_login_id LIKE ?',
      [ROLE.STUDENT, `${base}%`],
    );
    let maxIncrement = 0;
    for (const row of existing) {
      const match = row.student_login_id?.match(new RegExp(`^${base}(\\d+)$`));
      if (match) {
        const val = Number(match[1]);
        if (!Number.isNaN(val) && val > maxIncrement) maxIncrement = val;
      }
    }
    const studentLoginId = `${base}${maxIncrement + 1}`;
    const [userResult] = await connection.execute(
      'INSERT INTO users (role, nombre, apellido, student_login_id) VALUES (?, ?, ?, ?)',
      [ROLE.STUDENT, nombre.trim(), apellido.trim(), studentLoginId],
    );
    const userId = Number(userResult.insertId);
    await connection.execute(
      'INSERT INTO estudiantes (id_usuario, id_tutor, id_nivel) VALUES (?, ?, ?)',
      [userId, id_tutor, id_nivel],
    );
    await connection.commit();
    return res.status(201).json({
      message: 'Estudiante creado correctamente.',
      student: { id: userId, nombre: nombre.trim(), apellido: apellido.trim(), student_login_id: studentLoginId, id_tutor: Number(id_tutor), id_nivel: Number(id_nivel) },
    });
  } catch (error) {
    await connection.rollback();
    return res.status(500).json({ message: 'Error al crear estudiante.', error: error.message });
  } finally {
    connection.release();
  }
}

async function updateStudentSkill(req, res) {
  const { id_estudiante, habilidad, puntuacion } = req.body;
  if (!id_estudiante || !habilidad || puntuacion === undefined) {
    return res.status(400).json({ message: 'id_estudiante, habilidad y puntuacion son obligatorios.' });
  }
  const parsedScore = Number(puntuacion);
  if (Number.isNaN(parsedScore) || parsedScore < 0 || parsedScore > 120) {
    return res.status(400).json({ message: 'puntuacion debe ser un numero entre 0 y 120.' });
  }
  const validSkills = ['comprension_lectora', 'expresion_oral', 'comprension_auditiva', 'expresion_escrita'];
  if (!validSkills.includes(habilidad)) {
    return res.status(400).json({ message: 'habilidad invalida.' });
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const studentRows = await connection.execute(
      'SELECT e.id_estudiante, e.id_nivel FROM estudiantes e WHERE e.id_estudiante = ? LIMIT 1',
      [id_estudiante],
    );
    if (!studentRows[0].length) {
      await connection.rollback();
      return res.status(404).json({ message: 'Estudiante no encontrado.' });
    }
    const { id_nivel } = studentRows[0][0];
    const existing = await connection.execute(
      'SELECT id_progreso FROM progreso_estudiante WHERE id_estudiante = ? AND habilidad = ? LIMIT 1',
      [id_estudiante, habilidad],
    );
    if (existing[0].length) {
      await connection.execute(
        'UPDATE progreso_estudiante SET puntuacion = ?, fecha_evaluacion = CURDATE() WHERE id_estudiante = ? AND habilidad = ?',
        [parsedScore, id_estudiante, habilidad],
      );
    } else {
      await connection.execute(
        'INSERT INTO progreso_estudiante (id_estudiante, id_nivel, habilidad, puntuacion, fecha_evaluacion) VALUES (?, ?, ?, ?, CURDATE())',
        [id_estudiante, id_nivel, habilidad, parsedScore],
      );
    }
    await connection.commit();
    return res.status(200).json({ message: 'Habilidad actualizada correctamente.' });
  } catch (error) {
    await connection.rollback();
    return res.status(500).json({ message: 'Error al actualizar habilidad.', error: error.message });
  } finally {
    connection.release();
  }
}

async function createIncidencia(req, res) {
  const { id_bitacora, descripcion } = req.body;
  const evidenciaUrl = req.body.evidencia_url ?? null;
  if (!id_bitacora || !descripcion) {
    return res.status(400).json({ message: 'id_bitacora y descripcion son obligatorios.' });
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const bitacoras = await connection.execute(
      'SELECT id_bitacora FROM bitacoras WHERE id_bitacora = ? LIMIT 1',
      [id_bitacora],
    );
    if (!bitacoras[0].length) {
      await connection.rollback();
      return res.status(404).json({ message: 'Bitacora no encontrada.' });
    }
    const [result] = await connection.execute(
      'INSERT INTO incidencias (id_bitacora, fecha_incidente, descripcion, evidencia_url) VALUES (?, CURDATE(), ?, ?)',
      [id_bitacora, descripcion, evidenciaUrl],
    );
    await connection.commit();
    return res.status(201).json({
      message: 'Incidencia creada correctamente.',
      incidencia: {
        id: Number(result.insertId),
        id_bitacora: Number(id_bitacora),
        fecha_incidente: new Date().toLocaleDateString('es-MX'),
        descripcion,
        evidencia_url: evidenciaUrl,
      },
    });
  } catch (error) {
    await connection.rollback();
    return res.status(500).json({ message: 'Error al crear incidencia.', error: error.message });
  } finally {
    connection.release();
  }
}

async function addHorasExtras(req, res) {
  const { id } = req.params;
  const { fecha, horas, motivo } = req.body;

  if ([fecha, horas, motivo].some(isEmpty)) {
    return res.status(400).json({ message: 'fecha, horas y motivo son obligatorios.' });
  }
  const parsedHoras = Number(horas);
  if (Number.isNaN(parsedHoras) || parsedHoras <= 0) {
    return res.status(400).json({ message: 'horas debe ser un numero mayor a 0.' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const tutorRows = await connection.execute(
      'SELECT id_tutor FROM tutores WHERE id_tutor = ? LIMIT 1',
      [id],
    );
    if (!tutorRows[0].length) {
      await connection.rollback();
      return res.status(404).json({ message: 'Tutor no encontrado.' });
    }
    await connection.execute(
      `INSERT INTO horas_extras (id_tutor, agregado_por, fecha, horas, motivo) VALUES (?, ?, ?, ?, ?)`,
      [id, req.user.id, fecha, parsedHoras, motivo.trim()],
    );
    await connection.execute(
      `UPDATE tutores SET horas_acumuladas = horas_acumuladas + ? WHERE id_tutor = ?`,
      [parsedHoras, id],
    );
    await connection.commit();
    return res.status(201).json({
      message: 'Horas extras agregadas correctamente.',
      horas_extras: {
        id_tutor: Number(id),
        fecha,
        horas: parsedHoras,
        motivo: motivo.trim(),
      },
    });
  } catch (error) {
    await connection.rollback();
    return res.status(500).json({ message: 'Error al agregar horas extras.', error: error.message });
  } finally {
    connection.release();
  }
}

async function updateClaseUrl(req, res) {
  const { clase_url } = req.body;
  const connection = await pool.getConnection();
  try {
    await connection.execute(
      `UPDATE tutores SET clase_url = ? WHERE id_usuario = ?`,
      [clase_url ?? null, req.user.id]
    );
    return res.status(200).json({ message: 'Link actualizado correctamente.', clase_url: clase_url ?? null });
  } catch (error) {
    return res.status(500).json({ message: 'Error al actualizar link.', error: error.message });
  } finally {
    connection.release();
  }
}

module.exports = {
  getAdminStudents,
  getAdminTutors,
  getStudentDashboard,
  getTutorDashboard,
  addTutorBitacora,
  createStudent,
  updateStudentSkill,
  createIncidencia,
  addHorasExtras,
  updateClaseUrl,
};