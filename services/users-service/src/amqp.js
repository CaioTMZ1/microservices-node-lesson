import amqplib from 'amqplib';

export async function createChannel(url, exchange, maxRetries = 5, baseDelayMs = 300) {
  let attempt = 0;
  while (true) {
    try {
      const conn = await amqplib.connect(url);
      const ch = await conn.createChannel();
      await ch.assertExchange(exchange, 'topic', { durable: true });
      return { conn, ch };
    } catch (err) {
      attempt += 1;
      if (attempt > maxRetries) {
        throw err;
      }
      const delay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), 15000);
      console.warn(`[users][amqp] connect retry ${attempt} in ${delay}ms: ${err.message}`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}
