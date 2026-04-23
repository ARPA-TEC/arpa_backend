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
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_email (email),
  UNIQUE KEY uq_student_login_id (student_login_id)
);

CREATE TABLE coordinadores (
  id_coordinador INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_usuario INT UNSIGNED NOT NULL,
  FOREIGN KEY (id_usuario) REFERENCES users(id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  UNIQUE KEY uq_coordinadores_usuario (id_usuario)
);

CREATE TABLE tutores (
  id_tutor INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_usuario INT UNSIGNED NOT NULL,
  horas_acumuladas INT UNSIGNED NOT NULL DEFAULT 0,
  horas_requeridas INT UNSIGNED NOT NULL DEFAULT 160,
  estado ENUM('activo', 'inactivo') NOT NULL DEFAULT 'activo',
  FOREIGN KEY (id_usuario) REFERENCES users(id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  UNIQUE KEY uq_tutores_usuario (id_usuario)
);

CREATE TABLE nivel_idioma (
  id_nivel INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  codigo_mcer ENUM('A1', 'A2', 'B1', 'B2', 'C1', 'C2') NOT NULL,
  idioma VARCHAR(60) NOT NULL,
  descripcion VARCHAR(255) NULL,
  UNIQUE KEY uq_nivel_codigo_idioma (codigo_mcer, idioma)
);

CREATE TABLE estudiantes (
  id_estudiante INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_usuario INT UNSIGNED NOT NULL,
  id_tutor INT UNSIGNED NOT NULL,
  id_nivel INT UNSIGNED NOT NULL,
  fecha_asignacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_usuario) REFERENCES users(id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  FOREIGN KEY (id_tutor) REFERENCES tutores(id_tutor)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  FOREIGN KEY (id_nivel) REFERENCES nivel_idioma(id_nivel)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  UNIQUE KEY uq_estudiantes_usuario (id_usuario)
);

CREATE TABLE bitacoras (
  id_bitacora INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_tutor INT UNSIGNED NOT NULL,
  id_estudiante INT UNSIGNED NOT NULL,
  fecha_sesion DATE NOT NULL,
  duracion_horas DECIMAL(5,2) NOT NULL,
  notas TEXT NULL,
  evidencia_url VARCHAR(255) NULL,
  fecha_registro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_tutor) REFERENCES tutores(id_tutor)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  FOREIGN KEY (id_estudiante) REFERENCES estudiantes(id_estudiante)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
);

CREATE TABLE incidencias (
  id_incidencia INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_bitacora INT UNSIGNED NOT NULL,
  fecha_incidente DATE NOT NULL,
  descripcion TEXT NOT NULL,
  firma_tutor VARCHAR(255) NULL,
  fecha_registro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_bitacora) REFERENCES bitacoras(id_bitacora)
    ON UPDATE CASCADE
    ON DELETE CASCADE
);

CREATE TABLE progreso_estudiante (
  id_progreso INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_estudiante INT UNSIGNED NOT NULL,
  id_nivel INT UNSIGNED NOT NULL,
  habilidad ENUM('comprension_lectora', 'expresion_oral', 'comprension_auditiva', 'expresion_escrita') NOT NULL,
  puntuacion DECIMAL(5,2) NOT NULL,
  fecha_evaluacion DATE NOT NULL,
  FOREIGN KEY (id_estudiante) REFERENCES estudiantes(id_estudiante)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  FOREIGN KEY (id_nivel) REFERENCES nivel_idioma(id_nivel)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
);

CREATE TABLE temario (
  id_temario INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_nivel INT UNSIGNED NOT NULL,
  titulo VARCHAR(150) NOT NULL,
  descripcion TEXT NULL,
  contenido_url VARCHAR(255) NULL,
  FOREIGN KEY (id_nivel) REFERENCES nivel_idioma(id_nivel)
    ON UPDATE CASCADE
    ON DELETE CASCADE
);

