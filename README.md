# API de Reservas de Salas

API REST para gestionar **salas** y sus **reservas**, construida con **Node.js + Express 5**, persistencia en **MariaDB**, notificaciones en tiempo real con **Socket.IO** y funciones de archivo (exportar/importar **CSV**).

- CRUD completo con códigos HTTP correctos y formato uniforme de errores.
- Arquitectura por capas: dominio puro → servicios → repositorios (E/S) → HTTP.
- Consultas parametrizadas, transacciones con `SELECT … FOR UPDATE` y bloqueo optimista (`version`).
- 40+ pruebas automatizadas (Jest + Supertest + socket.io-client).

> Informe técnico: [`docs/INFORME_TECNICO.md`](docs/INFORME_TECNICO.md)

---

## 1. Puesta en marcha

### Requisitos
- Node.js ≥ 18
- MariaDB ≥ 10.6 (local **o** con Docker)

### Pasos

```bash
npm install
cp .env.example .env          # en Windows: copy .env.example .env
```

**Opción A – MariaDB con Docker** (crea BD, usuario, tablas y datos semilla):
```bash
docker compose up -d
```

**Opción B – MariaDB instalado localmente**: ajuste `DB_ADMIN_USER/DB_ADMIN_PASSWORD` en `.env` y ejecute:
```bash
npm run db:init
```
y cree el usuario de la aplicación (o use `root` en `DB_USER`):
```sql
CREATE USER IF NOT EXISTS 'reservas'@'%' IDENTIFIED BY 'reservas';
GRANT SELECT, INSERT, UPDATE, DELETE ON reservas_db.* TO 'reservas'@'%';
```

**Iniciar la API**:
```bash
npm start        # o: npm run dev (recarga automática)
```

- API: `http://localhost:3000/api`
- Panel de eventos en tiempo real: `http://localhost:3000/`

### Pruebas
```bash
npm test          # unitarias + endpoints + tiempo real (sin necesidad de MariaDB)
npm run test:db   # integración contra MariaDB real (¡vacía las tablas de la BD configurada!)
```

---

## 2. Estructura del proyecto

```
src/
├── domain/                 # Lógica PURA (sin E/S): validación, reglas, CSV, errores
│   ├── validacion.js
│   ├── sala.js
│   ├── reserva.js
│   ├── csv.js
│   └── errores.js
├── services/               # Casos de uso: orquestan dominio + repositorios + notificador
├── repositories/
│   ├── mariadb/            # SQL parametrizado, transacciones, traducción de errores
│   └── memory/             # Doble de pruebas con el mismo contrato
├── http/                   # Rutas Express, respuestas y manejador de errores
├── realtime/notificador.js # Socket.IO
├── app.js                  # Fábrica de la app (inyección de dependencias)
├── servidor.js             # HTTP + Socket.IO
└── index.js                # Punto de entrada
db/schema.sql               # Esquema MariaDB
tests/                      # Jest + Supertest
requests.http               # Colección de peticiones de ejemplo
```

---

## 3. Endpoints

| Método | Ruta | Descripción | Éxito | Errores típicos |
|---|---|---|---|---|
| GET | `/health` | Estado de la API y BD | 200 | 503 |
| GET | `/api/salas` | Listar salas | 200 | |
| GET | `/api/salas/:id` | Obtener sala | 200 | 400, 404 |
| POST | `/api/salas` | Crear sala | 201 + `Location` | 400, 409 |
| PUT | `/api/salas/:id` | Reemplazar sala | 200 | 400, 404, 409 |
| DELETE | `/api/salas/:id` | Eliminar sala | 204 | 404, 409 |
| GET | `/api/reservas` | Listar (filtros: `salaId`, `estado`, `desde`, `hasta`, `pagina`, `limite`) | 200 | 400 |
| GET | `/api/reservas/:id` | Obtener reserva | 200 | 400, 404 |
| POST | `/api/reservas` | Crear reserva | 201 + `Location` | 400, 409, 422 |
| PUT | `/api/reservas/:id` | Reemplazar (requiere `version`) | 200 | 400, 404, 409, 422 |
| PATCH | `/api/reservas/:id` | Modificar parcial / cancelar (requiere `version`) | 200 | 400, 404, 409, 422 |
| DELETE | `/api/reservas/:id` | Eliminar reserva | 204 | 404 |
| GET | `/api/reservas/exportar` | Descargar CSV (acepta los mismos filtros) | 200 `text/csv` | 400 |
| POST | `/api/reservas/importar` | Subir CSV (`multipart/form-data`, campo `archivo`, máx. 1 MB) | 200 | 400, 413 |

### Códigos de error de negocio

| HTTP | `code` | Cuándo |
|---|---|---|
| 400 | `VALIDACION` | Campos faltantes, tipos incorrectos, campos no permitidos, rango horario inválido |
| 400 | `JSON_INVALIDO` | Cuerpo JSON mal formado |
| 404 | `NO_ENCONTRADO` / `RUTA_NO_ENCONTRADA` | Recurso o ruta inexistente |
| 409 | `RESERVA_SOLAPADA` | La sala ya está ocupada en ese horario |
| 409 | `CONFLICTO_VERSION` | La reserva fue modificada por otro cliente (bloqueo optimista) |
| 409 | `SALA_DUPLICADA` | Ya existe una sala con ese nombre |
| 409 | `RECURSO_REFERENCIADO` | Se intenta borrar una sala con reservas |
| 409 | `CONFLICTO_CONCURRENCIA` | Deadlock / timeout de bloqueo en MariaDB |
| 413 | `CARGA_DEMASIADO_GRANDE` / `ARCHIVO_INVALIDO` | Cuerpo o archivo demasiado grande |
| 422 | `CAPACIDAD_EXCEDIDA` / `SALA_INEXISTENTE` | Regla de negocio incumplida |
| 500 | `ERROR_INTERNO` | Error no controlado (no expone detalles internos) |

