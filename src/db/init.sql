DROP DATABASE IF EXISTS `arpa-backend`;
CREATE DATABASE IF NOT EXISTS `arpa-backend`;
USE `arpa-backend`;

CREATE TABLE users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  role ENUM('ADMINISTRADOR', 'TUTOR', 'ALUMNO') NOT NULL,
  nombre VARCHAR(80) NOT NULL,
  apellido VARCHAR(80) NOT NULL,
  email VARCHAR(150) NULL,
  password_hash VARCHAR(255) NULL,
  student_login_id VARCHAR(191) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_email (email),
  UNIQUE KEY uq_student_login_id (student_login_id)
);
