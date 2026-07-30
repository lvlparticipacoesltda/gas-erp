import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import {
  PrismaExceptionFilter,
  PrismaValidationExceptionFilter,
} from './common/filters/prisma-exception.filter';
import { ZodExceptionFilter } from './common/filters/zod-exception.filter';
import { RequestTimingInterceptor } from './common/interceptors/request-timing.interceptor';

/** JSON body: foto de ponto em base64 (~5 MB binário ≈ ~6.7 MB no JSON). */
const JSON_BODY_LIMIT = '8mb';

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
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Fly / proxies: confia em X-Forwarded-For para IP real do cliente.
  app.set('trust proxy', 1);
  app.useBodyParser('json', { limit: JSON_BODY_LIMIT });
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
  app.useGlobalInterceptors(new RequestTimingInterceptor());
  app.useGlobalFilters(
    new ZodExceptionFilter(),
    new PrismaExceptionFilter(),
    new PrismaValidationExceptionFilter(),
  );
  const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3001);
  await app.listen(port);
  console.log(`API running on http://localhost:${port}/api/v1`);
  console.log(`CORS allowed origins: ${allowedOrigins.join(', ')}`);
}

bootstrap();
