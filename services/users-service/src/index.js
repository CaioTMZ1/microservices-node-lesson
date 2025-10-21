import express from 'express';
import morgan from 'morgan';
import { createChannel } from './amqp.js';
import { PrismaClient } from '@prisma/client';
import { ROUTING_KEYS } from '../common/events.js';
import swaggerUi from 'swagger-ui-express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const prisma = new PrismaClient();
const app = express();

app.use(express.json());
app.use(morgan('dev'));
if (process.env.NODE_ENV !== 'test') {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const openapiPath = path.join(__dirname, '../openapi.json');
  try {
    const openapi = JSON.parse(fs.readFileSync(openapiPath, 'utf8'));
    app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi));
  } catch (e) {
    console.warn('[users] openapi load skipped:', e.message);
  }
}

const PORT = process.env.PORT || 3001;
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@ms_rabbitmq:5672';
const EXCHANGE = process.env.EXCHANGE || 'app.topic';

let amqp = null;
if (process.env.NODE_ENV !== 'test') {
  (async () => {
    try {
      amqp = await createChannel(RABBITMQ_URL, EXCHANGE);
      console.log('[users] AMQP connected');
    } catch (err) {
      console.error('[users] AMQP connection failed:', err.message);
    }
  })();
}

// =============================
// HEALTHCHECK
// =============================
app.get('/health', (req, res) => res.json({ ok: true, service: 'users' }));

// =============================
// LISTAR TODOS OS USUÁRIOS
// =============================
app.get('/', async (req, res) => {
  try {
    const users = await prisma.user.findMany();
    res.json(users);
  } catch (err) {
    console.error('[users] list error:', err.message);
    res.status(500).json({ error: 'internal server error' });
  }
});

// =============================
// CRIAR NOVO USUÁRIO
// =============================
app.post('/', async (req, res) => {
  const { name, email } = req.body || {};
  if (!name || !email) return res.status(400).json({ error: 'name and email are required' });

  try {
    const user = await prisma.user.create({
      data: { name, email },
    });

    // Publica evento user.created
    if (amqp?.ch) {
      const payload = Buffer.from(JSON.stringify(user));
      amqp.ch.publish(EXCHANGE, ROUTING_KEYS.USER_CREATED, payload, { persistent: true });
      console.log('[users] published event:', ROUTING_KEYS.USER_CREATED, user);
    }

    res.status(201).json(user);
  } catch (err) {
    console.error('[users] create error:', err.message);
    if (err.code === 'P2002') {
      res.status(409).json({ error: 'email already exists' });
    } else {
      res.status(500).json({ error: 'internal server error' });
    }
  }
});

// =============================
// BUSCAR USUÁRIO POR ID
// =============================
app.get('/:id', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ error: 'user not found' });
    res.json(user);
  } catch (err) {
    console.error('[users] get error:', err.message);
    res.status(500).json({ error: 'internal server error' });
  }
});

// =============================
// ATUALIZAR USUÁRIO
// =============================
app.put('/:id', async (req, res) => {
  const { name, email } = req.body || {};
  if (!name && !email) return res.status(400).json({ error: 'name or email required' });

  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { name, email, updatedAt: new Date() },
    });

    // Publica evento user.updated
    if (amqp?.ch) {
      const payload = Buffer.from(JSON.stringify(user));
      amqp.ch.publish(EXCHANGE, ROUTING_KEYS.USER_UPDATED, payload, { persistent: true });
      console.log('[users] published event:', ROUTING_KEYS.USER_UPDATED, user.id);
    }

    res.json(user);
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'user not found' });
    }
    console.error('[users] update error:', err.message);
    res.status(500).json({ error: 'internal server error' });
  }
});

// =============================
// DELETAR USUÁRIO
// =============================
app.delete('/:id', async (req, res) => {
  try {
    const user = await prisma.user.delete({ where: { id: req.params.id } });

    console.log('[users] deleted user:', req.params.id);

    // Publica evento (opcional)
    if (amqp?.ch) {
      const payload = Buffer.from(JSON.stringify({ id: user.id }));
      amqp.ch.publish(EXCHANGE, 'user.deleted', payload, { persistent: true });
      console.log('[users] published event: user.deleted', user.id);
    }

    res.status(204).end();
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'user not found' });
    }
    console.error('[users] delete error:', err.message);
    res.status(500).json({ error: 'internal server error' });
  }
});

// =============================
// START SERVER
// =============================
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`[users] listening on http://localhost:${PORT}`);
  });
}

export default app;
