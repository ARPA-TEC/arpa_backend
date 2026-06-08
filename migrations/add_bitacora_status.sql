ALTER TABLE bitacoras
ADD COLUMN estado ENUM('No aprobado', 'Aprobado', 'En revisión') NOT NULL DEFAULT 'Aprobado';

UPDATE bitacoras
SET estado = 'Aprobado'
WHERE estado IS NULL OR estado = '';
