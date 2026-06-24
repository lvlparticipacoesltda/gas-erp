import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { CurrentUser, Roles } from '../../common/decorators';
import { AuthUser } from '@gas-erp/shared';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private service: DashboardService) {}

  @Get('master')
  @UseGuards(RolesGuard)
  @Roles('ORG_MASTER', 'PLATFORM_ADMIN')
  master(@CurrentUser() user: AuthUser) {
    return this.service.masterOverview(user);
  }

  @Get('store')
  store(
    @CurrentUser() user: AuthUser,
    @Query('storeId') storeId: string,
    @Query('date') date?: string,
  ) {
    return this.service.storeDashboard(user, storeId, date);
  }
}
