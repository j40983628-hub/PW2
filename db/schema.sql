-- =============================================================
--  Esquema de la API de reservas de salas (MariaDB >= 10.6)
-- =============================================================
CREATE DATABASE IF NOT EXISTS reservas_db
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE reservas_db;

CREATE TABLE IF NOT EXISTS salas (
  id             INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  nombre         VARCHAR(100)      NOT NULL,
  capacidad      SMALLINT UNSIGNED NOT NULL,
  ubicacion      VARCHAR(150)      NULL,
  creado_en      DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT uq_salas_nombre UNIQUE (nombre),
  CONSTRAINT ck_salas_capacidad CHECK (capacidad BETWEEN 1 AND 1000)
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS reservas (
  id             INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  sala_id        INT UNSIGNED      NOT NULL,
  responsable    VARCHAR(100)      NOT NULL,
  motivo         VARCHAR(255)      NULL,
  inicio         DATETIME          NOT NULL,
  fin            DATETIME          NOT NULL,
  asistentes     SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  estado         ENUM('confirmada', 'cancelada') NOT NULL DEFAULT 'confirmada',
  version        INT UNSIGNED      NOT NULL DEFAULT 1,  -- bloqueo optimista
  creado_en      DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_reservas_sala FOREIGN KEY (sala_id) REFERENCES salas (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT ck_reservas_rango CHECK (fin > inicio),
  INDEX idx_reservas_sala_horario (sala_id, estado, inicio, fin),
  INDEX idx_reservas_inicio (inicio)
) ENGINE = InnoDB;

-- Datos semilla (idempotentes)
INSERT IGNORE INTO salas (nombre, capacidad, ubicacion) VALUES
  ('Sala Andes',     10, 'Bloque A - Piso 1'),
  ('Sala Pacífico',  25, 'Bloque A - Piso 2'),
  ('Auditorio',     120, 'Bloque B - Planta baja');

