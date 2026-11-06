import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyMultipart from '@fastify/multipart';
import { AppModule } from './app.module';
import { runMigrations } from './database/migrate';

async function bootstrap() {
  await runMigrations();

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ bodyLimit: 10 * 1024 * 1024 }),
  );
  await app.register(fastifyCookie as any);
  await app.register(fastifyMultipart as any, { limits: { fileSize: 50 * 1024 * 1024, files: 1 } });
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  console.log(`Arkivo API ouvindo em http://localhost:${port}/api`);
}

bootstrap();
