FROM node:20-alpine

WORKDIR /app

# Copiar dependências
COPY services/users-service/package.json ./
RUN npm install --only=production

# Copiar código-fonte e schema do Prisma
COPY services/users-service/src ./src
COPY services/users-service/openapi.json ./openapi.json
COPY services/users-service/prisma ./prisma
COPY common ./common

# Gerar Prisma Client dentro do container
RUN npx prisma generate

ENV PORT=3001
ENV RABBITMQ_URL=amqp://guest:guest@ms_rabbitmq:5672
ENV EXCHANGE=app.topic

EXPOSE 3001
CMD ["sh","-c","npx prisma migrate deploy || npx prisma db push && npm start"]
