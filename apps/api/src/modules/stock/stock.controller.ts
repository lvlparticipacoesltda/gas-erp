import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { StockService } from './stock.service';
import { JwtAuthGuard } from '../../common/guards';
import { CurrentUser } from '../../common/decorators';
import { AuthUser } from '@gas-erp/shared';

@Controller('stock')
@UseGuards(JwtAuthGuard)
export class StockController {
  constructor(private stockService: StockService) {}

  @Get('balances')
  balances(@CurrentUser() user: AuthUser, @Query('storeId') storeId: string) {
    return this.stockService.getBalances(user, storeId);
  }

  @Get('movements')
  movements(
    @CurrentUser() user: AuthUser,
    @Query('storeId') storeId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.stockService.getMovements(user, storeId, Number(page) || 1, Number(pageSize) || 20);
  }

  @Post('adjust')
  adjust(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.stockService.adjust(user, body);
  }
}
