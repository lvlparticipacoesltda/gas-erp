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
    @Query('date') date?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const normalizedDate = date?.trim() || undefined;
    const normalizedDateFrom = dateFrom?.trim() || undefined;
    const normalizedDateTo = dateTo?.trim() || undefined;
    const hasDate = normalizedDate || normalizedDateFrom || normalizedDateTo;
    return this.stockService.getMovements(
      user,
      storeId,
      Number(page) || 1,
      Number(pageSize) || 20,
      hasDate
        ? { date: normalizedDate, dateFrom: normalizedDateFrom, dateTo: normalizedDateTo }
        : undefined,
    );
  }

  @Post('adjust')
  adjust(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.stockService.adjust(user, body);
  }
}
