// src/routes/auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const QRCode = require('qrcode');
const userModel = require('../models/userModel');
const db = require('../db');
const { randomBytes } = require('crypto');
const { sendEmail } = require('../mail'); //loco

const SALT_ROUNDS = 10;

// POST /api/register
router.post('/register', (req, res) => {
  // 1. Recibimos el dob también
  const { name, dob, email, password } = req.body;

  // 2. Validación de campos vacíos
  if (!name || !dob || !email || !password) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios' });
  }

  // 3. Validación de seguridad de contraseña (mínimo 6 caracteres)
  if (password.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  }

  userModel.findByEmail(email, (err, user) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    if (user) return res.status(400).json({ error: 'El correo ya está registrado' });

    bcrypt.hash(password, SALT_ROUNDS, async (err, hash) => {
      if (err) return res.status(500).json({ error: 'Hash error' });

      // 👇 Pasamos el dob al modelo 👇
      userModel.createUser({ name, dob, email, password: hash }, async (err, newUser) => {
        if (err) return res.status(500).json({ error: 'No se pudo crear usuario' });

        // Crear token y QR
        const token = randomBytes(24).toString('hex');
        const payload = JSON.stringify({ userId: newUser.id, token });
        const qr = await QRCode.toDataURL(payload, { errorCorrectionLevel: 'H' });

        // Guardar sesión en BD
        db.run("INSERT INTO sessions (user_id, token) VALUES (?, ?)", [newUser.id, token], (err) => {
          if (err) console.error('Error creando sesión:', err);
        });

        // Enviar correo con QR
        try {
          await sendEmail(
            email,
            "Tu acceso SmartLock QR 🔐",
            `
              <h2>Hola ${name} 👋</h2>
              <p>Gracias por registrarte en <b>SmartLock</b>.</p>
              <p>Tu código QR está adjunto como archivo.</p>
              <p>⚠ No lo compartas con nadie.</p>
            `,
            qr
          );
        } catch (mailError) {
          console.error("Error al enviar el correo con QR:", mailError);
        }

        return res.json({ ok: true, message: "Usuario creado y correo enviado" });
      });
    });
  });
});

// POST /api/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Faltan credenciales' });

  userModel.findByEmail(email, (err, user) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    if (!user) return res.status(400).json({ error: 'Credenciales inválidas' });

    bcrypt.compare(password, user.password, (err, ok) => {
      if (err) return res.status(500).json({ error: 'Error' });
      if (!ok) return res.status(400).json({ error: 'Credenciales inválidas' });

      const token = randomBytes(24).toString('hex');
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();

      db.run('INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)', [user.id, token, expiresAt], function (err) {
        if (err) return res.status(500).json({ error: 'No se pudo crear sesión' });

        const payload = JSON.stringify({ userId: user.id, token });

        QRCode.toDataURL(payload, { errorCorrectionLevel: 'H' }, (err, url) => {
          if (err) return res.status(500).json({ error: 'Error generando QR' });

          return res.json({ token, qr: url, user: { id: user.id, name: user.name, email: user.email } });
        });
      });
    });
  });
});

// GET /api/users → Listar todos los usuarios
router.get('/users', (req, res) => {
  db.all('SELECT id, name, email, dob, created_at FROM users', [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Error al obtener usuarios' });
    res.json({ users: rows });
  });
});

// POST /api/open-with-qr
router.post('/open-with-qr', (req, res) => {
  const { userId, token } = req.body;
  if (!userId || !token) return res.status(400).json({ ok: false, error: 'Faltan datos' });

  db.get('SELECT * FROM sessions WHERE user_id = ? AND token = ?', [userId, token], (err, row) => {
    if (err) return res.status(500).json({ ok: false, error: 'DB error' });
    if (!row) return res.status(400).json({ ok: false, error: 'Sesión inválida' });

    if (row.expires_at) {
      const exp = new Date(row.expires_at);
      if (exp < new Date()) return res.status(400).json({ ok: false, error: 'Sesión expirada' });
    }

    db.get('SELECT * FROM lockers WHERE assigned_user_id = ?', [userId], async (err, locker) => {
      if (err) return res.status(500).json({ ok: false, error: 'DB error' });
      if (!locker) {
        db.run('INSERT INTO access_logs (user_id, locker_id, action, success) VALUES (?, ?, ?, ?)',
          [userId, null, 'open_attempt', 0],
          (err) => { if (err) console.error('Error en access_log:', err); }
        );
        return res.status(400).json({ ok: false, error: 'No hay locker asignado' });
      }

      db.run('UPDATE lockers SET status = ? WHERE id = ?', ['open', locker.id], async (err) => {
        if (err) return res.status(500).json({ ok: false, error: 'DB error' });
        db.run('INSERT INTO logs (user_id, locker_id, action) VALUES (?, ?, ?)',
          [userId, locker.id, 'open'],
          (err) => { if (err) console.error('Error en logs:', err); }
        );


        // Registrar apertura exitosa
        db.run('INSERT INTO access_logs (user_id, locker_id, action, success) VALUES (?, ?, ?, ?)',
          [userId, locker.id, 'open', 1]
        );

        // Enviar correo de notificación (NUEVO)
        await sendEmail(
          row.email,
          `Locker ${locker.id} abierto 🔓`,
          `
            <h2>Locker Abierto</h2>
            <p>El locker <strong>#${locker.id}</strong> fue abierto a las ${new Date().toLocaleString()}.</p>
            <p>Si NO fuiste tú, reporta esto inmediatamente.</p>
          `
        );

        // Mantener abierto 3s
        setTimeout(() => {
          db.run('UPDATE lockers SET status = ? WHERE id = ?', ['occupied', locker.id]);
        }, 3000);

        return res.json({ ok: true, message: 'Locker abierto (simulado)', lockerId: locker.id, notify: true });
      });
    });
  });
});

// DELETE /api/users/:id → Eliminar un usuario y limpiar sus datos
router.delete('/users/:id', (req, res) => {
  const { id } = req.params;
  
  // 1. Liberar el locker asignado (si tiene uno)
  db.run('UPDATE lockers SET assigned_user_id = NULL, status = "free" WHERE assigned_user_id = ?', [id]);
  
  // 2. Eliminar sesiones
  db.run('DELETE FROM sessions WHERE user_id = ?', [id]);
  
  // 3. Eliminar usuario
  db.run('DELETE FROM users WHERE id = ?', [id], function(err) {
    if (err) return res.status(500).json({ error: 'Error al eliminar usuario' });
    res.json({ ok: true, message: 'Usuario eliminado correctamente' });
  });
});

module.exports = router;
