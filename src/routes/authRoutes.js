const express = require('express');
const { loginAdmin, loginTutor, loginStudent, me } = require('../controllers/authController');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/login/admin', loginAdmin);
router.post('/login/tutor', loginTutor);
router.post('/login/alumno', loginStudent);

router.get('/me', requireAuth, me);
router.get('/admin-only', requireAuth, requireRole('ADMINISTRADOR'), (req, res) => {
  return res.status(200).json({ message: 'Acceso concedido solo para administradores.' });
});

module.exports = router;
