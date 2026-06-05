const express = require('express');
const {
  listAdminSemesters,
  listTutorSemesters,
  createSemester,
  activateSemester,
  enrollTutorSemester,
} = require('../controllers/semesterController');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/semesters', requireAuth, requireRole('ADMINISTRADOR'), listAdminSemesters);
router.post('/semesters', requireAuth, requireRole('ADMINISTRADOR'), createSemester);
router.patch('/semesters/:id/activate', requireAuth, requireRole('ADMINISTRADOR'), activateSemester);
router.get('/tutors/me/semesters', requireAuth, requireRole('TUTOR'), listTutorSemesters);
router.post('/tutors/:id/semesters', requireAuth, requireRole('ADMINISTRADOR'), enrollTutorSemester);

module.exports = router;
