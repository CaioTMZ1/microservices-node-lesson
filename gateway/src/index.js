import express from 'express';
import morgan from 'morgan';
import { createProxyMiddleware } from 'http-proxy-middleware';

const app = express();
app.use(morgan('dev'));

const PORT = process.env.PORT || 3000;
const USERS_URL = process.env.USERS_URL || 'http://users:3001';
const ORDERS_URL = process.env.ORDERS_URL || 'http://orders:3002';

// Health
app.get('/health', (req, res) => res.json({ ok: true, service: 'gateway' }));

// Importante: não usar express.json() aqui.
// Deixe o proxy encaminhar o corpo bruto direto para o serviço de destino.

// Roteamento de APIs
app.use('/users', createProxyMiddleware({
  target: USERS_URL,
  changeOrigin: true,
  pathRewrite: { '^/users': '' },
  timeout: 3000,
  proxyTimeout: 3000,
  onError(err, req, res) {
    console.error('[gateway] /users proxy error:', err.code || err.message);
    if (!res.headersSent) {
      res.status(502).json({ error: 'users service unavailable' });
    }
  }
}));

app.use('/orders', createProxyMiddleware({
  target: ORDERS_URL,
  changeOrigin: true,
  pathRewrite: { '^/orders': '' },
  timeout: 3000,
  proxyTimeout: 3000,
  onError(err, req, res) {
    console.error('[gateway] /orders proxy error:', err.code || err.message);
    if (!res.headersSent) {
      res.status(502).json({ error: 'orders service unavailable' });
    }
  }
}));

app.listen(PORT, () => {
  console.log(`[gateway] listening on http://localhost:${PORT}`);
  console.log(`[gateway] users -> ${USERS_URL}`);
  console.log(`[gateway] orders -> ${ORDERS_URL}`);
});
