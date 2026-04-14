const db = require('../db');

/**
 * Middleware para validar la sesión del usuario a través del token.
 * Busca el token en el body o en los headers.
 */
const authMiddleware = (req, res, next) => {
  const userId = req.body.userId || req.headers['x-user-id'];
  const token = req.body.token || req.headers['x-access-token'];

  if (!userId || !token) {
    return res.status(401).json({ ok: false, error: 'Acceso denegado: userId y token son requeridos.' });
  }

  db.get('SELECT * FROM sessions WHERE user_id = ? AND token = ?', [userId, token], (err, session) => {
    if (err) {
      console.error('Error de DB en authMiddleware:', err);
      return res.status(500).json({ ok: false, error: 'Error interno del servidor.' });
    }

    if (!session) {
      return res.status(401).json({ ok: false, error: 'Sesión inválida o expirada.' });
    }

    // Verificar expiración si existe
    if (session.expires_at) {
      const exp = new Date(session.expires_at);
      if (exp < new Date()) {
        return res.status(401).json({ ok: false, error: 'La sesión ha expirado.' });
      }
    }

    // Adjuntar sesión al request para uso posterior
    req.session = session;
    next();
  });
};

module.exports = authMiddleware;
