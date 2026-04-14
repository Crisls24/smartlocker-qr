const request = require('supertest');
const app = require('../../src/server');
const db = require('../../src/db');
const iotService = require('../../src/services/iotService');

// Mock del servicio de correo para evitar envíos reales
jest.mock('../../src/mail', () => ({
  sendEmail: jest.fn().mockResolvedValue(true),
}));

describe('Integration Test: Locker Operations', () => {
  let testUserId = 999;
  let testToken = 'test-token-123';
  let testLockerCode = 'L-TEST-01';
  let testLockerId;

  beforeAll((done) => {
    // Limpiar y preparar base de datos de prueba
    db.serialize(() => {
      db.run('DELETE FROM users WHERE id = ?', [testUserId]);
      db.run('DELETE FROM sessions WHERE user_id = ?', [testUserId]);
      db.run('DELETE FROM lockers WHERE code = ?', [testLockerCode]);
      db.run('DELETE FROM access_logs WHERE user_id = ?', [testUserId]);

      // Insertar datos de prueba
      db.run('INSERT INTO users (id, name, email, password) VALUES (?, ?, ?, ?)', 
        [testUserId, 'Tester User', 'test@example.com', 'hashedpassword']
      );
      
      db.run('INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)', 
        [testUserId, testToken, new Date(Date.now() + 3600000).toISOString()]
      );

      db.run('INSERT INTO lockers (code, assigned_user_id, status) VALUES (?, ?, ?)', 
        [testLockerCode, testUserId, 'occupied'], 
        function(err) {
          testLockerId = this.lastID;
          done();
        }
      );
    });
  });

  afterAll((done) => {
    // Limpieza final
    db.close(done);
  });

  describe('POST /api/lockers/open-with-qr', () => {
    
    test('Should open locker successfully with valid credentials', async () => {
      const response = await request(app)
        .post('/api/lockers/open-with-qr')
        .send({
          userId: testUserId,
          token: testToken
        });

      expect(response.status).toBe(200);
      expect(response.body.ok).toBe(true);
      expect(response.body.message).toContain(`Locker ${testLockerCode} abierto`);
      
      // Verificar que el estado cambió en la DB
      await new Promise((resolve) => {
          db.get('SELECT status FROM lockers WHERE id = ?', [testLockerId], (err, row) => {
              expect(row.status).toBe('open');
              resolve();
          });
      });

      // Esperar a que el timeout de auto-cierre (10ms en test) termine
      await new Promise(r => setTimeout(r, 100));
    });

    test('Should fail if token is invalid', async () => {
      const response = await request(app)
        .post('/api/lockers/open-with-qr')
        .send({
          userId: testUserId,
          token: 'invalid-token'
        });

      expect(response.status).toBe(401);
      expect(response.body.ok).toBe(false);
      expect(response.body.error).toContain('Sesión inválida');
    });

    test('Should fail if userId has no locker assigned', async () => {
      // Crear otro usuario sin locker
      const otherUserId = 888;
      const otherToken = 'other-token';
      
      await new Promise(r => db.run('INSERT INTO users (id, name) VALUES (?, ?)', [otherUserId, 'Other User'], r));
      await new Promise(r => db.run('INSERT INTO sessions (user_id, token) VALUES (?, ?)', [otherUserId, otherToken], r));

      const response = await request(app)
        .post('/api/lockers/open-with-qr')
        .send({
          userId: otherUserId,
          token: otherToken
        });

      expect(response.status).toBe(404); // He cambiado el código a 404 en el refactor
      expect(response.body.ok).toBe(false);
      expect(response.body.error).toContain('No tienes un locker asignado');
    });

    test('Should fail if userId or token are missing (Middleware test)', async () => {
        const response = await request(app)
          .post('/api/lockers/open-with-qr')
          .send({
            userId: testUserId
            // token missing
          });
  
        expect(response.status).toBe(401);
        expect(response.body.error).toContain('userId y token son requeridos');
      });
  });
});