INSERT INTO users (id, role, nombre, apellido, email, password_hash, student_login_id, activo)
VALUES
  (1, 'ADMINISTRADOR', 'Sebastian', 'Castro', 'sebastian.admin@arpa.com', '$2a$10$.MYg9/doZgDnIBYvYib9uONvyeThFfPBvggnh/8/UaY5t6PW.tLx.', NULL, TRUE),
  (2, 'TUTOR', 'Oriana', 'Vega', 'oriana.tutor@arpa.com', '$2a$10$KQO2ACCWUXB5fd5IWZI/DuxJgKlIFkx3wg6wkRfdTNZPogCAOE/7i', NULL, TRUE),
  (3, 'ALUMNO', 'Twincho', 'Salinas', NULL, NULL, 'twinchosalinas1', TRUE),
  (4, 'TUTOR', 'Luis', 'Martinez', 'luis.tutor@arpa.com', '$2a$10$KQO2ACCWUXB5fd5IWZI/DuxJgKlIFkx3wg6wkRfdTNZPogCAOE/7i', NULL, TRUE),
  (5, 'ALUMNO', 'Santiago', 'Salinas', NULL, NULL, 'santiagosalinas1', TRUE),
  (6, 'ADMINISTRADOR', 'Ana', 'Mikkelsen', 'ana.admin@arpa.com', '$2a$10$.MYg9/doZgDnIBYvYib9uONvyeThFfPBvggnh/8/UaY5t6PW.tLx.', NULL, TRUE);

INSERT INTO coordinadores (id_coordinador, id_usuario)
VALUES
  (1, 1),
  (2, 6);

INSERT INTO tutores (id_tutor, id_usuario, horas_acumuladas, horas_requeridas, estado)
VALUES
  (1, 2, 42, 160, 'activo'),
  (2, 4, 18, 160, 'activo');

INSERT INTO nivel_idioma (id_nivel, codigo_mcer, idioma, descripcion)
VALUES
  (1, 'A1', 'Ingles', 'Nivel basico inicial para comunicacion elemental.'),
  (2, 'A2', 'Ingles', 'Nivel basico para interacciones cotidianas.'),
  (3, 'B1', 'Ingles', 'Nivel intermedio con autonomia en contextos frecuentes.'),
  (4, 'B2', 'Ingles', 'Nivel intermedio alto con buena fluidez.'),
  (5, 'C1', 'Ingles', 'Nivel avanzado con dominio funcional amplio.'),
  (6, 'C2', 'Ingles', 'Nivel de maestria cercano a nativo.');

INSERT INTO estudiantes (id_estudiante, id_usuario, id_tutor, id_nivel, fecha_asignacion)
VALUES
  (1, 3, 1, 2, '2026-01-15 09:00:00'),
  (2, 5, 2, 3, '2026-02-03 10:30:00');

INSERT INTO bitacoras (id_bitacora, id_tutor, id_estudiante, fecha_sesion, duracion_horas, notas, evidencia_url, fecha_registro)
VALUES
  (1, 1, 1, '2026-03-01', 1.50, 'Practica de speaking sobre rutinas diarias.', 'https://example.com/evidencias/bitacora-1', '2026-03-01 12:00:00'),
  (2, 2, 2, '2026-03-05', 2.00, 'Lectura guiada y comprension auditiva.', 'https://example.com/evidencias/bitacora-2', '2026-03-05 18:20:00');

INSERT INTO incidencias (id_incidencia, id_bitacora, fecha_incidente, descripcion, firma_tutor, fecha_registro)
VALUES
  (1, 1, '2026-03-01', 'El estudiante llego 20 minutos tarde a la sesion.', 'Oriana Vega', '2026-03-01 12:10:00');

INSERT INTO progreso_estudiante (id_progreso, id_estudiante, id_nivel, habilidad, puntuacion, fecha_evaluacion)
VALUES
  (1, 1, 2, 'comprension_lectora', 78.50, '2026-03-10'),
  (2, 1, 2, 'expresion_oral', 74.00, '2026-03-10'),
  (3, 2, 3, 'comprension_auditiva', 81.75, '2026-03-12'),
  (4, 2, 3, 'expresion_escrita', 79.25, '2026-03-12');

INSERT INTO temario (id_temario, id_nivel, titulo, descripcion, contenido_url)
VALUES
  (1, 2, 'Presente simple y vocabulario cotidiano', 'Estructuras basicas del presente y vocabulario de uso diario.', 'https://example.com/temario/a2-presente-simple'),
  (2, 3, 'Narracion de experiencias', 'Uso de tiempos pasados y conectores para relatar experiencias.', 'https://example.com/temario/b1-narracion');
