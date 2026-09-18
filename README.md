# SmartLock — Casilleros inteligentes con acceso QR

Sistema de **casilleros / lockers inteligentes** que permite a los usuarios **reservar y
abrir un locker mediante código QR**. Backend en Node.js/Express, frontend HTML/CSS
vanilla y base de datos SQLite, con envío del QR por correo.

## Stack

- **Backend:** Node.js + Express 5, bcrypt, `sqlite3`, `qrcode`, `nodemailer`.
- **Frontend:** HTML/CSS/JS vanilla (sin build).
- **Testing:** Jest + Supertest. Calidad: SonarQube (`sonar-project.properties`).
- **Deploy:** listo para Render (`render.yaml`).

## Funcionalidades

- Registro / inicio de sesión con contraseña cifrada (bcrypt) y sesión por token.
- Generación y envío del **QR** por email (QRCode + Nodemailer).
- Apertura por código QR (`/api/open-with-qr`) con auto-asignación de lockers libres.
- Panel de administración: estadísticas, usuarios, lockers e historial de accesos.
- Notificaciones por email al abrir un locker o al registrar un usuario (opcional).

## Configuración

Copia `.env.example` a `.env` y define las credenciales de correo:

```env
GMAIL_USER=tu.correo@gmail.com
GMAIL_APP_PASSWORD=tu_app_password_de_16_caracteres
PORT=3000
```

> Usa una **contraseña de aplicación** de Google (Verificación en 2 pasos > Contraseñas
> de aplicaciones). Nunca pongas estas credenciales en el código.

## Cómo ejecutar

```sh
npm install
npm run dev        # o: npm start  → http://localhost:3000
npm test           # suite de pruebas Jest
```

## Soporte

Web responsive (login, registro, dashboard, escaneo y panel admin). Persistencia en
`smartlock.db` (SQLite).