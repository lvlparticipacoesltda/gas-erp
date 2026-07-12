import { BadRequestException, Controller, Get, Header, MessageEvent, Query, Req, Sse, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import { AuthUser } from '@gas-erp/shared';
import { CurrentUser, Roles } from '../decorators';
import { JwtAuthGuard, RolesGuard, assertStoreAccess } from '../guards';
import { StoreRealtimeService } from './store-realtime.service';

@Controller('realtime')
@UseGuards(JwtAuthGuard)
export class RealtimeController {
  constructor(private readonly realtime: StoreRealtimeService) {}

  @Get('store')
  @Sse()
  @Header('Cache-Control', 'no-cache')
  @Header('Connection', 'keep-alive')
  @Header('X-Accel-Buffering', 'no')
  storeEvents(
    @CurrentUser() user: AuthUser,
    @Query('storeId') storeId: string,
    @Req() req: Request,
  ): Observable<MessageEvent> {
    if (!storeId?.trim()) {
      throw new BadRequestException('storeId é obrigatório');
    }
    assertStoreAccess(user, storeId);
    return this.realtime.streamStore(storeId, req);
  }

  @Get('org')
  @Sse()
  @Header('Cache-Control', 'no-cache')
  @Header('Connection', 'keep-alive')
  @Header('X-Accel-Buffering', 'no')
  @UseGuards(RolesGuard)
  @Roles('ORG_MASTER', 'PLATFORM_ADMIN')
  orgEvents(@CurrentUser() user: AuthUser, @Req() req: Request): Observable<MessageEvent> {
    return this.realtime.streamOrg(user.organizationId, req);
  }
}
