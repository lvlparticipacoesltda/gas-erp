import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { AuthUser } from '@gas-erp/shared';
import { ROLES_KEY } from '../decorators';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<T>(err: Error | null, user: T): T {
    if (err || !user) {
      throw err ?? new UnauthorizedException('Não autenticado');
    }
    return user;
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles?.length) return true;

    const { user } = context.switchToHttp().getRequest<{ user: AuthUser }>();
    if (!requiredRoles.includes(user.role)) {
      throw new ForbiddenException('Sem permissão para esta ação');
    }
    return true;
  }
}

@Injectable()
export class StoreScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      user: AuthUser;
      headers: Record<string, string>;
      query: Record<string, string>;
      params: Record<string, string>;
    }>();

    const user = request.user;
    const storeId =
      request.headers['x-store-id'] ??
      request.query.storeId ??
      request.params.storeId;

    if (!storeId) return true;
    if (user.role === 'ORG_MASTER' || user.role === 'PLATFORM_ADMIN') return true;
    if (!user.storeIds.includes(storeId)) {
      throw new ForbiddenException('Sem acesso a esta loja');
    }
    return true;
  }
}

export function assertStoreAccess(user: AuthUser, storeId: string) {
  if (user.role === 'ORG_MASTER' || user.role === 'PLATFORM_ADMIN') return;
  if (!user.storeIds.includes(storeId)) {
    throw new ForbiddenException('Sem acesso a esta loja');
  }
}
