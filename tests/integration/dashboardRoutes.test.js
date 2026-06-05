jest.mock('../../src/config/db', () => ({
  query: jest.fn(),
  pool: {
    getConnection: jest.fn(),
  },
}));

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(),
  verify: jest.fn(),
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const { query, pool } = require('../../src/config/db');
const app = require('../../src/app');

function authHeader(role, id = 1) {
  jwt.verify.mockReturnValue({ id, role });
  return { Authorization: 'Bearer token' };
}

function buildConnection() {
  return {
    beginTransaction: jest.fn().mockResolvedValue(),
    execute: jest.fn(),
    commit: jest.fn().mockResolvedValue(),
    rollback: jest.fn().mockResolvedValue(),
    release: jest.fn(),
  };
}

describe('dashboard routes', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret';
  });

  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('GET /api/students devuelve estudiantes para admin', async () => {
    query.mockImplementation((sql) => {
      if (sql.includes('FROM progreso_estudiante pe')) {
        return Promise.resolve([
          {
            user_id: 3,
            habilidad: 'comprension_lectora',
            puntuacion: 78.5,
          },
        ]);
      }

      if (sql.includes('FROM users u') && sql.includes('JOIN estudiantes e ON e.id_usuario = u.id')) {
        return Promise.resolve([
          {
            user_id: 3,
            nombre: 'Santiago',
            apellido: 'Salinas',
            student_login_id: 'santiagosalinas1',
            nivel: 'B2',
            id_tutor: 1,
            horas_acumuladas: 42,
            tutor_nombre: 'Oriana',
            tutor_apellido: 'Vega',
            tutor_email: 'oriana.tutor@arpa.com',
          },
        ]);
      }

      return Promise.resolve([]);
    });

    const res = await request(app)
      .get('/api/students')
      .set(authHeader('ADMINISTRADOR', 6));

    expect(res.statusCode).toBe(200);
    expect(res.body.students).toHaveLength(1);
    expect(res.body.students[0]).toMatchObject({
      id: 3,
      name: 'Santiago Salinas',
      level: 'B2',
      tutor: 'Oriana Vega',
      skills: { Reading: 78.5 },
    });
  });

  test('GET /api/tutors devuelve tutores para admin', async () => {
    query.mockImplementation((sql) => {
      if (sql.includes('FROM bitacoras b') && sql.includes('JOIN estudiantes e ON e.id_estudiante = b.id_estudiante')) {
        return Promise.resolve([
          {
            id_tutor: 1,
            fecha_sesion: '2026-03-01',
            duracion_horas: 1.5,
            notas: 'Practica de speaking',
            estudiante_nombre: 'Twincho',
            estudiante_apellido: 'Salinas',
          },
        ]);
      }

      if (sql.includes('FROM horas_extras he')) {
        return Promise.resolve([]);
      }

      if (sql.includes('FROM tutores tu') && sql.includes('JOIN users u ON u.id = tu.id_usuario')) {
        return Promise.resolve([
          {
            user_id: 2,
            nombre: 'Oriana',
            apellido: 'Vega',
            email: 'oriana.tutor@arpa.com',
            id_tutor: 1,
            horas_acumuladas: 42,
            horas_requeridas: 160,
            estado: 'activo',
          },
        ]);
      }

      return Promise.resolve([]);
    });

    const res = await request(app)
      .get('/api/tutors')
      .set(authHeader('ADMINISTRADOR', 6));

    expect(res.statusCode).toBe(200);
    expect(res.body.tutors).toHaveLength(1);
    expect(res.body.tutors[0]).toMatchObject({
      id: 2,
      name: 'Oriana Vega',
      hrs: 1.5,
      logs: [
        {
          ref: 'Twincho Salinas',
          date: expect.any(String),
          duration: 1.5,
          notes: 'Practica de speaking',
        },
      ],
    });
  });

  test('GET /api/tutors?semester_id=2 muestra horas del semestre y no las acumuladas', async () => {
    query
      .mockResolvedValueOnce([
        {
          id_semestre: 2,
          codigo: '2026-2',
          nombre: 'Semestre 2026-2',
          fecha_inicio: '2026-08-01',
          fecha_fin: '2026-12-15',
          activo: false,
        },
      ])
      .mockResolvedValueOnce([
        {
          user_id: 2,
          nombre: 'Oriana',
          apellido: 'Vega',
          email: 'oriana.tutor@arpa.com',
          id_tutor: 1,
          horas_acumuladas: 42,
          horas_requeridas: 160,
          estado: 'activo',
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id_tutor: 1,
          id_semestre: 1,
          codigo: '2026-1',
          nombre: 'Semestre 2026-1',
          activo: true,
          es_principal: true,
        },
      ])
      .mockResolvedValueOnce([
        {
          id_tutor: 1,
          id_semestre: 1,
          codigo: '2026-1',
          nombre: 'Semestre 2026-1',
          activo: true,
          es_principal: true,
        },
      ]);

    const res = await request(app)
      .get('/api/tutors?semester_id=2')
      .set(authHeader('ADMINISTRADOR', 6));

    expect(res.statusCode).toBe(200);
    expect(res.body.semester).toMatchObject({
      id_semestre: 2,
      codigo: '2026-2',
    });
    expect(res.body.tutors).toHaveLength(1);
    expect(res.body.tutors[0]).toMatchObject({
      id: 2,
      name: 'Oriana Vega',
      hrs: 0,
      logs: [],
      semesters: [
        {
          id_semestre: 1,
          codigo: '2026-1',
        },
      ],
    });
  });

  test('GET /api/students/me devuelve el perfil del alumno autenticado', async () => {
    query.mockImplementation((sql) => {
      if (sql.includes('FROM progreso_estudiante pe') && sql.includes('WHERE pe.id_estudiante = ?')) {
        return Promise.resolve([
          { habilidad: 'comprension_lectora', puntuacion: 78.5 },
          { habilidad: 'expresion_oral', puntuacion: 74 },
        ]);
      }

      if (sql.includes('FROM users u') && sql.includes('JOIN semestres s ON s.id_semestre = e.id_semestre')) {
        return Promise.resolve([
          {
            user_id: 5,
            nombre: 'Santiago',
            apellido: 'Salinas',
            student_login_id: 'santiagosalinas1',
            nivel: 'B2',
            tutor_nombre: 'Oriana',
            tutor_apellido: 'Vega',
            tutor_email: 'oriana.tutor@arpa.com',
            id_estudiante: 1,
          },
        ]);
      }

      return Promise.resolve([]);
    });

    const res = await request(app)
      .get('/api/students/me')
      .set(authHeader('ALUMNO', 5));

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      student: { id: 5, name: 'Santiago Salinas', login_id: 'santiagosalinas1' },
      tutor: { name: 'Oriana Vega', email: 'oriana.tutor@arpa.com' },
      progress: { level: 'B2', skills: { Reading: 78.5, Speaking: 74 } },
    });
  });

  test('GET /api/tutors/me devuelve el dashboard del tutor autenticado', async () => {
    query.mockImplementation((sql) => {
      if (sql.includes('FROM users u') && sql.includes('JOIN tutores tu ON tu.id_usuario = u.id') && sql.includes('WHERE u.id = ? AND u.role = ? AND u.activo = TRUE')) {
        return Promise.resolve([
          {
            user_id: 2,
            nombre: 'Oriana',
            apellido: 'Vega',
            email: 'oriana.tutor@arpa.com',
            id_tutor: 1,
            horas_acumuladas: 42,
            horas_requeridas: 160,
          },
        ]);
      }

      if (sql.includes('FROM semestres') && sql.includes('activo = TRUE')) {
        return Promise.resolve([
          {
            id_tutor: 1,
            id_semestre: 1,
            codigo: '2026-1',
            nombre: 'Semestre 2026-1',
            activo: true,
            es_principal: true,
          },
        ]);
      }

      if (sql.includes('FROM tutor_semestres ts') && sql.includes('WHERE ts.id_tutor = ? AND ts.id_semestre = ?')) {
        return Promise.resolve([
          {
            id_tutor: 1,
            id_semestre: 1,
            codigo: '2026-1',
            nombre: 'Semestre 2026-1',
            activo: true,
            es_principal: true,
          },
        ]);
      }

      if (sql.includes('FROM estudiantes e') && sql.includes('WHERE e.id_tutor = ? AND e.id_semestre = ? AND u.activo = TRUE')) {
        return Promise.resolve([
          {
            user_id: 5,
            nombre: 'Santiago',
            apellido: 'Salinas',
            student_login_id: 'santiagosalinas1',
            nivel: 'B2',
            id_estudiante: 1,
          },
        ]);
      }

      if (sql.includes('FROM progreso_estudiante pe') && sql.includes('WHERE e.id_tutor = ? AND e.id_semestre = ?')) {
        return Promise.resolve([
          { user_id: 5, habilidad: 'comprension_lectora', puntuacion: 78.5 },
        ]);
      }

      if (sql.includes('FROM bitacoras b') && sql.includes('WHERE b.id_tutor = ? AND b.id_semestre = ?')) {
        return Promise.resolve([
          {
            id_bitacora: 1,
            fecha_sesion: '2026-03-01',
            duracion_horas: 1.5,
            notas: 'Practica de speaking',
            estudiante_nombre: 'Santiago',
            estudiante_apellido: 'Salinas',
          },
        ]);
      }

      if (sql.includes('FROM incidencias i') && sql.includes('WHERE b.id_tutor = ? AND b.id_semestre = ?')) {
        return Promise.resolve([
          {
            id_incidencia: 1,
            fecha_incidente: '2026-03-01',
            descripcion: 'Llego tarde.',
            estudiante_nombre: 'Santiago',
            estudiante_apellido: 'Salinas',
          },
        ]);
      }

      if (sql.includes('FROM tutor_semestres ts') && sql.includes('ORDER BY ts.id_tutor, s.activo DESC')) {
        return Promise.resolve([
          {
            id_tutor: 1,
            id_semestre: 1,
            codigo: '2026-1',
            nombre: 'Semestre 2026-1',
            activo: true,
            es_principal: true,
          },
        ]);
      }

      return Promise.resolve([]);
    });

    const res = await request(app)
      .get('/api/tutors/me')
      .set(authHeader('TUTOR', 2));

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      tutor: {
        id: 2,
        name: 'Oriana Vega',
        email: 'oriana.tutor@arpa.com',
        horas_completadas: 1.5,
        horas_total: 160,
      },
      students: [
        {
          id: 5,
          name: 'Santiago Salinas',
          level: 'B2',
        },
      ],
      bitacoras: [
        {
          id: 1,
          estudiante: 'Santiago Salinas',
          duracion_horas: 1.5,
        },
      ],
      incidencias: [
        {
          id: 1,
          estudiante: 'Santiago Salinas',
          descripcion: 'Llego tarde.',
        },
      ],
    });
  });

  test('POST /api/tutors/me/bitacoras inserta la bitacora en transaccion', async () => {
    const connection = buildConnection();
    pool.getConnection.mockResolvedValueOnce(connection);
    connection.execute
      .mockResolvedValueOnce([[{ id_tutor: 1 }]])
      .mockResolvedValueOnce([[{
        id_tutor: 1,
        id_semestre: 1,
        codigo: '2026-1',
        nombre: 'Semestre 2026-1',
        activo: true,
        es_principal: true,
      }]])
      .mockResolvedValueOnce([[{ id_estudiante: 1 }]])
      .mockResolvedValueOnce([{ insertId: 9 }])
      .mockResolvedValueOnce([{}]);

    const res = await request(app)
      .post('/api/tutors/me/bitacoras')
      .set(authHeader('TUTOR', 2))
      .send({
        id_estudiante: 1,
        fecha_sesion: '2026-05-01',
        duracion_horas: 1.5,
        notas: 'Sesion de repaso',
      });

    expect(res.statusCode).toBe(201);
    expect(connection.beginTransaction).toHaveBeenCalledTimes(1);
    expect(connection.execute).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('INSERT INTO bitacoras'),
      [1, 1, 1, '2026-05-01', 1.5, 'Sesion de repaso', null],
    );
    expect(connection.execute).toHaveBeenNthCalledWith(
      5,
      expect.stringContaining('UPDATE tutores'),
      [1.5, 1],
    );
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.release).toHaveBeenCalledTimes(1);
  });
});
