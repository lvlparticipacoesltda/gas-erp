import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ProductsService } from './products.service';
import { JwtAuthGuard } from '../../common/guards';
import { CurrentUser } from '../../common/decorators';
import { AuthUser } from '@gas-erp/shared';

@Controller('products')
@UseGuards(JwtAuthGuard)
export class ProductsController {
  constructor(private productsService: ProductsService) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('storeId') storeId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
  ) {
    return this.productsService.findAll(
      user,
      storeId,
      Number(page) || 1,
      Number(pageSize) || 20,
      search,
    );
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.productsService.findOne(user, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
    @Query('storeId') storeId?: string,
  ) {
    return this.productsService.create(user, body, storeId);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.productsService.update(user, id, body);
  }

  @Patch(':id/price')
  updatePrice(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.productsService.updatePrice(user, id, body);
  }
}
