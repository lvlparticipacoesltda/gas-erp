import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ExpensesService } from './expenses.service';
import { JwtAuthGuard } from '../../common/guards';
import { CurrentUser } from '../../common/decorators';
import { AuthUser, expenseFiltersSchema, type ExpenseFilters } from '@gas-erp/shared';

@Controller('expenses')
@UseGuards(JwtAuthGuard)
export class ExpensesController {
  constructor(private service: ExpensesService) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Query() query: Record<string, string>,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.findAll(
      user,
      this.parseFilters(query),
      Number(page) || 1,
      Number(pageSize) || 20,
    );
  }

  @Get('summary')
  summary(@CurrentUser() user: AuthUser, @Query() query: Record<string, string>) {
    return this.service.summary(user, this.parseFilters(query));
  }

  @Get('export')
  async export(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
    @Query() query: Record<string, string>,
  ): Promise<string> {
    const { filename, csv } = await this.service.exportCsv(user, this.parseFilters(query));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return csv;
  }

  /* Rotas de categoria vêm antes de `:id` para não serem capturadas por ele. */

  @Get('categories')
  listCategories(
    @CurrentUser() user: AuthUser,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.service.listCategories(user, includeInactive === 'true');
  }

  @Post('categories')
  createCategory(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.service.createCategory(user, body);
  }

  @Patch('categories/:id')
  updateCategory(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.service.updateCategory(user, id, body);
  }

  @Delete('categories/:id')
  removeCategory(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.removeCategory(user, id);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.findOne(user, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.service.create(user, body);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.service.update(user, id, body);
  }

  @Post(':id/pay')
  pay(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.service.pay(user, id, body);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(user, id);
  }

  private parseFilters(query: Record<string, string>): ExpenseFilters {
    return expenseFiltersSchema.parse({
      storeId: query.storeId,
      categoryId: query.categoryId,
      status: query.status,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      search: query.search,
    });
  }
}
