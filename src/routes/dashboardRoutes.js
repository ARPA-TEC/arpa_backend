const express = require('express');
const {
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
} = require('../controllers/dashboardController');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const router = express.Router();

router.get('/students', requireAuth, requireRole('ADMINISTRADOR'), getAdminStudents);
router.get('/students/me', requireAuth, requireRole('ALUMNO'), getStudentDashboard);
router.get('/tutors', requireAuth, requireRole('ADMINISTRADOR'), getAdminTutors);
router.get('/tutors/me', requireAuth, requireRole('TUTOR'), getTutorDashboard);
router.post('/tutors/me/bitacoras', requireAuth, requireRole('TUTOR'), addTutorBitacora);
router.put('/tutors/me/students/:id_estudiante/skills', requireAuth, requireRole('TUTOR'), updateStudentSkill);
router.post('/tutors/me/incidencias', requireAuth, requireRole('TUTOR'), createIncidencia);
router.post('/students', requireAuth, requireRole('ADMINISTRADOR'), createStudent);
router.post('/tutors/:id/horas-extras', requireAuth, requireRole('ADMINISTRADOR'), addHorasExtras);
router.put('/tutors/me/clase-url', requireAuth, requireRole('TUTOR'), updateClaseUrl);

module.exports = router;
