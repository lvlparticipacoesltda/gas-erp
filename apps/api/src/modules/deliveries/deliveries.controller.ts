import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { DeliveriesService } from './deliveries.service';
import { JwtAuthGuard } from '../../common/guards';
import { CurrentUser } from '../../common/decorators';
import { AuthUser } from '@gas-erp/shared';

@Controller('deliveries')
@UseGuards(JwtAuthGuard)
export class DeliveriesController {
  constructor(private service: DeliveriesService) {}

  @Get()
  findByStore(@CurrentUser() user: AuthUser, @Query('storeId') storeId: string) {
    return this.service.findByStore(user, storeId);
  }

  @Get('my')
  findMine(@CurrentUser() user: AuthUser) {
    return this.service.findByDeliverer(user);
  }

  @Get(':id/route')
  getRoute(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query() query: unknown,
  ) {
    return this.service.getRouteForDelivery(user, id, query);
  }

  @Get(':id/tracking')
  tracking(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.getTrackingHistory(user, id);
  }

  @Post(':id/tracking')
  addTracking(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.service.addTrackingPoint(user, id, body);
  }

  @Patch(':id/status')
  updateStatus(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.service.updateStatus(user, id, body);
  }

  @Patch(':id/assign')
  assignDeliverer(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.service.assignDeliverer(user, id, body);
  }
}
