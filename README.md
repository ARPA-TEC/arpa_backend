# ARPA Backend

El backend de ARPA

## Requisitos

- Docker
- Docker Compose

## Inicio rapido (recomendado)

Levanta API + MariaDB con un solo comando:

```bash
docker compose up --build
```

Servicios:

- API: `http://localhost:3000`
- MariaDB: `localhost:3307`

Detener contenedores:

```bash
docker compose down
```

Reinicializar base de datos desde cero:

```bash
docker compose down -v
docker compose up --build
```

## Instalacion

```bash
npm install
```

## Inicializacion de base de datos en Docker

MariaDB ejecuta automaticamente el script:

- `docker/db/init/01-init-schema.sql`

Importante:

- Se ejecuta solo la primera vez que se crea el volumen de MariaDB.
- Si el volumen ya existe, no vuelve a correr automaticamente.

## Configuracion (sin Docker)

1. Copia el archivo de ejemplo:

```bash
cp .env.example .env
```

2. Ajusta los valores de conexion en `.env`.

## Base de datos (sin Docker)

Este proyecto usa una base MariaDB llamada `arpa-backend`.

Ejecuta el script SQL:

```bash
mysql -u root -p < src/db/init.sql
```

## Ejecutar el servidor (sin Docker)

Modo desarrollo:

```bash
npm run dev
```

Modo normal:

```bash
npm start
```

## Endpoints

Base URL: `http://localhost:3000`

### Crear usuarios por rol

- `POST /api/users/administradores`
	- Body:
		```json
		{
			"nombre": "Ana",
			"apellido": "Mikkelsen",
			"email": "ana.admin@arpa.com",
			"password": "123456"
		}
		```

- `POST /api/users/tutores`
	- Body:
		```json
		{
			"nombre": "Luis",
			"apellido": "Martinez",
			"email": "luis.tutor@arpa.com",
			"password": "123456"
		}
		```

- `POST /api/users/alumnos`
	- Body:
		```json
		{
			"nombre": "Santiago",
			"apellido": "Salinas"
		}
		```
	- Respuesta incluye `student_login_id` generado automaticamente:
		```json
		{
			"message": "Alumno creado correctamente.",
			"user": {
				"id": 3,
				"role": "ALUMNO",
				"nombre": "Santiago",
				"apellido": "Salinas",
				"student_login_id": "santiagosalinas1"
			}
		}
		```

### Login por rol

- `POST /api/auth/login/admin`
	- Body:
		```json
		{
			"email": "sebas.admin@arpa.com",
			"password": "123456"
		}
		```

- `POST /api/auth/login/tutor`
	- Body:
		```json
		{
			"email": "twincho.tutor@arpa.com",
			"password": "123456"
		}
		```

- `POST /api/auth/login/alumno`
	- Body:
		```json
		{
			"student_login_id": "santiagosalinas1"
		}
		```

### Rutas protegidas con JWT

- `GET /api/auth/me`
	- Header:
		- `Authorization: Bearer TU_TOKEN`

- `GET /api/auth/admin-only`
	- Solo permite `ADMINISTRADOR`.
	- Header:
		- `Authorization: Bearer TU_TOKEN`
