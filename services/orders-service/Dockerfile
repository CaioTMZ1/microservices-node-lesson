FROM node:20-alpine

WORKDIR /app

# Copiar dependências e instalar
COPY services/orders-service/package.json ./
RUN npm install --only=production

# Copiar código e schema do Prisma
COPY services/orders-service/src ./src
COPY services/orders-service/prisma ./prisma
COPY common ./common

# Gerar Prisma Client dentro do container
RUN npx prisma generate

# Variáveis de ambiente padrão
ENV PORT=3002
ENV USERS_BASE_URL=http://ms_users:3001
ENV HTTP_TIMEOUT_MS=2000
ENV RABBITMQ_URL=amqp://guest:guest@ms_rabbitmq:5672
ENV EXCHANGE=app.topic
ENV QUEUE=orders.q
ENV ROUTING_KEY_USER_CREATED=user.created

EXPOSE 3002
CMD ["npm", "start"]
