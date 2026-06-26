import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { PurchaseInvoicesService } from './purchase-invoices.service';
import { JwtAuthGuard } from '../../common/guards';
import { CurrentUser } from '../../common/decorators';
import { AuthUser } from '@gas-erp/shared';

@Controller('purchase-invoices')
@UseGuards(JwtAuthGuard)
export class PurchaseInvoicesController {
  constructor(private purchaseInvoicesService: PurchaseInvoicesService) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('storeId') storeId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.purchaseInvoicesService.findAll(
      user,
      storeId,
      Number(page) || 1,
      Number(pageSize) || 20,
    );
  }

  @Post('import')
  importFromNfe(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.purchaseInvoicesService.importFromNfe(user, body);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.purchaseInvoicesService.findOne(user, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.purchaseInvoicesService.create(user, body);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.purchaseInvoicesService.update(user, id, body);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.purchaseInvoicesService.cancel(user, id);
  }
}
