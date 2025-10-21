import amqp from 'amqplib';
import { retryWithBackoff } from './retry.js';

export async function createChannel(url, exchange) {
  const conn = await retryWithBackoff(async () => await amqp.connect(url), 4, 300);
  const ch = await conn.createChannel();
  await ch.assertExchange(exchange, 'topic', { durable: true });
  return { conn, ch };
}
