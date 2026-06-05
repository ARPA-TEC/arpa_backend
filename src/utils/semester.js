const { query: defaultQuery } = require('../config/db');

function normalizeSemester(row) {
  if (!row) return null;
  return {
    id_semestre: Number(row.id_semestre),
    codigo: row.codigo,
    nombre: row.nombre,
    fecha_inicio: row.fecha_inicio,
    fecha_fin: row.fecha_fin,
    activo: Boolean(row.activo),
  };
}

async function runRows(executor, sql, params = []) {
  if (typeof executor === 'function') {
    return executor(sql, params);
  }
  if (executor && typeof executor.execute === 'function') {
    const [rows] = await executor.execute(sql, params);
    return rows;
  }
  return defaultQuery(sql, params);
}

async function runWrite(executor, sql, params = []) {
  if (typeof executor === 'function') {
    return executor(sql, params);
  }
  if (executor && typeof executor.execute === 'function') {
    return executor.execute(sql, params);
  }
  return defaultQuery(sql, params);
}

async function getActiveSemester(executor = defaultQuery) {
  const rows = await runRows(
    executor,
    `SELECT *
     FROM semestres
     WHERE activo = TRUE
     ORDER BY fecha_inicio DESC, id_semestre DESC
     LIMIT 1`,
  );

  return normalizeSemester(rows[0]);
}

async function getSemesterById(semesterId, executor = defaultQuery) {
  const rows = await runRows(
    executor,
    'SELECT * FROM semestres WHERE id_semestre = ? LIMIT 1',
    [semesterId],
  );

  return normalizeSemester(rows[0]);
}

async function listSemesters(executor = defaultQuery) {
  const rows = await runRows(
    executor,
    'SELECT * FROM semestres ORDER BY activo DESC, fecha_inicio DESC, id_semestre DESC',
  );

  return rows.map(normalizeSemester);
}

async function getTutorSemesters(tutorId, executor = defaultQuery) {
  const rows = await runRows(
    executor,
    `SELECT s.*, ts.es_principal
     FROM tutor_semestres ts
     JOIN semestres s ON s.id_semestre = ts.id_semestre
     WHERE ts.id_tutor = ?
     ORDER BY s.activo DESC, s.fecha_inicio DESC, s.id_semestre DESC`,
    [tutorId],
  );

  return (rows || []).map((row) => ({
    ...normalizeSemester(row),
    es_principal: Boolean(row.es_principal),
  }));
}

async function getTutorSemester(tutorId, semesterId, executor = defaultQuery) {
  const rows = await runRows(
    executor,
    `SELECT s.*, ts.es_principal
     FROM tutor_semestres ts
     JOIN semestres s ON s.id_semestre = ts.id_semestre
     WHERE ts.id_tutor = ? AND ts.id_semestre = ?
     LIMIT 1`,
    [tutorId, semesterId],
  );

  const semester = normalizeSemester(rows && rows[0]);
  if (!semester) return null;
  return {
    ...semester,
    es_principal: Boolean(rows[0].es_principal),
  };
}

async function getPreferredTutorSemester(tutorId, requestedSemesterId, executor = defaultQuery) {
  if (requestedSemesterId) {
    return getTutorSemester(tutorId, requestedSemesterId, executor);
  }

  const activeRows = await runRows(
    executor,
    `SELECT s.*, ts.es_principal
     FROM tutor_semestres ts
     JOIN semestres s ON s.id_semestre = ts.id_semestre
     WHERE ts.id_tutor = ? AND s.activo = TRUE
     ORDER BY ts.es_principal DESC, s.fecha_inicio DESC, s.id_semestre DESC
     LIMIT 1`,
    [tutorId],
  );

  if (activeRows && activeRows[0]) {
    return {
      ...normalizeSemester(activeRows[0]),
      es_principal: Boolean(activeRows[0].es_principal),
    };
  }

  const fallbackRows = await runRows(
    executor,
    `SELECT s.*, ts.es_principal
     FROM tutor_semestres ts
     JOIN semestres s ON s.id_semestre = ts.id_semestre
     WHERE ts.id_tutor = ?
     ORDER BY ts.es_principal DESC, s.fecha_inicio DESC, s.id_semestre DESC
     LIMIT 1`,
    [tutorId],
  );

  if (!fallbackRows || !fallbackRows[0]) return null;
  return {
    ...normalizeSemester(fallbackRows[0]),
    es_principal: Boolean(fallbackRows[0].es_principal),
  };
}

async function ensureTutorEnrollment(executor, tutorId, semesterId, isPrincipal = false) {
  await runWrite(
    executor,
    `INSERT IGNORE INTO tutor_semestres (id_tutor, id_semestre, es_principal)
     VALUES (?, ?, ?)`,
    [tutorId, semesterId, isPrincipal ? 1 : 0],
  );
}

module.exports = {
  normalizeSemester,
  getActiveSemester,
  getSemesterById,
  listSemesters,
  getTutorSemesters,
  getPreferredTutorSemester,
  ensureTutorEnrollment,
};
