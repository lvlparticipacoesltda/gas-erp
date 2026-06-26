import { Controller, Get, Query, UseGuards, BadRequestException } from '@nestjs/common';
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
  master(
    @CurrentUser() user: AuthUser,
    @Query('date') date?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.service.masterOverview(user, { date, dateFrom, dateTo });
  }

  @Get('store')
  store(
    @CurrentUser() user: AuthUser,
    @Query('storeId') storeId: string,
    @Query('date') date?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    if (!storeId) {
      throw new BadRequestException('storeId é obrigatório');
    }
    return this.service.storeDashboard(user, storeId, { date, dateFrom, dateTo });
  }
}