---

## 4. Ejemplos de petición / respuesta

### Crear reserva — `201 Created`
```http
POST /api/reservas
Content-Type: application/json

{ "salaId": 1, "responsable": "Ana Pérez", "motivo": "Planificación sprint",
  "inicio": "2026-11-10T09:00", "fin": "2026-11-10T10:30", "asistentes": 6 }
```
```http
HTTP/1.1 201 Created
Location: /api/reservas/1
```
```json
{
  "data": {
    "id": 1, "salaId": 1, "salaNombre": "Sala Andes",
    "responsable": "Ana Pérez", "motivo": "Planificación sprint",
    "inicio": "2026-11-10T09:00:00", "fin": "2026-11-10T10:30:00",
    "asistentes": 6, "estado": "confirmada", "version": 1,
    "creadoEn": "2026-11-01T20:30:00", "actualizadoEn": "2026-11-01T20:30:00"
  }
}
```

### Error de validación — `400 Bad Request`
```json
{
  "error": {
    "status": 400,
    "code": "VALIDACION",
    "message": "Los datos enviados no son válidos",
    "details": [
      { "campo": "color", "mensaje": "campo no permitido" },
      { "campo": "nombre", "mensaje": "debe tener al menos 2 caracteres" },
      { "campo": "capacidad", "mensaje": "debe ser mayor o igual a 1" }
    ],
    "path": "/api/salas",
    "timestamp": "2026-11-02T01:30:00.000Z"
  }
}
```

### Reserva solapada — `409 Conflict`
```json
{
  "error": {
    "status": 409,
    "code": "RESERVA_SOLAPADA",
    "message": "La sala ya está reservada en ese horario",
    "details": { "conflictos": [ { "id": 1, "inicio": "2026-11-10T09:00:00", "fin": "2026-11-10T10:30:00", "responsable": "Ana Pérez" } ] },
    "path": "/api/reservas",
    "timestamp": "2026-11-02T01:31:00.000Z"
  }
}
```

### Conflicto de versión — `409 Conflict`
```http
PATCH /api/reservas/1
Content-Type: application/json

{ "motivo": "Cambio tardío", "version": 1 }
```
```json
{
  "error": {
    "status": 409, "code": "CONFLICTO_VERSION",
    "message": "La reserva fue modificada por otro usuario; recargue e intente de nuevo",
    "details": { "versionEnviada": 1, "versionActual": 2 },
    "path": "/api/reservas/1", "timestamp": "2026-11-02T01:32:00.000Z"
  }
}
```

### Listado paginado — `200 OK`
```http
GET /api/reservas?salaId=1&pagina=1&limite=2
```
```json
{
  "data": [ { "id": 1, "salaId": 1, "inicio": "2026-11-10T09:00:00", "...": "..." },
            { "id": 2, "salaId": 1, "inicio": "2026-11-11T09:00:00", "...": "..." } ],
  "meta": { "pagina": 1, "limite": 2, "total": 3, "totalPaginas": 2 }
}
```

### Importar CSV — `200 OK`
```bash
curl -F "archivo=@docs/ejemplo-importacion.csv" http://localhost:3000/api/reservas/importar
```
```json
{
  "data": {
    "total": 3, "creadas": 2, "fallidas": 1,
    "reservas": [ { "id": 5, "...": "..." }, { "id": 6, "...": "..." } ],
    "errores": [ { "fila": 3, "code": "RESERVA_SOLAPADA", "message": "La sala ya está reservada en ese horario", "details": { "conflictos": [ "..." ] } } ]
  }
}
```

### Exportar CSV
```bash
curl -OJ "http://localhost:3000/api/reservas/exportar?estado=confirmada"
```
```
id,salaId,sala,responsable,motivo,inicio,fin,asistentes,estado,version
1,1,Sala Andes,Ana Pérez,Planificación sprint,2026-11-10T09:00:00,2026-11-10T10:30:00,6,confirmada,1
```

---

## 5. Eventos en tiempo real (Socket.IO)

Conéctese a `ws://localhost:3000` con un cliente Socket.IO. Todos los eventos usan el sobre:
```json
{ "evento": "reserva:creada", "datos": { "id": 1, "...": "..." }, "timestamp": "2026-11-02T01:30:00.000Z" }
```

| Evento | Se emite cuando |
|---|---|
| `reserva:creada` | POST exitoso |
| `reserva:actualizada` | PUT/PATCH exitoso |
| `reserva:cancelada` | PUT/PATCH que cambia el estado a `cancelada` |
| `reserva:eliminada` | DELETE exitoso (`datos: { id }`) |
| `reservas:importadas` | Importación CSV con al menos una fila creada |
| `sala:creada` / `sala:actualizada` / `sala:eliminada` | Cambios en salas |

Ejemplo de cliente Node:
```js
const { io } = require('socket.io-client');
const socket = io('http://localhost:3000');
socket.on('reserva:creada', (msg) => console.log('Nueva reserva', msg.datos));
```
También puede abrir `http://localhost:3000/` para ver el panel que se actualiza en vivo.

