# ARPA Backend

El backend de ARPA

## Requisitos

- Node.js
- MariaDB

## Instalacion

```bash
npm install
```

## Configuracion

1. Copia el archivo de ejemplo:

```bash
cp .env.example .env
```

2. Ajusta los valores de conexion en `.env`.

## Base de datos

Este proyecto usa una base MariaDB llamada `arpa-backend`.

Ejecuta el script SQL:

```bash
mysql -u root -p < src/db/init.sql
```

## Ejecutar el servidor

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
			"nombre": "Oriana",
			"apellido": "Vega"
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
