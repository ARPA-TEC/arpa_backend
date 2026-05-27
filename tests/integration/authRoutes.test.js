jest.mock('../../src/config/db', () => ({
  query: jest.fn(),
}));

jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
}));

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(),
  verify: jest.fn(),
}));

const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../../src/config/db');
const app = require('../../src/app');

const adminUser = {
  id: 1,
  role: 'ADMINISTRADOR',
  nombre: 'Ana',
  apellido: 'Mikkelsen',
  email: 'ana.admin@arpa.com',
  password_hash: 'hash-admin',
};

const tutorUser = {
  id: 2,
  role: 'TUTOR',
  nombre: 'Luis',
  apellido: 'Martinez',
  email: 'luis.tutor@arpa.com',
  password_hash: 'hash-tutor',
};

const studentUser = {
  id: 3,
  role: 'ALUMNO',
  nombre: 'Santiago',
  apellido: 'Salinas',
  student_login_id: 'santiagosalinas1',
};

describe('auth routes', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret';
    process.env.JWT_EXPIRES_IN = '1h';
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/auth/me', () => {
    test('retorna 401 si falta el header Authorization', async () => {
      const res = await request(app).get('/api/auth/me');

      expect(res.statusCode).toBe(401);
      expect(res.body).toEqual({ message: 'Token no proporcionado.' });
    });

    test('retorna 401 si el token es invalido', async () => {
      jwt.verify.mockImplementationOnce(() => {
        throw new Error('invalid token');
      });

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer token_invalido');

      expect(res.statusCode).toBe(401);
      expect(res.body).toEqual({ message: 'Token invalido o expirado.' });
    });

    test('retorna 200 y el usuario si el token es valido', async () => {
      const payload = {
        id: adminUser.id,
        role: adminUser.role,
        nombre: adminUser.nombre,
        apellido: adminUser.apellido,
      };
      jwt.verify.mockReturnValueOnce(payload);

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer token_valido');

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ user: payload });
    });
  });

  describe('GET /api/auth/admin-only', () => {
    test('retorna 401 si no hay token', async () => {
      const res = await request(app).get('/api/auth/admin-only');

      expect(res.statusCode).toBe(401);
      expect(res.body).toEqual({ message: 'Token no proporcionado.' });
    });

    test('retorna 403 si el rol no es administrador', async () => {
      jwt.verify.mockReturnValueOnce({ id: tutorUser.id, role: tutorUser.role });

      const res = await request(app)
        .get('/api/auth/admin-only')
        .set('Authorization', 'Bearer token_valido');

      expect(res.statusCode).toBe(403);
      expect(res.body).toEqual({ message: 'No tienes permisos para esta accion.' });
    });

    test('retorna 200 si el rol es administrador', async () => {
      jwt.verify.mockReturnValueOnce({ id: adminUser.id, role: adminUser.role });

      const res = await request(app)
        .get('/api/auth/admin-only')
        .set('Authorization', 'Bearer token_valido');

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ message: 'Acceso concedido solo para administradores.' });
    });
  });

  describe('POST /api/auth/login/admin', () => {
    test('retorna 400 si faltan credenciales', async () => {
      const res = await request(app).post('/api/auth/login/admin').send({});

      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({ message: 'email y password son obligatorios.' });
    });

    test('retorna 401 si las credenciales son invalidas', async () => {
      query.mockResolvedValueOnce([]);

      const res = await request(app)
        .post('/api/auth/login/admin')
        .send({ email: adminUser.email, password: 'bad' });

      expect(res.statusCode).toBe(401);
      expect(res.body).toEqual({ message: 'Credenciales invalidas.' });
    });

    test('retorna 200 y token si las credenciales son validas', async () => {
      query.mockResolvedValueOnce([adminUser]);
      bcrypt.compare.mockResolvedValueOnce(true);
      jwt.sign.mockReturnValueOnce('token-admin');

      const res = await request(app)
        .post('/api/auth/login/admin')
        .send({ email: adminUser.email, password: '123456' });

      expect(res.statusCode).toBe(200);
      expect(res.body.token).toBe('token-admin');
      expect(res.body.user).toMatchObject({
        id: adminUser.id,
        role: adminUser.role,
        email: adminUser.email,
      });
    });
  });

  describe('POST /api/auth/login/tutor', () => {
    test('retorna 400 si faltan credenciales', async () => {
      const res = await request(app).post('/api/auth/login/tutor').send({});

      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({ message: 'email y password son obligatorios.' });
    });

    test('retorna 401 si las credenciales son invalidas', async () => {
      query.mockResolvedValueOnce([tutorUser]);
      bcrypt.compare.mockResolvedValueOnce(false);

      const res = await request(app)
        .post('/api/auth/login/tutor')
        .send({ email: tutorUser.email, password: 'bad' });

      expect(res.statusCode).toBe(401);
      expect(res.body).toEqual({ message: 'Credenciales invalidas.' });
    });

    test('retorna 200 y token si las credenciales son validas', async () => {
      query.mockResolvedValueOnce([tutorUser]);
      bcrypt.compare.mockResolvedValueOnce(true);
      jwt.sign.mockReturnValueOnce('token-tutor');

      const res = await request(app)
        .post('/api/auth/login/tutor')
        .send({ email: tutorUser.email, password: '123456' });

      expect(res.statusCode).toBe(200);
      expect(res.body.token).toBe('token-tutor');
      expect(res.body.user).toMatchObject({
        id: tutorUser.id,
        role: tutorUser.role,
        email: tutorUser.email,
      });
    });
  });

  describe('POST /api/auth/login/alumno', () => {
    test('retorna 400 si falta el student_login_id', async () => {
      const res = await request(app).post('/api/auth/login/alumno').send({});

      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({ message: 'student_login_id es obligatorio.' });
    });

    test('retorna 401 si el alumno no existe', async () => {
      query.mockResolvedValueOnce([]);

      const res = await request(app)
        .post('/api/auth/login/alumno')
        .send({ student_login_id: 'noexiste1' });

      expect(res.statusCode).toBe(401);
      expect(res.body).toEqual({ message: 'Alumno no encontrado.' });
    });

    test('retorna 200 y token si el alumno existe', async () => {
      query.mockResolvedValueOnce([studentUser]);
      jwt.sign.mockReturnValueOnce('token-alumno');

      const res = await request(app)
        .post('/api/auth/login/alumno')
        .send({ student_login_id: studentUser.student_login_id });

      expect(res.statusCode).toBe(200);
      expect(res.body.token).toBe('token-alumno');
      expect(res.body.user).toMatchObject({
        id: studentUser.id,
        role: studentUser.role,
        student_login_id: studentUser.student_login_id,
      });
    });
  });
});
