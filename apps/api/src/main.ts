import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableShutdownHooks();

  const configService = app.get(ConfigService);
  const port = configService.get<number>('API_PORT', 4000);

  await app.listen(port);

  console.log(`StudyLoop API running on http://localhost:${port}`);
}

bootstrap().catch((error) => {
  console.error('Failed to start StudyLoop API:', error);
  process.exit(1);
});
