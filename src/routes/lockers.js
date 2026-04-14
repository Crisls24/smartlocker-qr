// src/routes/lockers.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const { sendEmail } = require('../mail');


// 🔹 GET /api/lockers → lista todos los lockers
router.get('/', (req, res) => {
  db.all('SELECT id, code, assigned_user_id, status, created_at FROM lockers', [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json({ lockers: rows });
  });
});

// 🔹 POST /api/lockers → crear locker nuevo
router.post('/', (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'code requerido' });

  db.run('INSERT INTO lockers (code, status) VALUES (?, ?)', [code, 'free'], function (err) {
    if (err) return res.status(500).json({ error: 'DB error o code duplicado' });
    res.json({ ok: true, id: this.lastID, code });
  });
});

// 🔹 POST /api/lockers/assign → asignar locker a usuario
router.post('/assign', (req, res) => {
  const { lockerId, userId } = req.body;
  if (!lockerId || !userId) return res.status(400).json({ error: 'Faltan datos' });

  db.run(
    'UPDATE lockers SET assigned_user_id = ?, status = ? WHERE id = ?',
    [userId, 'occupied', lockerId],
    function (err) {
      if (err) return res.status(500).json({ error: 'DB error' });

      // Registrar acción en el log
      db.run(
        'INSERT INTO access_logs (user_id, locker_id, action, success) VALUES (?, ?, ?, ?)',
        [userId, lockerId, 'assign', 1]
      );

      return res.json({ ok: true, lockerId, userId });
    }
  );
});

// 🔹 GET /api/lockers/my-locker?token=...
router.get('/my-locker', (req, res) => {
  const token = req.query.token || req.headers['x-access-token'];
  if (!token) return res.status(400).json({ error: 'Token requerido' });

  db.get('SELECT user_id FROM sessions WHERE token = ?', [token], (err, session) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    if (!session) return res.status(401).json({ error: 'Sesión inválida' });

    db.get(
      'SELECT id, code, assigned_user_id, status FROM lockers WHERE assigned_user_id = ?',
      [session.user_id],
      (err, locker) => {
        if (err) return res.status(500).json({ error: 'DB error' });
        if (!locker) return res.json({ locker: null });
        return res.json({ locker });
      }
    );
  });
});

const authMiddleware = require('../middlewares/authMiddleware');
const iotService = require('../services/iotService');

// 🔹 POST /api/lockers/open-with-qr → Abrir locker tras validar QR
router.post('/open-with-qr', authMiddleware, (req, res) => {
  const { userId } = req.body;

  // Verificar que el usuario tenga un locker asignado
  db.get('SELECT * FROM lockers WHERE assigned_user_id = ?', [userId], async (err, locker) => {
    if (err) {
      console.error('Error al buscar locker:', err);
      return res.status(500).json({ ok: false, error: 'Error de base de datos.' });
    }

    if (!locker) {
      // Registrar intento fallido
      db.run('INSERT INTO access_logs (user_id, locker_id, action, success) VALUES (?, ?, ?, ?)',
        [userId, null, 'open_attempt', 0]
      );
      return res.status(404).json({ ok: false, error: 'No tienes un locker asignado.' });
    }

    try {
      // 📡 SEÑAL IOT -> Simular comunicación con ESP32
      const signalSent = await iotService.openLocker(locker.code);

      if (signalSent) {
        // Actualizar estado en DB
        db.run('UPDATE lockers SET status = ? WHERE id = ?', ['open', locker.id], (err) => {
          if (err) console.error('Error al actualizar estado del locker:', err);

          // Registro en Logs de acceso
          db.run('INSERT INTO access_logs (user_id, locker_id, action, success) VALUES (?, ?, ?, ?)',
            [userId, locker.id, 'open', 1]
          );

          // Notificación por Correo
          db.get('SELECT email, name FROM users WHERE id = ?', [userId], async (err, user) => {
            if (!err && user) {
              try {
                const html = `
                  <div style="font-family: Arial, sans-serif; color: #333;">
                    <h2 style="color: #2c3e50;">🔓 Locker Abierto</h2>
                    <p>Hola <strong>${user.name}</strong>,</p>
                    <p>Se ha registrado la apertura del locker <strong>${locker.code}</strong>.</p>
                    <p>Fecha y hora: ${new Date().toLocaleString()}</p>
                    <hr>
                    <small>Este es un mensaje automático de SmartLock System.</small>
                  </div>`;
                await sendEmail(user.email, 'Notificación de Apertura - SmartLock', html);
              } catch (mailError) {
                console.error("Error al enviar email:", mailError);
              }
            }
          });

          // Cerrar automáticamente tras 3 segundos (Simulación de hardware)
          const closeTimeout = process.env.NODE_ENV === 'test' ? 10 : 3000;
          setTimeout(async () => {
            try {
              await iotService.closeLocker(locker.code);
              db.run('UPDATE lockers SET status = ? WHERE id = ?', ['occupied', locker.id]);
            } catch (err) {
              console.error('Error in auto-close:', err);
            }
          }, closeTimeout);

          return res.json({
            ok: true,
            message: `Locker ${locker.code} abierto correctamente.`,
            lockerId: locker.id,
            timestamp: new Date().toISOString()
          });
        });
      }
    } catch (iotError) {
      console.error('Error en comunicación IoT:', iotError);
      return res.status(503).json({ ok: false, error: 'Error de comunicación con el dispositivo IoT.' });
    }
  });
});

// 🔹 GET /api/lockers/logs → historial de accesos
router.get('/logs', (req, res) => {
  db.all(
    `SELECT 
        access_logs.id,
        users.name AS user_name,
        lockers.code AS locker_code,
        access_logs.action,
        access_logs.success,
        access_logs.created_at
     FROM access_logs
     LEFT JOIN users ON access_logs.user_id = users.id
     LEFT JOIN lockers ON access_logs.locker_id = lockers.id
     ORDER BY access_logs.created_at DESC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'DB error al obtener logs' });
      res.json({ logs: rows });
    }
  );
});

module.exports = router;

