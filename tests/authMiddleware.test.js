const jwt = require('jsonwebtoken');
const { requireAuth, requireRole } = require('../src/middleware/authMiddleware');

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn(),
}));

function buildRes() {
  return {
    statusCode: null,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.payload = data;
      return this;
    },
  };
}

describe('authMiddleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('requireAuth', () => {
    test('retorna 401 si no hay header Authorization', () => {
      const req = { headers: {} };
      const res = buildRes();
      const next = jest.fn();

      requireAuth(req, res, next);

      expect(res.statusCode).toBe(401);
      expect(res.payload).toEqual({ message: 'Token no proporcionado.' });
      expect(next).not.toHaveBeenCalled();
    });

    test('retorna 401 si el token es invalido', () => {
      jwt.verify.mockImplementation(() => {
        throw new Error('invalid token');
      });

      const req = { headers: { authorization: 'Bearer token_invalido' } };
      const res = buildRes();
      const next = jest.fn();

      requireAuth(req, res, next);

      expect(jwt.verify).toHaveBeenCalledWith('token_invalido', process.env.JWT_SECRET);
      expect(res.statusCode).toBe(401);
      expect(res.payload).toEqual({ message: 'Token invalido o expirado.' });
      expect(next).not.toHaveBeenCalled();
    });

    test('llama next y asigna req.user si el token es valido', () => {
      const decoded = { id: 10, role: 'ADMINISTRADOR' };
      jwt.verify.mockReturnValue(decoded);

      const req = { headers: { authorization: 'Bearer token_valido' } };
      const res = buildRes();
      const next = jest.fn();

      requireAuth(req, res, next);

      expect(req.user).toEqual(decoded);
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.statusCode).toBeNull();
    });
  });

  describe('requireRole', () => {
    test('retorna 403 si no hay usuario autenticado', () => {
      const middleware = requireRole('ADMINISTRADOR');
      const req = {};
      const res = buildRes();
      const next = jest.fn();

      middleware(req, res, next);

      expect(res.statusCode).toBe(403);
      expect(res.payload).toEqual({ message: 'No tienes permisos para esta accion.' });
      expect(next).not.toHaveBeenCalled();
    });

    test('retorna 403 si el rol no esta permitido', () => {
      const middleware = requireRole('ADMINISTRADOR');
      const req = { user: { role: 'ALUMNO' } };
      const res = buildRes();
      const next = jest.fn();

      middleware(req, res, next);

      expect(res.statusCode).toBe(403);
      expect(res.payload).toEqual({ message: 'No tienes permisos para esta accion.' });
      expect(next).not.toHaveBeenCalled();
    });

    test('llama next si el rol esta permitido', () => {
      const middleware = requireRole('ADMINISTRADOR', 'TUTOR');
      const req = { user: { role: 'TUTOR' } };
      const res = buildRes();
      const next = jest.fn();

      middleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.statusCode).toBeNull();
    });
  });
});
