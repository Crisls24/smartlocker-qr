// src/routes/logs.js
const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/logs → lista completa del historial de accesos
router.get('/', (req, res) => {
  const query = `
    SELECT 
      access_logs.id,
      users.name AS user_name,
      lockers.code AS locker_code,
      access_logs.action,
      access_logs.success,
      access_logs.created_at
    FROM access_logs
    LEFT JOIN users ON users.id = access_logs.user_id
    LEFT JOIN lockers ON lockers.id = access_logs.locker_id
    ORDER BY access_logs.id DESC
  `;

  db.all(query, [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB error', details: err.message });
    res.json({ logs: rows });
  });
});

module.exports = router;
