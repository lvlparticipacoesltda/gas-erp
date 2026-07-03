import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { StoresService } from './stores.service';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { CurrentUser, Roles } from '../../common/decorators';
import { AuthUser } from '@gas-erp/shared';

@Controller('stores')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StoresController {
  constructor(private storesService: StoresService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.storesService.findAll(user);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.storesService.findOne(user, id);
  }

  @Post()
  @Roles('ORG_MASTER', 'PLATFORM_ADMIN')
  create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.storesService.create(user, body);
  }

  @Patch(':id')
  @Roles('ORG_MASTER', 'PLATFORM_ADMIN')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.storesService.update(user, id, body);
  }

  @Delete(':id')
  @Roles('ORG_MASTER', 'PLATFORM_ADMIN')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.storesService.remove(user, id);
  }
}
