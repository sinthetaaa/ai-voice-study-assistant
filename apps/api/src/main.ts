import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableShutdownHooks();

  const configService = app.get(ConfigService);

  const webUrl = configService.get<string>('WEB_URL', 'http://localhost:3000');

  /*
   * The Next.js web application runs separately
   * from the Nest API during local development.
   */
  app.enableCors({
    origin: webUrl,

    credentials: true,

    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,

      forbidNonWhitelisted: true,

      transform: true,
    }),
  );

  const port = configService.get<number>('API_PORT', 4000);

  await app.listen(port);

  console.log(`StudyLoop API running on http://localhost:${port}`);

  console.log(`StudyLoop web origin allowed: ${webUrl}`);
}

bootstrap().catch((error) => {
  console.error('Failed to start StudyLoop API:', error);

  process.exit(1);
});
