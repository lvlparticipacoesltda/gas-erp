import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';

const SLOW_REQUEST_MS = Number(process.env.SLOW_REQUEST_MS ?? 1000);

@Injectable()
export class RequestTimingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<{ method?: string; url?: string }>();
    const started = Date.now();

    return next.handle().pipe(
      tap({
        next: () => this.logIfSlow(req, started),
        error: () => this.logIfSlow(req, started),
      }),
    );
  }

  private logIfSlow(req: { method?: string; url?: string }, started: number) {
    const ms = Date.now() - started;
    if (ms < SLOW_REQUEST_MS) return;
    this.logger.warn(`${req.method ?? 'GET'} ${req.url ?? '/'} ${ms}ms`);
  }
}
