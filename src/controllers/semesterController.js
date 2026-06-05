const { query, pool } = require('../config/db');
const {
  getActiveSemester,
  getSemesterById,
  listSemesters,
  getTutorSemesters,
  ensureTutorEnrollment,
} = require('../utils/semester');

function isEmpty(value) {
  return !value || String(value).trim() === '';
}

async function listAdminSemesters(req, res) {
  const semesters = await listSemesters();
  return res.status(200).json({ semesters });
}

async function listTutorSemesters(req, res) {
  const semesters = await getTutorSemesters(req.user.id);
  const active = semesters.find((semester) => semester.activo) || null;
  return res.status(200).json({
    semesters,
    active_semester_id: active ? active.id_semestre : null,
  });
}

async function createSemester(req, res) {
  const { codigo, nombre, fecha_inicio, fecha_fin, activo } = req.body;

  if ([codigo, nombre, fecha_inicio, fecha_fin].some(isEmpty)) {
    return res.status(400).json({
      message: 'codigo, nombre, fecha_inicio y fecha_fin son obligatorios.',
    });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const result = await connection.execute(
      'INSERT INTO semestres (codigo, nombre, fecha_inicio, fecha_fin, activo) VALUES (?, ?, ?, ?, ?)',
      [codigo.trim(), nombre.trim(), fecha_inicio, fecha_fin, activo ? 1 : 0],
    );

    if (activo) {
      await connection.execute('UPDATE semestres SET activo = FALSE WHERE id_semestre <> ?', [result[0].insertId]);
    }

    await connection.commit();

    return res.status(201).json({
      message: 'Semestre creado correctamente.',
      semester: {
        id_semestre: Number(result[0].insertId),
        codigo: codigo.trim(),
        nombre: nombre.trim(),
        fecha_inicio,
        fecha_fin,
        activo: Boolean(activo),
      },
    });
  } catch (error) {
    await connection.rollback();
    return res.status(500).json({ message: 'Error al crear semestre.', error: error.message });
  } finally {
    connection.release();
  }
}

async function activateSemester(req, res) {
  const semesterId = Number(req.params.id);
  if (Number.isNaN(semesterId)) {
    return res.status(400).json({ message: 'El id del semestre es invalido.' });
  }

  const semester = await getSemesterById(semesterId);
  if (!semester) {
    return res.status(404).json({ message: 'Semestre no encontrado.' });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    await connection.execute('UPDATE semestres SET activo = FALSE');
    await connection.execute('UPDATE semestres SET activo = TRUE WHERE id_semestre = ?', [semesterId]);
    await connection.commit();

    return res.status(200).json({
      message: 'Semestre activado correctamente.',
      semester: { ...semester, activo: true },
    });
  } catch (error) {
    await connection.rollback();
    return res.status(500).json({ message: 'Error al activar semestre.', error: error.message });
  } finally {
    connection.release();
  }
}

async function enrollTutorSemester(req, res) {
  const tutorId = Number(req.params.id);
  const { id_semestre } = req.body;
  const semesterId = Number(id_semestre);

  if (Number.isNaN(tutorId) || Number.isNaN(semesterId)) {
    return res.status(400).json({ message: 'id_tutor e id_semestre son obligatorios.' });
  }

  const [tutorRows, semesterRows] = await Promise.all([
    query('SELECT id_tutor FROM tutores WHERE id_tutor = ? LIMIT 1', [tutorId]),
    query('SELECT * FROM semestres WHERE id_semestre = ? LIMIT 1', [semesterId]),
  ]);

  if (!tutorRows.length) {
    return res.status(404).json({ message: 'Tutor no encontrado.' });
  }

  if (!semesterRows.length) {
    return res.status(404).json({ message: 'Semestre no encontrado.' });
  }

  await ensureTutorEnrollment(query, tutorId, semesterId);

  return res.status(201).json({
    message: 'Tutor inscrito al semestre correctamente.',
    tutor_semestre: { id_tutor: tutorId, id_semestre: semesterId },
  });
}

module.exports = {
  listAdminSemesters,
  listTutorSemesters,
  createSemester,
  activateSemester,
  enrollTutorSemester,
};
