import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { SalesService } from './sales.service';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { CurrentUser, Roles } from '../../common/decorators';
import { AuthUser } from '@gas-erp/shared';

@Controller('sales')
@UseGuards(JwtAuthGuard)
export class SalesController {
  constructor(private salesService: SalesService) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('storeId') storeId: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('backdatePending') backdatePending?: string,
    @Query('mobilePending') mobilePending?: string,
  ) {
    return this.salesService.findAll(
      user,
      storeId,
      status,
      Number(page) || 1,
      Number(pageSize) || 20,
      backdatePending === 'true',
      mobilePending === 'true',
    );
  }

  @Get('mobile/mine')
  @UseGuards(RolesGuard)
  @Roles('DELIVERER')
  findMobilePendingByDeliverer(@CurrentUser() user: AuthUser) {
    return this.salesService.findMobilePendingByDeliverer(user);
  }

  @Post('mobile')
  @UseGuards(RolesGuard)
  @Roles('DELIVERER')
  createMobile(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.salesService.createMobile(user, body);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.salesService.findOne(user, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.salesService.create(user, body);
  }

  @Patch(':id/status')
  updateStatus(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.salesService.updateStatus(user, id, body);
  }

  @Patch(':id/payments')
  updatePayments(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.salesService.updatePayments(user, id, body);
  }

  @Post(':id/backdate/approve')
  approveBackdate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.salesService.approveBackdate(user, id);
  }

  @Post(':id/backdate/reject')
  rejectBackdate(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.salesService.rejectBackdate(user, id, body);
  }

  @Post(':id/mobile/approve')
  approveMobile(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.salesService.approveMobile(user, id);
  }

  @Post(':id/mobile/reject')
  rejectMobile(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.salesService.rejectMobile(user, id, body);
  }
}
