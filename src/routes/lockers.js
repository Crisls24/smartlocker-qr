// src/routes/lockers.js
const express = require("express");
const router = express.Router();
const db = require("../db");
const { sendEmail } = require("../mail");

// 🔹 GET /api/lockers → lista todos los lockers
router.get("/", (req, res) => {
  db.all(
    "SELECT id, code, assigned_user_id, status, created_at FROM lockers",
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: "DB error" });
      res.json({ lockers: rows });
    },
  );
});

// 🔹 POST /api/lockers → crear locker nuevo
router.post("/", (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: "code requerido" });

  db.run(
    "INSERT INTO lockers (code, status) VALUES (?, ?)",
    [code, "free"],
    function (err) {
      if (err)
        return res.status(500).json({ error: "DB error o code duplicado" });

      res.json({ ok: true, id: this.lastID, code });
    },
  );
});

// 🔹 POST /api/lockers/assign → asignar locker a usuario
router.post("/assign", (req, res) => {
  const { lockerId, userId } = req.body;
  if (!lockerId || !userId)
    return res.status(400).json({ error: "Faltan datos" });

  db.run(
    "UPDATE lockers SET assigned_user_id = ?, status = ? WHERE id = ?",
    [userId, "occupied", lockerId],
    function (err) {
      if (err) return res.status(500).json({ error: "DB error" });

      db.run(
        "INSERT INTO access_logs (user_id, locker_id, action, success) VALUES (?, ?, ?, ?)",
        [userId, lockerId, "assign", 1],
      );

      return res.json({ ok: true, lockerId, userId });
    },
  );
});

// 🔹 GET /api/lockers/my-locker (SEGURO: solo headers + expiración)
router.get("/my-locker", (req, res) => {
  const token = req.headers["x-access-token"];

  if (!token)
    return res.status(400).json({ error: "Token requerido en headers" });

  db.get(
    "SELECT user_id, expires_at FROM sessions WHERE token = ?",
    [token],
    (err, session) => {
      if (err) return res.status(500).json({ error: "DB error" });

      if (!session) return res.status(401).json({ error: "Sesión inválida" });

      // 🔒 Validar expiración
      if (new Date(session.expires_at) < new Date()) {
        return res.status(401).json({ error: "Sesión expirada" });
      }

      db.get(
        "SELECT id, code, assigned_user_id, status FROM lockers WHERE assigned_user_id = ?",
        [session.user_id],
        (err, locker) => {
          if (err) return res.status(500).json({ error: "DB error" });

          if (!locker) return res.json({ locker: null });

          return res.json({ locker });
        },
      );
    },
  );
});

// 🔹 POST /api/open-with-qr (SEGURIDAD COMPLETA)
router.post("/open-with-qr", (req, res) => {
  const { userId, token } = req.body;

  if (!userId || !token) {
    return res.status(400).json({ ok: false, error: "Datos incompletos" });
  }

  // Validar QR seguro
  db.get(
    "SELECT * FROM qr_tokens WHERE token = ? AND user_id = ?",
    [token, userId],
    (err, qr) => {
      if (err)
        return res.status(500).json({ ok: false, error: "DB error en QR" });

      if (!qr) return res.json({ ok: false, error: "QR inválido" });

      // Expiración
      if (new Date(qr.expires_at) < new Date()) {
        return res.json({ ok: false, error: "QR expirado" });
      }

      // Un solo uso
      if (qr.used) {
        return res.json({ ok: false, error: "QR ya utilizado" });
      }

      // Marcar como usado
      db.run("UPDATE qr_tokens SET used = 1 WHERE token = ?", [token]);

      // 🔍 Obtener locker
      db.get(
        "SELECT * FROM lockers WHERE assigned_user_id = ?",
        [userId],
        (err, locker) => {
          if (err)
            return res
              .status(500)
              .json({ ok: false, error: "DB error en lockers" });

          if (!locker)
            return res.json({
              ok: false,
              error: "No hay locker asignado",
            });

          // 🔓 Abrir locker
          db.run(
            "UPDATE lockers SET status = ? WHERE id = ?",
            ["open", locker.id],
            (err) => {
              if (err)
                return res
                  .status(500)
                  .json({ ok: false, error: "Error al abrir locker" });

              // ⏱️ Auto cierre
              setTimeout(() => {
                db.run("UPDATE lockers SET status = ? WHERE id = ?", [
                  "occupied",
                  locker.id,
                ]);
              }, 3000);

              // 📝 Log
              db.run(
                "INSERT INTO access_logs (user_id, locker_id, action, success) VALUES (?, ?, ?, ?)",
                [userId, locker.id, "open", 1],
              );

              // 📧 Correo (CORREGIDO: locker ya existe aquí)
              db.get(
                "SELECT email, name FROM users WHERE id = ?",
                [userId],
                async (err, user) => {
                  if (!err && user) {
                    const html = `
                      <h2>Locker abierto correctamente</h2>
                      <p>Hola ${user.name},</p>
                      <p>Se registró la apertura del locker <strong>${locker.code}</strong>.</p>
                      <p>Fecha: ${new Date().toLocaleString()}</p>
                      <p>Si no fuiste tú, repórtalo de inmediato.</p>
                      <br>
                      <small>SmartLock System</small>
                    `;

                    await sendEmail(
                      user.email,
                      "Notificación de apertura de locker",
                      html,
                    );
                  }
                },
              );

              res.json({
                ok: true,
                message: `Locker ${locker.code} abierto`,
                lockerId: locker.id,
              });
            },
          );
        },
      );
    },
  );
});

// 🔹 GET /api/lockers/logs → historial
router.get("/logs", (req, res) => {
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
      if (err)
        return res.status(500).json({ error: "DB error al obtener logs" });

      res.json({ logs: rows });
    },
  );
});

module.exports = router;
