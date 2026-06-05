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

describe('semester routes', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret';
  });

  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('GET /api/semesters devuelve el listado para admin', async () => {
    query.mockResolvedValueOnce([
      {
        id_semestre: 2,
        codigo: '2026-2',
        nombre: 'Semestre 2026-2',
        fecha_inicio: '2026-08-01',
        fecha_fin: '2026-12-15',
        activo: false,
      },
    ]);

    const res = await request(app)
      .get('/api/semesters')
      .set(authHeader('ADMINISTRADOR', 6));

    expect(res.statusCode).toBe(200);
    expect(res.body.semesters).toHaveLength(1);
    expect(res.body.semesters[0]).toMatchObject({
      id_semestre: 2,
      codigo: '2026-2',
      nombre: 'Semestre 2026-2',
      activo: false,
    });
  });

  test('POST /api/semesters crea un semestre y desactiva los anteriores si queda activo', async () => {
    const connection = buildConnection();
    pool.getConnection.mockResolvedValueOnce(connection);
    connection.execute
      .mockResolvedValueOnce([{ insertId: 3 }])
      .mockResolvedValueOnce([{}]);

    const res = await request(app)
      .post('/api/semesters')
      .set(authHeader('ADMINISTRADOR', 6))
      .send({
        codigo: '2026-3',
        nombre: 'Semestre 2026-3',
        fecha_inicio: '2026-12-16',
        fecha_fin: '2027-06-30',
        activo: true,
      });

    expect(res.statusCode).toBe(201);
    expect(connection.beginTransaction).toHaveBeenCalledTimes(1);
    expect(connection.execute).toHaveBeenNthCalledWith(
      1,
      'INSERT INTO semestres (codigo, nombre, fecha_inicio, fecha_fin, activo) VALUES (?, ?, ?, ?, ?)',
      ['2026-3', 'Semestre 2026-3', '2026-12-16', '2027-06-30', 1],
    );
    expect(connection.execute).toHaveBeenNthCalledWith(
      2,
      'UPDATE semestres SET activo = FALSE WHERE id_semestre <> ?',
      [3],
    );
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(res.body.semester).toMatchObject({
      id_semestre: 3,
      codigo: '2026-3',
      nombre: 'Semestre 2026-3',
      activo: true,
    });
  });

  test('POST /api/tutors/:id/semesters inscribe al tutor en un semestre existente', async () => {
    query
      .mockResolvedValueOnce([{ id_tutor: 1 }])
      .mockResolvedValueOnce([{ id_semestre: 2 }]);

    const res = await request(app)
      .post('/api/tutors/1/semesters')
      .set(authHeader('ADMINISTRADOR', 6))
      .send({ id_semestre: 2 });

    expect(res.statusCode).toBe(201);
    expect(res.body.tutor_semestre).toEqual({ id_tutor: 1, id_semestre: 2 });
    expect(query).toHaveBeenCalledWith('SELECT id_tutor FROM tutores WHERE id_tutor = ? LIMIT 1', [1]);
    expect(query).toHaveBeenCalledWith('SELECT * FROM semestres WHERE id_semestre = ? LIMIT 1', [2]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT IGNORE INTO tutor_semestres'), [1, 2, 0]);
  });
});
