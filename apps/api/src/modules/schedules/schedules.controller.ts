import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
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

  @Post('schedules/clear')
  clear(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.schedules.clearMonth(user, body);
  }

  @Get('schedules/weeklies')
  listWeeklies(@CurrentUser() user: AuthUser, @Query() query: Record<string, string>) {
    return this.schedules.listWeeklies(user, query);
  }

  @Post('schedules/weeklies/apply-store')
  applyStoreWeeklies(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.schedules.applyStoreWeeklies(user, body);
  }

  @Get('schedules/weeklies/:userId')
  getWeekly(@CurrentUser() user: AuthUser, @Param('userId') userId: string) {
    return this.schedules.getWeekly(user, userId);
  }

  @Put('schedules/weeklies/:userId')
  upsertWeekly(
    @CurrentUser() user: AuthUser,
    @Param('userId') userId: string,
    @Body() body: unknown,
  ) {
    return this.schedules.upsertWeekly(user, userId, body);
  }

  @Delete('schedules/weeklies/:userId')
  deleteWeekly(@CurrentUser() user: AuthUser, @Param('userId') userId: string) {
    return this.schedules.deleteWeekly(user, userId);
  }

  @Post('schedules/weeklies/:userId/apply')
  applyWeekly(
    @CurrentUser() user: AuthUser,
    @Param('userId') userId: string,
    @Body() body: unknown,
  ) {
    return this.schedules.applyWeekly(user, userId, body);
  }

  @Get('time-clock/me')
  myPunches(@CurrentUser() user: AuthUser, @Query() query: Record<string, string>) {
    return this.schedules.getMyPunches(user, query);
  }

  @Post('time-clock/punch')
  punch(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.schedules.punch(user, body);
  }

  @Get('time-clock/report')
  report(@CurrentUser() user: AuthUser, @Query() query: Record<string, string>) {
    return this.schedules.getTimeClockReport(user, query);
  }

  @Get('time-clock/cards')
  cards(@CurrentUser() user: AuthUser, @Query() query: Record<string, string>) {
    return this.schedules.getTimeClockCards(user, query);
  }

  @Get('time-clock/day-photos')
  dayPhotos(@CurrentUser() user: AuthUser, @Query() query: Record<string, string>) {
    return this.schedules.getDayPhotos(user, query);
  }

  @Put('time-clock/day')
  upsertDayPunches(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.schedules.upsertTimeClockDay(user, body);
  }

  @Get('time-clock/justifications')
  listJustifications(
    @CurrentUser() user: AuthUser,
    @Query() query: Record<string, string>,
  ) {
    return this.schedules.listJustifications(user, query);
  }

  @Post('time-clock/justifications')
  createJustification(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.schedules.createJustification(user, body);
  }

  @Get('time-clock/justifications/:id/file')
  async justificationFile(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.schedules.getJustificationFile(user, id);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${file.fileName.replace(/"/g, '')}"`,
    );
    return new StreamableFile(file.bytes);
  }

  @Delete('time-clock/justifications/:id')
  deleteJustification(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.schedules.deleteJustification(user, id);
  }

  @Get('time-clock')
  history(@CurrentUser() user: AuthUser, @Query() query: Record<string, string>) {
    return this.schedules.listPunches(user, query);
  }
}
