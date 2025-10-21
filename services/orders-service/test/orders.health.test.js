import request from 'supertest';
import app from '../src/index.js';

describe('orders-service /health', () => {
  it('returns ok true', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

