import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { VasilhameLoansService } from './vasilhame-loans.service';
import { JwtAuthGuard } from '../../common/guards';
import { CurrentUser } from '../../common/decorators';
import { AuthUser, vasilhameLoanFiltersSchema } from '@gas-erp/shared';

@Controller('vasilhame-loans')
@UseGuards(JwtAuthGuard)
export class VasilhameLoansController {
  constructor(private service: VasilhameLoansService) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Query() query: Record<string, string>,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const filters = vasilhameLoanFiltersSchema.parse({
      storeId: query.storeId,
      search: query.search,
    });
    return this.service.findAll(user, filters, Number(page) || 1, Number(pageSize) || 20);
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

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(user, id);
  }
}
