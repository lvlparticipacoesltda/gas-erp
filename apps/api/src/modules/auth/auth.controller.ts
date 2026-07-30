import { Body, Controller, Get, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../../common/guards';
import { CurrentUser } from '../../common/decorators';
import { AuthUser } from '@gas-erp/shared';
import { clientIpFromRequest } from '../../common/http/client-ip';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  login(@Body() body: unknown, @Req() req: Request) {
    return this.authService.login(body, {
      ipAddress: clientIpFromRequest(req),
      userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
    });
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  logout(@CurrentUser() user: AuthUser) {
    return this.authService.logout(user.sessionId);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return this.authService.me(user.id);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  updateProfile(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.authService.updateProfile(user.id, body);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  changePassword(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.authService.changePassword(user.id, body);
  }

  @Post('forgot-password')
  forgotPassword(@Body() body: unknown) {
    return this.authService.forgotPassword(body);
  }

  @Post('reset-password')
  resetPassword(@Body() body: unknown) {
    return this.authService.resetPassword(body);
  }
}
