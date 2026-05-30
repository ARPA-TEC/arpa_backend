const express = require('express');
const {
  getAdminStudents,
  getAdminTutors,
  getStudentDashboard,
  getTutorDashboard,
  addTutorBitacora,
  createStudent,
} = require('../controllers/dashboardController');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/students', requireAuth, requireRole('ADMINISTRADOR'), getAdminStudents);
router.get('/students/me', requireAuth, requireRole('ALUMNO'), getStudentDashboard);

router.get('/tutors', requireAuth, requireRole('ADMINISTRADOR'), getAdminTutors);
router.get('/tutors/me', requireAuth, requireRole('TUTOR'), getTutorDashboard);
router.post('/tutors/me/bitacoras', requireAuth, requireRole('TUTOR'), addTutorBitacora);
router.post('/students', requireAuth, requireRole('ADMINISTRADOR'), createStudent);
module.exports = router;
