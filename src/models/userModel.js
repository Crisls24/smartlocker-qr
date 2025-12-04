// src/models/userModel.js
const db = require('../db');

module.exports = {
  createUser({ name, email, password }, cb) {
    const sql = `INSERT INTO users (name, email, password) VALUES (?, ?, ?)`;
    db.run(sql, [name, email, password], function(err) {
      if (err) return cb(err);
      db.get('SELECT id, name, email, created_at FROM users WHERE id = ?', [this.lastID], cb);
    });
  },

  findByEmail(email, cb) {
    db.get('SELECT * FROM users WHERE email = ?', [email], cb);
  },

  findById(id, cb) {
    db.get('SELECT id, name, email, created_at FROM users WHERE id = ?', [id], cb);
  }
};
