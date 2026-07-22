import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AuthUser } from '@gas-erp/shared';
import { JwtAuthGuard } from '../../common/guards';
import { CurrentUser } from '../../common/decorators';
import { SchedulesService } from './schedules.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class SchedulesController {
  constructor(private schedules: SchedulesService) {}

  @Get('schedules')
  getMonth(@CurrentUser() user: AuthUser, @Query() query: Record<string, string>) {
    return this.schedules.getMonthGrid(user, query);
  }

  /** Escala do próprio usuário (app do entregador). */
  @Get('schedules/me')
  getMine(@CurrentUser() user: AuthUser, @Query() query: Record<string, string>) {
    return this.schedules.getMyMonth(user, query);
  }

  @Put('schedules/day')
  upsertDay(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.schedules.upsertDay(user, body);
  }

  @Delete('schedules/day/:id')
  deleteDay(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.schedules.deleteDay(user, id);
  }

  @Post('schedules/copy')
  copy(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.schedules.copyMonth(user, body);
  }

  @Get('time-clock/me')
  myPunches(@CurrentUser() user: AuthUser, @Query() query: Record<string, string>) {
    return this.schedules.getMyPunches(user, query);
  }

  @Post('time-clock/punch')
  punch(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.schedules.punch(user, body);
  }

  @Get('time-clock')
  history(@CurrentUser() user: AuthUser, @Query() query: Record<string, string>) {
    return this.schedules.listPunches(user, query);
  }
}
