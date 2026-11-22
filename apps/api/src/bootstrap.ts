import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

/** Creates and configures the application. Shared by main.ts and the integration tests. */
export async function createApp(options: { logger?: boolean } = {}): Promise<INestApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: options.logger === false ? false : ['log', 'warn', 'error'],
  });
  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());
  app.disable('x-powered-by');
  // Behind the Next.js rewrite in development; trust one proxy hop for client IPs.
  app.set('trust proxy', 1);
  app.enableShutdownHooks();
  return app;
}
