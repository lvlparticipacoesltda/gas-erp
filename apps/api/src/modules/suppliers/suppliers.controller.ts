import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { SuppliersService } from './suppliers.service';
import { JwtAuthGuard } from '../../common/guards';
import { CurrentUser } from '../../common/decorators';
import { AuthUser } from '@gas-erp/shared';

@Controller('suppliers')
@UseGuards(JwtAuthGuard)
export class SuppliersController {
  constructor(private suppliersService: SuppliersService) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.suppliersService.findAll(user, search, Number(page) || 1, Number(pageSize) || 20);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.suppliersService.findOne(user, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.suppliersService.create(user, body);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.suppliersService.update(user, id, body);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.suppliersService.remove(user, id);
  }
}
