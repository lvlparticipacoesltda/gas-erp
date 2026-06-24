import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

function parseAllowedOrigins(): string[] {
  const raw = process.env.WEB_URL?.trim();
  if (!raw) return ['http://localhost:3000'];

  const origins = raw
    .split(',')
    .map((value) => value.trim().replace(/^["']|["']$/g, '').replace(/[\r\n]/g, ''))
    .filter(Boolean);

  return origins.length > 0 ? origins : ['http://localhost:3000'];
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const allowedOrigins = parseAllowedOrigins();

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean | string) => void,
    ) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, origin ?? allowedOrigins[0]);
        return;
      }
      callback(null, false);
    },
    credentials: true,
  });

  app.setGlobalPrefix('api/v1');
  const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3001);
  await app.listen(port);
  console.log(`API running on http://localhost:${port}/api/v1`);
  console.log(`CORS allowed origins: ${allowedOrigins.join(', ')}`);
}

bootstrap();
