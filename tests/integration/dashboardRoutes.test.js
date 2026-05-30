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
    jest.clearAllMocks();
  });

  test('GET /api/students devuelve estudiantes para admin', async () => {
    query
      .mockResolvedValueOnce([
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
      ])
      .mockResolvedValueOnce([
        {
          user_id: 3,
          habilidad: 'comprension_lectora',
          puntuacion: 78.5,
        },
      ]);

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
    query
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
      .mockResolvedValueOnce([
        {
          id_tutor: 1,
          fecha_sesion: '2026-03-01',
          duracion_horas: 1.5,
          notas: 'Practica de speaking',
          estudiante_nombre: 'Twincho',
          estudiante_apellido: 'Salinas',
        },
      ]);

    const res = await request(app)
      .get('/api/tutors')
      .set(authHeader('ADMINISTRADOR', 6));

    expect(res.statusCode).toBe(200);
    expect(res.body.tutors).toHaveLength(1);
    expect(res.body.tutors[0]).toMatchObject({
      id: 2,
      name: 'Oriana Vega',
      hrs: 42,
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

  test('GET /api/students/me devuelve el perfil del alumno autenticado', async () => {
    query
      .mockResolvedValueOnce([
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
      ])
      .mockResolvedValueOnce([
        { habilidad: 'comprension_lectora', puntuacion: 78.5 },
        { habilidad: 'expresion_oral', puntuacion: 74 },
      ]);

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
    query
      .mockResolvedValueOnce([
        {
          user_id: 2,
          nombre: 'Oriana',
          apellido: 'Vega',
          email: 'oriana.tutor@arpa.com',
          id_tutor: 1,
          horas_acumuladas: 42,
          horas_requeridas: 160,
        },
      ])
      .mockResolvedValueOnce([
        {
          user_id: 5,
          nombre: 'Santiago',
          apellido: 'Salinas',
          student_login_id: 'santiagosalinas1',
          nivel: 'B2',
          id_estudiante: 1,
        },
      ])
      .mockResolvedValueOnce([
        { user_id: 5, habilidad: 'comprension_lectora', puntuacion: 78.5 },
      ])
      .mockResolvedValueOnce([
        {
          id_bitacora: 1,
          fecha_sesion: '2026-03-01',
          duracion_horas: 1.5,
          notas: 'Practica de speaking',
          estudiante_nombre: 'Santiago',
          estudiante_apellido: 'Salinas',
        },
      ])
      .mockResolvedValueOnce([
        {
          id_incidencia: 1,
          fecha_incidente: '2026-03-01',
          descripcion: 'Llego tarde.',
          estudiante_nombre: 'Santiago',
          estudiante_apellido: 'Salinas',
        },
      ]);

    const res = await request(app)
      .get('/api/tutors/me')
      .set(authHeader('TUTOR', 2));

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      tutor: {
        id: 2,
        name: 'Oriana Vega',
        email: 'oriana.tutor@arpa.com',
        horas_completadas: 42,
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
      3,
      expect.stringContaining('INSERT INTO bitacoras'),
      [1, 1, '2026-05-01', 1.5, 'Sesion de repaso'],
    );
    expect(connection.execute).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('UPDATE tutores'),
      [1.5, 1],
    );
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.release).toHaveBeenCalledTimes(1);
  });
});
