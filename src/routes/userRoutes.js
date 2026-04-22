const express = require('express');
const { createAdmin, createTutor, createStudent } = require('../controllers/userController');

const router = express.Router();

router.post('/administradores', createAdmin);
router.post('/tutores', createTutor);
router.post('/alumnos', createStudent);

module.exports = router;
