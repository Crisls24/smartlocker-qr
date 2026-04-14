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
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Completa los campos' });

  userModel.findByEmail(email, (err, user) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    if (user) return res.status(400).json({ error: 'Usuario ya existe' });

    bcrypt.hash(password, SALT_ROUNDS, async (err, hash) => {
      if (err) return res.status(500).json({ error: 'Hash error' });

      userModel.createUser({ name, email, password: hash }, async (err, newUser) => {
        if (err) return res.status(500).json({ error: 'No se pudo crear usuario' });

        // Crear token y QR
        const token = randomBytes(24).toString('hex');
        const payload = JSON.stringify({ userId: newUser.id, token });
        const qr = await QRCode.toDataURL(payload, { errorCorrectionLevel: 'H' });

        // Guardar sesión en BD
        db.run("INSERT INTO sessions (user_id, token) VALUES (?, ?)", [newUser.id, token]);

        // Enviar correo con QR
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

      db.run('INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)', [user.id, token, expiresAt], function(err) {
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

module.exports = router;
