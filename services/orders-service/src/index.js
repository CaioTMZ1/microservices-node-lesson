// src/index.js
import express from 'express';
import morgan from 'morgan';
import fetch from 'node-fetch';
import { createChannel } from './amqp.js';
import { ROUTING_KEYS } from '../common/events.js';
import { PrismaClient } from '@prisma/client';
import { retryWithBackoff } from './retry.js';
import { createCircuitBreaker } from './circuit.js';
import swaggerUi from 'swagger-ui-express';
import fs from 'fs';
const openapiPath = new URL('../openapi.json', import.meta.url);
let openapi = null;
try {
  openapi = JSON.parse(fs.readFileSync(openapiPath));
} catch (e) {
  // ignore in tests or when file missing
}


const app = express();
app.use(express.json());
app.use(morgan('dev'));
if (process.env.NODE_ENV !== 'test' && openapi) {
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi));
}

const prisma = new PrismaClient();

const PORT = process.env.PORT || 3002;
const USERS_BASE_URL = process.env.USERS_BASE_URL || 'http://localhost:3001';
const HTTP_TIMEOUT_MS = Number(process.env.HTTP_TIMEOUT_MS || 2000);
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@ms_rabbitmq:5672';
const EXCHANGE = process.env.EXCHANGE || 'app.topic';
const QUEUE = process.env.QUEUE || 'orders.q';
const ROUTING_KEY_USER_CREATED = process.env.ROUTING_KEY_USER_CREATED || ROUTING_KEYS.USER_CREATED;

const userCache = new Map();
let amqp = null;

if (process.env.NODE_ENV !== 'test') {
  (async () => {
    try {
      amqp = await createChannel(RABBITMQ_URL, EXCHANGE);
      console.log('[orders] AMQP connected');

      await amqp.ch.assertQueue(QUEUE, { durable: true });
      await amqp.ch.bindQueue(QUEUE, EXCHANGE, ROUTING_KEY_USER_CREATED);
      await amqp.ch.bindQueue(QUEUE, EXCHANGE, ROUTING_KEYS.USER_UPDATED);

      amqp.ch.consume(QUEUE, async (msg) => {
        if (!msg) return;
        try {
          const user = JSON.parse(msg.content.toString());
          userCache.set(user.id, user);
          console.log('[orders] consumed event -> cached user:', user.id);
          amqp.ch.ack(msg);
        } catch (err) {
          console.error('[orders] consume error:', err.message);
          amqp.ch.nack(msg, false, false);
        }
      });
    } catch (err) {
      console.error('[orders] AMQP connection failed:', err.message);
    }
  })();
}

app.get('/health', (req, res) => res.json({ ok: true, service: 'orders' }));

app.get('/', async (req, res) => {
  const all = await prisma.order.findMany();
  res.json(all);
});


async function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}


const usersBreaker = createCircuitBreaker(async (userId) => {
  const resp = await retryWithBackoff(async () => {
    const res = await fetchWithTimeout(`${USERS_BASE_URL}/${userId}`, HTTP_TIMEOUT_MS);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res;
  }, 3, 400);
  return resp;
}, 'users-service');


app.post('/', async (req, res) => {
  const { userId, items, total } = req.body || {};
  if (!userId || !Array.isArray(items) || typeof total !== 'number') {
    return res.status(400).json({ error: 'userId, items[], total<number> são obrigatórios' });
  }

  try {
    const resp = await usersBreaker.fire(userId);
    if (!resp.ok) return res.status(400).json({ error: 'usuário inválido' });
  } catch (err) {
    console.warn('[orders] users-service falhou após retries/circuit, tentando cache...', err.message);
    if (!userCache.has(userId)) {
      return res.status(503).json({ error: 'users-service indisponível e usuário não encontrado no cache' });
    }
  }

  const order = await prisma.order.create({
    data: { userId, items: JSON.stringify(items), total, status: 'created' },
  });

  try {
    if (amqp?.ch) {
      amqp.ch.publish(EXCHANGE, ROUTING_KEYS.ORDER_CREATED, Buffer.from(JSON.stringify(order)), { persistent: true });
      console.log('[orders] published event:', ROUTING_KEYS.ORDER_CREATED, order.id);
    }
  } catch (err) {
    console.error('[orders] publish error:', err.message);
  }

  res.status(201).json(order);
});

app.post('/:id/cancel', async (req, res) => {
  const { id } = req.params;
  const existing = await prisma.order.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: 'not found' });
  if (existing.status === 'cancelled') return res.json(existing);

  const cancelled = await prisma.order.update({
    where: { id },
    data: { status: 'cancelled', updatedAt: new Date() },
  });

  try {
    if (amqp?.ch) {
      amqp.ch.publish(EXCHANGE, ROUTING_KEYS.ORDER_CANCELLED, Buffer.from(JSON.stringify(cancelled)), { persistent: true });
      console.log('[orders] published event:', ROUTING_KEYS.ORDER_CANCELLED, id);
    }
  } catch (err) {
    console.error('[orders] publish error:', err.message);
  }

  res.json(cancelled);
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`[orders] listening on http://localhost:${PORT}`);
    console.log(`[orders] users base url: ${USERS_BASE_URL}`);
  });
}

export default app;
