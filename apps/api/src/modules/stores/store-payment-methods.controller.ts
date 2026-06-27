import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { StorePaymentMethodsService } from './store-payment-methods.service';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { CurrentUser, Roles } from '../../common/decorators';
import { AuthUser } from '@gas-erp/shared';

@Controller('stores/:storeId/payment-methods')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StorePaymentMethodsController {
  constructor(private paymentMethodsService: StorePaymentMethodsService) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Param('storeId') storeId: string,
    @Query('activeOnly') activeOnly?: string,
  ) {
    return this.paymentMethodsService.findAll(user, storeId, activeOnly === 'true');
  }

  @Post()
  @Roles('ORG_MASTER', 'STORE_MANAGER', 'FINANCE', 'PLATFORM_ADMIN')
  create(
    @CurrentUser() user: AuthUser,
    @Param('storeId') storeId: string,
    @Body() body: unknown,
  ) {
    return this.paymentMethodsService.create(user, storeId, body);
  }

  @Patch(':id')
  @Roles('ORG_MASTER', 'STORE_MANAGER', 'FINANCE', 'PLATFORM_ADMIN')
  update(
    @CurrentUser() user: AuthUser,
    @Param('storeId') storeId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.paymentMethodsService.update(user, storeId, id, body);
  }

  @Delete(':id')
  @Roles('ORG_MASTER', 'STORE_MANAGER', 'FINANCE', 'PLATFORM_ADMIN')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('storeId') storeId: string,
    @Param('id') id: string,
  ) {
    return this.paymentMethodsService.remove(user, storeId, id);
  }
}
