const { query, pool } = require('../config/db');
const { ROLE } = require('./userController');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const {
  getActiveSemester,
  getPreferredTutorSemester,
  getTutorSemesters,
  ensureTutorEnrollment,
} = require('../utils/semester');

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

function evidenceToDataUrl(value) {
  return typeof value === 'string' && value.startsWith('data:image/')
    ? value
    : null;
}

async function persistEvidence(value, folderName) {
  if (!value) return null;
  if (typeof value !== 'string') return value;

  const dataUrl = evidenceToDataUrl(value);
  if (!dataUrl) return value;

  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return value;

  const mime = match[1].toLowerCase();
  const base64 = match[2];
  const extensionMap = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
  };
  const extension = extensionMap[mime] || 'png';
  const uploadsDir = path.join(process.cwd(), 'uploads', folderName);
  await fs.mkdir(uploadsDir, { recursive: true });
  const fileName = `${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const absolutePath = path.join(uploadsDir, fileName);
  await fs.writeFile(absolutePath, Buffer.from(base64, 'base64'));
  return `/uploads/${folderName}/${fileName}`;
}

function buildSkillMap(rows, keyField) {
  return rows.reduce((acc, row) => {
    if (!acc[row[keyField]]) acc[row[keyField]] = {};
    const label = SKILL_LABELS[row.habilidad];
    if (label) acc[row[keyField]][label] = toNumber(row.puntuacion);
    return acc;
  }, {});
}

function buildSemesterSummary(row) {
  if (!row) return null;
  return {
    id_semestre: Number(row.id_semestre),
    codigo: row.codigo,
    nombre: row.nombre,
    activo: Boolean(row.activo),
  };
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
  if (studentRow.semestre_nombre) {
    card.semester = {
      id_semestre: Number(studentRow.id_semestre),
      nombre: studentRow.semestre_nombre,
      codigo: studentRow.semestre_codigo,
    };
  }
  if (studentRow.tutor_nombre && studentRow.tutor_apellido)
    card.tutor = `${studentRow.tutor_nombre} ${studentRow.tutor_apellido}`;
  if (studentRow.tutor_email) card.tutor_email = studentRow.tutor_email;
  return card;
}

function buildTutorCard(tutorRow, logsByTutorId, semestersByTutor, hoursByTutorId) {
  return {
    id: Number(tutorRow.user_id),
    id_tutor: Number(tutorRow.id_tutor),
    name: `${tutorRow.nombre} ${tutorRow.apellido}`,
    email: tutorRow.email,
    matricula: tutorRow.matricula ?? null,
    hrs: toNumber(hoursByTutorId[tutorRow.id_tutor] ?? 0),
    logs: logsByTutorId[tutorRow.id_tutor] || [],
    clase_url: tutorRow.clase_url ?? null,
    semesters: semestersByTutor[tutorRow.id_tutor] || [],
  };
}

async function resolveSemesterId(req) {
  const requestedSemesterId = req.query.semester_id ?? req.body?.id_semestre ?? req.headers['x-semester-id'];
  if (requestedSemesterId) {
    const parsed = Number(requestedSemesterId);
    return Number.isNaN(parsed) ? null : parsed;
  }
  const activeSemester = await getActiveSemester();
  return activeSemester ? activeSemester.id_semestre : null;
}

async function getAdminStudents(req, res) {
  const semesterId = await resolveSemesterId(req);
  if (!semesterId) {
    const [students, progressRows] = await Promise.all([
      query(
        `SELECT u.id AS user_id, u.nombre, u.apellido, u.student_login_id, e.id_estudiante,
          n.codigo_mcer AS nivel, tu.id_tutor, tu.horas_acumuladas, tu.clase_url,
          tutor_user.nombre AS tutor_nombre, tutor_user.apellido AS tutor_apellido, tutor_user.email AS tutor_email
         FROM users u
         JOIN estudiantes e ON e.id_usuario = u.id
         JOIN tutores tu ON tu.id_tutor = e.id_tutor
         JOIN users tutor_user ON tutor_user.id = tu.id_usuario
         JOIN nivel_idioma n ON n.id_nivel = e.id_nivel
         WHERE u.role = ? AND u.activo = TRUE
         ORDER BY u.nombre, u.apellido`,
        [ROLE.STUDENT],
      ),
      query(
        `SELECT u.id AS user_id, pe.habilidad, pe.puntuacion
         FROM progreso_estudiante pe
         JOIN estudiantes e ON e.id_estudiante = pe.id_estudiante
         JOIN users u ON u.id = e.id_usuario
         WHERE u.role = ? AND u.activo = TRUE
         ORDER BY pe.id_progreso`,
        [ROLE.STUDENT],
      ),
    ]);
    const progressByUserId = buildSkillMap(progressRows, 'user_id');
    return res.status(200).json({
      semester: null,
      students: students.map((s) => buildStudentCard(s, progressByUserId)),
    });
  }

  const [semesterRows, students, progressRows] = await Promise.all([
    query('SELECT * FROM semestres WHERE id_semestre = ? LIMIT 1', [semesterId]),
    query(
      `SELECT u.id AS user_id, u.nombre, u.apellido, u.student_login_id, e.id_estudiante, e.id_semestre,
        s.codigo AS semestre_codigo, s.nombre AS semestre_nombre, s.activo AS semestre_activo,
        n.codigo_mcer AS nivel, tu.id_tutor, tu.horas_acumuladas,
        tutor_user.nombre AS tutor_nombre, tutor_user.apellido AS tutor_apellido, tutor_user.email AS tutor_email
       FROM users u
       JOIN estudiantes e ON e.id_usuario = u.id
       JOIN tutores tu ON tu.id_tutor = e.id_tutor
       JOIN users tutor_user ON tutor_user.id = tu.id_usuario
       JOIN nivel_idioma n ON n.id_nivel = e.id_nivel
       JOIN semestres s ON s.id_semestre = e.id_semestre
       WHERE u.role = ? AND u.activo = TRUE AND s.id_semestre = ?
       ORDER BY u.nombre, u.apellido`,
      [ROLE.STUDENT, semesterId],
    ),
    query(
      `SELECT u.id AS user_id, pe.habilidad, pe.puntuacion
       FROM progreso_estudiante pe
       JOIN estudiantes e ON e.id_estudiante = pe.id_estudiante
       JOIN users u ON u.id = e.id_usuario
       JOIN semestres s ON s.id_semestre = e.id_semestre
       WHERE u.role = ? AND u.activo = TRUE AND s.id_semestre = ?
       ORDER BY pe.id_progreso`,
      [ROLE.STUDENT, semesterId],
    ),
  ]);

  const semester = buildSemesterSummary(semesterRows[0]);
  const progressByUserId = buildSkillMap(progressRows, 'user_id');
  return res.status(200).json({
    semester,
    students: students.map((s) => buildStudentCard(s, progressByUserId)),
  });
}

async function getAdminTutors(req, res) {
  const semesterId = await resolveSemesterId(req);
  if (!semesterId) {
    const [tutors, bitacoras, horasExtras] = await Promise.all([
      query(
        `SELECT u.id AS user_id, u.nombre, u.apellido, u.email,
          tu.id_tutor,
        tu.matricula,
        tu.horas_acumuladas,
        tu.horas_requeridas,
        tu.estado,
        tu.clase_url
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
    const hoursByTutorId = {};
    for (const row of bitacoras) {
      if (!logsByTutorId[row.id_tutor]) logsByTutorId[row.id_tutor] = [];
      if (!hoursByTutorId[row.id_tutor]) hoursByTutorId[row.id_tutor] = 0;
      hoursByTutorId[row.id_tutor] += toNumber(row.duracion_horas);
      logsByTutorId[row.id_tutor].push({
        ref: `${row.estudiante_nombre} ${row.estudiante_apellido}`,
        date: formatDate(row.fecha_sesion),
        duration: toNumber(row.duracion_horas),
        notes: row.notas,
      });
    }
    for (const row of horasExtras) {
      if (!logsByTutorId[row.id_tutor]) logsByTutorId[row.id_tutor] = [];
      if (!hoursByTutorId[row.id_tutor]) hoursByTutorId[row.id_tutor] = 0;
      hoursByTutorId[row.id_tutor] += toNumber(row.horas);
      logsByTutorId[row.id_tutor].push({
        motivo: row.motivo,
        fecha: formatDate(row.fecha),
        horas: toNumber(row.horas),
        agregado_por: row.admin_nombre,
      });
    }
    return res.status(200).json({
      semester: null,
      tutors: tutors.map((tutorRow) => ({
        id: Number(tutorRow.user_id),
        id_tutor: Number(tutorRow.id_tutor),
        name: `${tutorRow.nombre} ${tutorRow.apellido}`,
        email: tutorRow.email,
        matricula: tutorRow.matricula ?? null,
        hrs: toNumber(hoursByTutorId[tutorRow.id_tutor] ?? 0),
        logs: logsByTutorId[tutorRow.id_tutor] || [],
        semesters: [],
      })),
    });
  }

   const [semesterRows, tutors, bitacoras, horasExtras, tutorSemesters] = await Promise.all([
    query('SELECT * FROM semestres WHERE id_semestre = ? LIMIT 1', [semesterId]),
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
       WHERE b.id_semestre = ?
       ORDER BY b.fecha_registro DESC, b.id_bitacora DESC`,
      [semesterId],
    ),
    query(
      `SELECT he.id_tutor, he.fecha, he.horas, he.motivo, u.nombre AS admin_nombre
       FROM horas_extras he
       JOIN users u ON u.id = he.agregado_por
       WHERE he.id_semestre = ?
       ORDER BY he.fecha_registro DESC`,
      [semesterId],
    ),
     query(
       `SELECT ts.id_tutor, s.id_semestre, s.codigo, s.nombre, s.activo, ts.es_principal
        FROM tutor_semestres ts
        JOIN semestres s ON s.id_semestre = ts.id_semestre
        ORDER BY ts.id_tutor, s.activo DESC, s.fecha_inicio DESC, s.id_semestre DESC`,
     ),
  ]);

  const logsByTutorId = {};
  const semestersByTutor = {};
  const hoursByTutorId = {};

  for (const row of bitacoras) {
    if (!logsByTutorId[row.id_tutor]) logsByTutorId[row.id_tutor] = [];
    if (!hoursByTutorId[row.id_tutor]) hoursByTutorId[row.id_tutor] = 0;
    hoursByTutorId[row.id_tutor] += toNumber(row.duracion_horas);
    logsByTutorId[row.id_tutor].push({
      ref: `${row.estudiante_nombre} ${row.estudiante_apellido}`,
      date: formatDate(row.fecha_sesion),
      duration: toNumber(row.duracion_horas),
      notes: row.notas,
    });
  }

  for (const row of horasExtras) {
    if (!logsByTutorId[row.id_tutor]) logsByTutorId[row.id_tutor] = [];
    if (!hoursByTutorId[row.id_tutor]) hoursByTutorId[row.id_tutor] = 0;
    hoursByTutorId[row.id_tutor] += toNumber(row.horas);
    logsByTutorId[row.id_tutor].push({
      motivo: row.motivo,
      fecha: formatDate(row.fecha),
      horas: toNumber(row.horas),
      agregado_por: row.admin_nombre,
    });
  }

  for (const row of tutorSemesters) {
    if (!semestersByTutor[row.id_tutor]) semestersByTutor[row.id_tutor] = [];
    semestersByTutor[row.id_tutor].push({
      id_semestre: Number(row.id_semestre),
      codigo: row.codigo,
      nombre: row.nombre,
      activo: Boolean(row.activo),
      es_principal: Boolean(row.es_principal),
    });
  }

  return res.status(200).json({
    semester: buildSemesterSummary(semesterRows[0]),
    tutors: tutors.map((tutorRow) => buildTutorCard(tutorRow, logsByTutorId, semestersByTutor, hoursByTutorId)),
  });
}

async function getStudentDashboard(req, res) {
  const studentMatches = await query(
    `SELECT u.id AS user_id, u.nombre, u.apellido, u.student_login_id,
       n.codigo_mcer AS nivel, tutor_user.nombre AS tutor_nombre,
       tutor_user.apellido AS tutor_apellido, tutor_user.email AS tutor_email, tu.clase_url, e.id_estudiante
       , s.id_semestre, s.codigo AS semestre_codigo, s.nombre AS semestre_nombre, s.activo AS semestre_activo
     FROM users u
     JOIN estudiantes e ON e.id_usuario = u.id
     JOIN tutores tu ON tu.id_tutor = e.id_tutor
     JOIN users tutor_user ON tutor_user.id = tu.id_usuario
     JOIN nivel_idioma n ON n.id_nivel = e.id_nivel
     JOIN semestres s ON s.id_semestre = e.id_semestre
     WHERE u.id = ? AND u.role = ? AND u.activo = TRUE
     ORDER BY s.activo DESC, e.fecha_asignacion DESC
     LIMIT 1`,
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
    tutor: { name: `${studentRow.tutor_nombre} ${studentRow.tutor_apellido}`.trim(), email: studentRow.tutor_email, meet_link: studentRow.clase_url },
    semester: buildSemesterSummary(studentRow),
    progress: { level: studentRow.nivel, skills: progress },
  });
}

async function getTutorDashboard(req, res) {
  const tutorRows = await query(
    `SELECT u.id AS user_id, u.nombre, u.apellido, u.email,
    tu.id_tutor, tu.horas_acumuladas, tu.horas_requeridas, tu.clase_url
    FROM users u
    JOIN tutores tu ON tu.id_usuario = u.id
    WHERE u.id = ? AND u.role = ? AND u.activo = TRUE
    LIMIT 1`,
    [req.user.id, ROLE.TUTOR],
  );
  if (!tutorRows.length) return res.status(404).json({ message: 'Tutor no encontrado.' });
  const tutorRow = tutorRows[0];
  const semesterId = await resolveSemesterId(req);
  const selectedSemester = semesterId
    ? await getPreferredTutorSemester(tutorRow.id_tutor, semesterId)
    : await getPreferredTutorSemester(tutorRow.id_tutor);

  if (!selectedSemester) {
    return res.status(404).json({ message: 'Semestre no encontrado para este tutor.' });
  }

  const [studentRows, progressRows, bitacoras, incidencias, semesters] = await Promise.all([
    query(
      `SELECT u.id AS user_id, u.nombre, u.apellido, u.student_login_id,
        n.codigo_mcer AS nivel, e.id_estudiante, e.id_semestre,
        s.codigo AS semestre_codigo, s.nombre AS semestre_nombre, s.activo AS semestre_activo
       FROM estudiantes e
       JOIN users u ON u.id = e.id_usuario
       JOIN nivel_idioma n ON n.id_nivel = e.id_nivel
       JOIN semestres s ON s.id_semestre = e.id_semestre
       WHERE e.id_tutor = ? AND e.id_semestre = ? AND u.activo = TRUE
       ORDER BY u.nombre, u.apellido`,
      [tutorRow.id_tutor, selectedSemester.id_semestre],
    ),
    query(
      `SELECT u.id AS user_id, pe.habilidad, pe.puntuacion
       FROM progreso_estudiante pe
       JOIN estudiantes e ON e.id_estudiante = pe.id_estudiante
       JOIN users u ON u.id = e.id_usuario
       JOIN semestres s ON s.id_semestre = e.id_semestre
       WHERE e.id_tutor = ? AND e.id_semestre = ? AND u.activo = TRUE
       ORDER BY pe.id_progreso`,
      [tutorRow.id_tutor, selectedSemester.id_semestre],
    ),
    query(
      `SELECT b.id_bitacora, b.id_tutor, b.fecha_sesion, b.duracion_horas, b.notas, b.evidencia_url,
        stu_u.nombre AS estudiante_nombre, stu_u.apellido AS estudiante_apellido
       FROM bitacoras b
       JOIN estudiantes e ON e.id_estudiante = b.id_estudiante
       JOIN users stu_u ON stu_u.id = e.id_usuario
       WHERE b.id_tutor = ? AND b.id_semestre = ?
       ORDER BY b.fecha_registro DESC, b.id_bitacora DESC`,
      [tutorRow.id_tutor, selectedSemester.id_semestre],
    ),
    query(
      `SELECT i.id_incidencia, i.fecha_incidente, i.descripcion, i.evidencia_url,
        stu_u.nombre AS estudiante_nombre, stu_u.apellido AS estudiante_apellido
       FROM incidencias i
       JOIN bitacoras b ON b.id_bitacora = i.id_bitacora
       JOIN estudiantes e ON e.id_estudiante = b.id_estudiante
       JOIN users stu_u ON stu_u.id = e.id_usuario
       WHERE b.id_tutor = ? AND b.id_semestre = ?
       ORDER BY i.fecha_registro DESC, i.id_incidencia DESC`,
      [tutorRow.id_tutor, selectedSemester.id_semestre],
    ),
    getTutorSemesters(tutorRow.id_tutor),
  ]);
  const progressByUserId = buildSkillMap(progressRows, 'user_id');
  const horasSemestre = bitacoras.reduce((acc, row) => acc + toNumber(row.duracion_horas), 0);
  return res.status(200).json({
    tutor: {
      id: Number(tutorRow.user_id),
      name: `${tutorRow.nombre} ${tutorRow.apellido}`,
      email: tutorRow.email,
      horas_completadas: horasSemestre,
      horas_total: toNumber(tutorRow.horas_requeridas),
      clase_url: tutorRow.clase_url ?? null,
    },
    semester: selectedSemester,
    semesters,
    students: studentRows.map((s) => buildStudentCard(s, progressByUserId)),
    bitacoras: bitacoras.map((row) => ({
      id: Number(row.id_bitacora),
      estudiante: `${row.estudiante_nombre} ${row.estudiante_apellido}`,
      fecha: formatDate(row.fecha_sesion),
      duracion_horas: toNumber(row.duracion_horas),
      notas: row.notas,
      evidencia_url: row.evidencia_url || null,
      id_semestre: selectedSemester.id_semestre,
    })),
    incidencias: incidencias.map((row) => ({
      id: Number(row.id_incidencia),
      estudiante: `${row.estudiante_nombre} ${row.estudiante_apellido}`,
      fecha: formatDate(row.fecha_incidente),
      descripcion: row.descripcion,
      evidencia_url: row.evidencia_url || null,
      id_semestre: selectedSemester.id_semestre,
    })),
  });
}

async function addTutorBitacora(req, res) {
  const idEstudiante = req.body.id_estudiante ?? req.body.student_id;
  const fechaSesion = req.body.fecha_sesion ?? req.body.fecha;
  const duracionHoras = req.body.duracion_horas ?? req.body.duracion;
  const notas = req.body.notas ?? '';
  const evidenciaUrl = req.body.evidencia_url ?? null;
  const requestedSemesterId = req.body.id_semestre ?? req.query.semester_id ?? req.headers['x-semester-id'];

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
    const selectedSemester = requestedSemesterId
      ? await getPreferredTutorSemester(tutorId, Number(requestedSemesterId), connection)
      : await getPreferredTutorSemester(tutorId, null, connection);

    if (!selectedSemester) {
      await connection.rollback();
      return res.status(404).json({ message: 'Semestre no encontrado para este tutor.' });
    }

    const studentRows = await connection.execute(
      `SELECT e.id_estudiante
       FROM estudiantes e
       WHERE e.id_estudiante = ? AND e.id_tutor = ? AND e.id_semestre = ?
       LIMIT 1`,
      [idEstudiante, tutorId, selectedSemester.id_semestre],
    );
    if (!studentRows[0].length) {
      await connection.rollback();
      return res.status(404).json({ message: 'Alumno no encontrado para este tutor.' });
    }
    const storedEvidenceUrl = await persistEvidence(evidenciaUrl, 'bitacoras');
    const [insertResult] = await connection.execute(
      `INSERT INTO bitacoras (id_tutor, id_estudiante, id_semestre, fecha_sesion, duracion_horas, notas, evidencia_url)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [tutorId, idEstudiante, selectedSemester.id_semestre, fechaSesion, parsedDuration, notas || null, storedEvidenceUrl],
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
        id_semestre: selectedSemester.id_semestre,
        fecha_sesion: fechaSesion,
        duracion_horas: parsedDuration,
        notas: notas || null,
        evidencia_url: storedEvidenceUrl,
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
    const activeSemester = await getActiveSemester(connection);
    if (!activeSemester) {
      await connection.rollback();
      return res.status(404).json({ message: 'Semestre activo no encontrado.' });
    }

    const tutorRows = await connection.execute(
      'SELECT id_tutor FROM tutores WHERE id_tutor = ? LIMIT 1',
      [id_tutor],
    );
    if (!tutorRows[0].length) {
      await connection.rollback();
      return res.status(404).json({ message: 'Tutor no encontrado.' });
    }

    await ensureTutorEnrollment(connection, Number(id_tutor), activeSemester.id_semestre);

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
      'INSERT INTO estudiantes (id_usuario, id_tutor, id_nivel, id_semestre) VALUES (?, ?, ?, ?)',
      [userId, id_tutor, id_nivel, activeSemester.id_semestre],
    );
    await connection.commit();
    return res.status(201).json({
      message: 'Estudiante creado correctamente.',
      student: {
        id: userId,
        nombre: nombre.trim(),
        apellido: apellido.trim(),
        student_login_id: studentLoginId,
        id_tutor: Number(id_tutor),
        id_nivel: Number(id_nivel),
        id_semestre: activeSemester.id_semestre,
      },
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
  const requestedSemesterId = req.body.id_semestre ?? req.query.semester_id ?? req.headers['x-semester-id'];
  if (!id_bitacora || !descripcion) {
    return res.status(400).json({ message: 'id_bitacora y descripcion son obligatorios.' });
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const tutorRows = await connection.execute(
      `SELECT tu.id_tutor
       FROM tutores tu
       JOIN users u ON u.id = tu.id_usuario
       WHERE u.id = ? AND u.role = ? AND u.activo = TRUE LIMIT 1`,
      [req.user.id, ROLE.TUTOR],
    );
    if (!tutorRows[0].length) {
      await connection.rollback();
      return res.status(404).json({ message: 'Tutor no encontrado.' });
    }
    const tutorId = tutorRows[0][0].id_tutor;
    const selectedSemester = requestedSemesterId
      ? await getPreferredTutorSemester(tutorId, Number(requestedSemesterId), connection)
      : await getPreferredTutorSemester(tutorId, null, connection);
    if (!selectedSemester) {
      await connection.rollback();
      return res.status(404).json({ message: 'Semestre no encontrado para este tutor.' });
    }
    const bitacoras = await connection.execute(
      `SELECT id_bitacora
       FROM bitacoras
       WHERE id_bitacora = ? AND id_tutor = ? AND id_semestre = ?
       LIMIT 1`,
      [id_bitacora, tutorId, selectedSemester.id_semestre],
    );
    if (!bitacoras[0].length) {
      await connection.rollback();
      return res.status(404).json({ message: 'Bitacora no encontrada.' });
    }
    const storedEvidenceUrl = await persistEvidence(evidenciaUrl, 'incidencias');
    const [result] = await connection.execute(
      'INSERT INTO incidencias (id_bitacora, id_semestre, fecha_incidente, descripcion, evidencia_url) VALUES (?, ?, CURDATE(), ?, ?)',
      [id_bitacora, selectedSemester.id_semestre, descripcion, storedEvidenceUrl],
    );
    await connection.commit();
    return res.status(201).json({
      message: 'Incidencia creada correctamente.',
      incidencia: {
        id: Number(result.insertId),
        id_bitacora: Number(id_bitacora),
        id_semestre: selectedSemester.id_semestre,
        fecha_incidente: new Date().toLocaleDateString('es-MX'),
        descripcion,
        evidencia_url: storedEvidenceUrl,
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
  const requestedSemesterId = req.body.id_semestre ?? req.query.semester_id ?? req.headers['x-semester-id'];

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
    const selectedSemester = requestedSemesterId
      ? await getPreferredTutorSemester(Number(id), Number(requestedSemesterId), connection)
      : await getPreferredTutorSemester(Number(id), null, connection);
    if (!selectedSemester) {
      await connection.rollback();
      return res.status(404).json({ message: 'Semestre no encontrado para este tutor.' });
    }
    await connection.execute(
      `INSERT INTO horas_extras (id_tutor, id_semestre, agregado_por, fecha, horas, motivo) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, selectedSemester.id_semestre, req.user.id, fecha, parsedHoras, motivo.trim()],
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
        id_semestre: selectedSemester.id_semestre,
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
