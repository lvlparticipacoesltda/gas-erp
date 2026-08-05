import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ResultsService } from './results.service';
import { JwtAuthGuard } from '../../common/guards';
import { CurrentUser } from '../../common/decorators';
import { AuthUser } from '@gas-erp/shared';

@Controller('results')
@UseGuards(JwtAuthGuard)
export class ResultsController {
  constructor(private service: ResultsService) {}

  @Get('by-store')
  byStore(
    @CurrentUser() user: AuthUser,
    @Query('date') date?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.service.byStore(user, { date, dateFrom, dateTo });
  }
}
