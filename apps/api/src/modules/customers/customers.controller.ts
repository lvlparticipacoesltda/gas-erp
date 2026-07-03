import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { JwtAuthGuard } from '../../common/guards';
import { CurrentUser } from '../../common/decorators';
import { AuthUser } from '@gas-erp/shared';

@Controller('customers')
@UseGuards(JwtAuthGuard)
export class CustomersController {
  constructor(private customersService: CustomersService) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('storeId') storeId: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.customersService.findAll(user, storeId, search, Number(page) || 1, Number(pageSize) || 20);
  }

  @Get(':id/product-prices/map')
  productPriceMap(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('storeId') storeId: string,
  ) {
    return this.customersService.productPriceMap(user, id, storeId);
  }

  @Get(':id/product-prices')
  listProductPrices(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('storeId') storeId: string,
  ) {
    return this.customersService.listProductPrices(user, id, storeId);
  }

  @Put(':id/product-prices')
  upsertProductPrice(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('storeId') storeId: string,
    @Body() body: unknown,
  ) {
    return this.customersService.upsertProductPrice(user, id, storeId, body);
  }

  @Delete(':id/product-prices/:productId')
  deleteProductPrice(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('productId') productId: string,
    @Query('storeId') storeId: string,
  ) {
    return this.customersService.deleteProductPrice(user, id, storeId, productId);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('storeId') storeId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.customersService.findOne(
      user,
      id,
      storeId,
      Number(page) || 1,
      Number(pageSize) || 10,
    );
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.customersService.create(user, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('storeId') storeId: string | undefined,
    @Body() body: unknown,
  ) {
    return this.customersService.update(user, id, storeId, body);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('storeId') storeId: string,
  ) {
    return this.customersService.remove(user, id, storeId);
  }

  @Post(':id/addresses')
  addAddress(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('storeId') storeId: string | undefined,
    @Body() body: unknown,
  ) {
    return this.customersService.addAddress(user, id, storeId, body);
  }
}
