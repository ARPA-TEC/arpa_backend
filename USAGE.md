# USAGE

Guia de uso de todas las rutas del backend ARPA.

## 1. Requisitos previos

1. Tener MariaDB/MySQL levantado.
2. Haber ejecutado el script SQL:

~~~bash
mysql -u lambda -p < src/db/init.sql
~~~

3. Tener variables de entorno configuradas en .env.
4. Levantar el servidor:

~~~bash
npm run dev
~~~

Base URL usada en ejemplos:

~~~text
http://localhost:3000
~~~

## 2. Crear usuarios por rol

## 2.1 Crear Administrador

### POST /api/users/administradores

Body requerido:

- nombre
- apellido
- email
- password

Ejemplo:

~~~bash
curl -X POST http://localhost:3000/api/users/administradores \
  -H "Content-Type: application/json" \
  -d '{
    "nombre": "Dariana",
    "apellido": "Vaquero",
    "email": "dariana.admin@arpa.com",
    "password": "123456"
  }'
~~~

Respuesta esperada (201):

~~~json
{
  "message": "Administrador creado correctamente.",
  "user": {
    "id": 1,
    "role": "ADMINISTRADOR",
    "nombre": "Dariana",
    "apellido": "Vaquero",
    "email": "dariana.admin@arpa.com"
  }
}
~~~

## 2.2 Crear Tutor

### POST /api/users/tutores

Body requerido:

- nombre
- apellido
- email
- password

Ejemplo:

~~~bash
curl -X POST http://localhost:3000/api/users/tutores \
  -H "Content-Type: application/json" \
  -d '{
    "nombre": "Roberto",
    "apellido": "Ponce",
    "email": "roberto.tutor@arpa.com",
    "password": "123456"
  }'
~~~

Respuesta esperada (201):

~~~json
{
  "message": "Tutor creado correctamente.",
  "user": {
    "id": 2,
    "role": "TUTOR",
    "nombre": "Roberto",
    "apellido": "Ponce",
    "email": "roberto.tutor@arpa.com"
  }
}
~~~

## 2.3 Crear Alumno

### POST /api/users/alumnos

Body requerido:

- nombre
- apellido

Ejemplo:

~~~bash
curl -X POST http://localhost:3000/api/users/alumnos \
  -H "Content-Type: application/json" \
  -d '{
    "nombre": "Twincho",
    "apellido": "Gonzalez"
  }'
~~~

Respuesta esperada (201):

~~~json
{
  "message": "Alumno creado correctamente.",
  "user": {
    "id": 3,
    "role": "ALUMNO",
    "nombre": "Twincho",
    "apellido": "Gonzalez",
    "student_login_id": "twinchogonzalez1"
  }
}
~~~

Regla de generacion de `student_login_id`:

- Formato: `primerNombre + primerApellido + id_incrementador`.
- Todo en minusculas.
- El `id_incrementador` existe para evitar colisiones entre alumnos con mismo primer nombre y primer apellido.

## 3. Login por rol

Todas las rutas de login retornan un token JWT.

## 3.1 Login Administrador

### POST /api/auth/login/admin

Body requerido:

- email
- password

Ejemplo:

~~~bash
curl -X POST http://localhost:3000/api/auth/login/admin \
  -H "Content-Type: application/json" \
  -d '{
    "email": "sebastian.admin@arpa.com",
    "password": "123456"
  }'
~~~

Respuesta esperada (200):

~~~json
{
  "message": "Login de administrador exitoso.",
  "token": "JWT_AQUI",
  "user": {
    "id": 1,
    "role": "ADMINISTRADOR",
    "nombre": "Sebastian",
    "apellido": "Castro",
    "email": "sebastian.admin@arpa.com"
  }
}
~~~

## 3.2 Login Tutor

### POST /api/auth/login/tutor

Body requerido:

- email
- password

Ejemplo:

~~~bash
curl -X POST http://localhost:3000/api/auth/login/tutor \
  -H "Content-Type: application/json" \
  -d '{
    "email": "oriana.tutor@arpa.com",
    "password": "123456"
  }'
~~~

Respuesta esperada (200):

~~~json
{
  "message": "Login de tutor exitoso.",
  "token": "JWT_AQUI",
  "user": {
    "id": 2,
    "role": "TUTOR",
    "nombre": "Oriana",
    "apellido": "Vega",
    "email": "luis.tutor@arpa.com"
  }
}
~~~

## 3.3 Login Alumno

### POST /api/auth/login/alumno

Body requerido:

- student_login_id

Ejemplo:

~~~bash
curl -X POST http://localhost:3000/api/auth/login/alumno \
  -H "Content-Type: application/json" \
  -d '{
    "student_login_id": "twinchosalinas1"
  }'
~~~

Respuesta esperada (200):

~~~json
{
  "message": "Login de alumno exitoso.",
  "token": "JWT_AQUI",
  "user": {
    "id": 3,
    "role": "ALUMNO",
    "nombre": "Twincho",
    "apellido": "Salinas",
    "student_login_id": "twinchosalinas1"
  }
}
~~~

## 4. Rutas protegidas con JWT

Para estas rutas debes enviar el header Authorization con el token recibido en login.

Formato:

~~~text
Authorization: Bearer TU_TOKEN
~~~

## 4.1 Ver usuario autenticado

### GET /api/auth/me

Ejemplo:

~~~bash
curl -X GET http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer TU_TOKEN"
~~~

Respuesta esperada (200):

~~~json
{
  "user": {
    "id": 1,
    "role": "ADMINISTRADOR",
    "nombre": "Ana",
    "apellido": "Ponce",
    "iat": 1710000000,
    "exp": 1710028800
  }
}
~~~

## 4.2 Ruta solo para administrador

### GET /api/auth/admin-only

Solo usuarios con role ADMINISTRADOR pueden acceder.

Ejemplo:

~~~bash
curl -X GET http://localhost:3000/api/auth/admin-only \
  -H "Authorization: Bearer TU_TOKEN"
~~~

Respuesta esperada (200) para administrador:

~~~json
{
  "message": "Acceso concedido solo para administradores."
}
~~~

Si entra un rol diferente, la API responde 403.
