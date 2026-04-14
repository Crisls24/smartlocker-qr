// src/db.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbFile = process.env.NODE_ENV === 'test' 
  ? path.join(__dirname, '..', 'smartlock_test.db') 
  : path.join(__dirname, '..', 'smartlock.db');

const db = new sqlite3.Database(dbFile, (err) => {
  if (err) {
    console.error('Error abriendo base de datos:', err.message);
  } else {
    if (process.env.NODE_ENV !== 'test') {
      console.log('Base de datos SQLite conectada:', dbFile);
    }
  }
});

db.serialize(() => {
  
db.run(`CREATE TABLE IF NOT EXISTS access_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  locker_id INTEGER,
  action TEXT, -- 'open', 'close', 'assign', etc.
  success INTEGER DEFAULT 1, -- 1 true, 0 false
  created_at DATETIME DEFAULT (datetime('now','localtime'))
)`);

  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    email TEXT UNIQUE,
    password TEXT,
    created_at DATETIME DEFAULT (datetime('now','localtime'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS lockers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE,
    assigned_user_id INTEGER,
    status TEXT DEFAULT 'free',
    created_at DATETIME DEFAULT (datetime('now','localtime'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    token TEXT,
    created_at DATETIME DEFAULT (datetime('now','localtime')),
    expires_at DATETIME
  )`);
  db.run(`
  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    locker_id INTEGER,
    action TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

});

module.exports = db;
