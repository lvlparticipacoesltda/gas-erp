import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../../common/guards';
import { CurrentUser } from '../../common/decorators';
import { AuthUser, REPORT_TYPES, type ReportType } from '@gas-erp/shared';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private service: ReportsService) {}

  @Get('sales')
  sales(
    @CurrentUser() user: AuthUser,
    @Query('storeId') storeId: string,
    @Query('date') date?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('status') status?: string,
    @Query('delivererSearch') delivererSearch?: string,
    @Query('customerSearch') customerSearch?: string,
    @Query('paymentMethod') paymentMethod?: string,
  ) {
    this.assertStoreId(storeId);
    return this.service.salesReport(
      user,
      storeId,
      { date, dateFrom, dateTo },
      { status, delivererSearch, customerSearch, paymentMethod },
    );
  }

  @Get('purchases')
  purchases(
    @CurrentUser() user: AuthUser,
    @Query('storeId') storeId: string,
    @Query('date') date?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    this.assertStoreId(storeId);
    return this.service.purchasesReport(user, storeId, { date, dateFrom, dateTo });
  }

  @Get('stock')
  stock(
    @CurrentUser() user: AuthUser,
    @Query('storeId') storeId: string,
    @Query('date') date?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    this.assertStoreId(storeId);
    return this.service.stockReport(user, storeId, { date, dateFrom, dateTo });
  }

  @Get('export')
  async export(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
    @Query('type') type: string,
    @Query('storeId') storeId: string,
    @Query('date') date?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('format') format = 'csv',
    @Query('status') status?: string,
    @Query('delivererSearch') delivererSearch?: string,
    @Query('customerSearch') customerSearch?: string,
    @Query('paymentMethod') paymentMethod?: string,
  ): Promise<string> {
    this.assertStoreId(storeId);
    if (!REPORT_TYPES.includes(type as ReportType)) {
      throw new BadRequestException('Tipo de relatório inválido (use sales, purchases ou stock).');
    }
    if (format !== 'csv') {
      throw new BadRequestException('Formato de exportação não suportado (use csv).');
    }

    const salesFilters = { status, delivererSearch, customerSearch, paymentMethod };
    const { filename, csv } = await this.service.exportCsv(
      user,
      type as ReportType,
      storeId,
      { date, dateFrom, dateTo },
      type === 'sales' ? salesFilters : {},
    );

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return csv;
  }

  private assertStoreId(storeId: string) {
    if (!storeId) {
      throw new BadRequestException('storeId é obrigatório');
    }
  }
}
