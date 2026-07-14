import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { DeliverersService } from './deliverers.service';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { CurrentUser, Roles } from '../../common/decorators';
import { AuthUser } from '@gas-erp/shared';

@Controller('deliverers')
@UseGuards(JwtAuthGuard)
export class DeliverersController {
  constructor(private service: DeliverersService) {}

  @Post('me/position')
  @UseGuards(RolesGuard)
  @Roles('DELIVERER')
  updateMyPosition(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.service.updateMyPosition(user, body);
  }

  @Get('me')
  @UseGuards(RolesGuard)
  @Roles('DELIVERER')
  getMe(@CurrentUser() user: AuthUser) {
    return this.service.getMe(user);
  }

  @Get('me/stores/:storeId/route')
  @UseGuards(RolesGuard)
  @Roles('DELIVERER')
  getStoreRoute(
    @CurrentUser() user: AuthUser,
    @Param('storeId') storeId: string,
    @Query() query: unknown,
  ) {
    return this.service.getStoreRoute(user, storeId, query);
  }

  @Put('me/push-token')
  @UseGuards(RolesGuard)
  @Roles('DELIVERER')
  registerPushToken(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.service.registerPushToken(user, body);
  }

  @Delete('me/push-token')
  @UseGuards(RolesGuard)
  @Roles('DELIVERER')
  clearPushToken(@CurrentUser() user: AuthUser) {
    return this.service.clearPushToken(user);
  }

  @Get('suggest')
  suggest(@CurrentUser() user: AuthUser, @Query() query: Record<string, string>) {
    return this.service.suggestDeliverers(user, query);
  }

  @Get('positions')
  getPositions(@CurrentUser() user: AuthUser, @Query('storeId') storeId: string) {
    return this.service.getPositions(user, storeId);
  }

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query('storeId') storeId?: string) {
    return this.service.findAll(user, storeId);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('ORG_MASTER', 'PLATFORM_ADMIN', 'STORE_MANAGER')
  create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.service.create(user, body);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('ORG_MASTER', 'PLATFORM_ADMIN', 'STORE_MANAGER', 'ATTENDANT')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.service.update(user, id, body);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('ORG_MASTER', 'PLATFORM_ADMIN', 'STORE_MANAGER')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(user, id);
  }
}
