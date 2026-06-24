import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../../common/mail/mail.service';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  updateProfileSchema,
} from '@gas-erp/shared';
import { AuthUser } from '@gas-erp/shared';

const FORGOT_PASSWORD_MESSAGE =
  'Se o e-mail estiver cadastrado, você receberá instruções para redefinir a senha em breve.';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private mail: MailService,
  ) {}

  async login(input: unknown) {
    const { email, password } = loginSchema.parse(input);
    const user = await this.prisma.user.findFirst({
      where: { email, active: true },
      include: { userStores: true, organization: true },
    });
    if (!user) throw new UnauthorizedException('Credenciais inválidas');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Credenciais inválidas');

    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organizationId: user.organizationId,
      storeIds: user.userStores.map((us) => us.storeId),
    };

    const accessToken = await this.jwt.signAsync(authUser);
    return {
      accessToken,
      user: authUser,
      organization: { id: user.organization.id, name: user.organization.name },
    };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { userStores: { include: { store: true } }, organization: true },
    });
    if (!user) throw new UnauthorizedException();

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      role: user.role,
      organizationId: user.organizationId,
      storeIds: user.userStores.map((us) => us.storeId),
      stores: user.userStores.map((us) => us.store),
      organization: user.organization,
    };
  }

  async updateProfile(userId: string, input: unknown) {
    const data = updateProfileSchema.parse(input);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    if (data.email && data.email !== user.email) {
      const existing = await this.prisma.user.findFirst({
        where: { organizationId: user.organizationId, email: data.email, NOT: { id: userId } },
      });
      if (existing) throw new ConflictException('Este e-mail já está cadastrado nesta rede');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { name: data.name, phone: data.phone, email: data.email },
      include: { userStores: { include: { store: true } }, organization: true },
    });

    return {
      id: updated.id,
      email: updated.email,
      name: updated.name,
      phone: updated.phone,
      role: updated.role,
      organizationId: updated.organizationId,
      storeIds: updated.userStores.map((us) => us.storeId),
      stores: updated.userStores.map((us) => us.store),
      organization: updated.organization,
    };
  }

  async changePassword(userId: string, input: unknown) {
    const { currentPassword, newPassword } = changePasswordSchema.parse(input);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) throw new BadRequestException('Senha atual incorreta');

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await bcrypt.hash(newPassword, 10) },
    });

    return { message: 'Senha alterada com sucesso' };
  }

  async forgotPassword(input: unknown) {
    const { email } = forgotPasswordSchema.parse(input);
    const user = await this.prisma.user.findFirst({
      where: { email, active: true },
    });

    if (user) {
      await this.prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });

      const token = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      await this.prisma.passwordResetToken.create({
        data: { userId: user.id, token, expiresAt },
      });

      const webUrl = (process.env.WEB_URL ?? 'http://localhost:3000')
        .split(',')[0]
        ?.trim()
        .replace(/^["']|["']$/g, '')
        .replace(/\/$/, '');
      const resetUrl = `${webUrl}/reset-password?token=${token}`;
      await this.mail.sendPasswordReset(user.email, user.name, resetUrl);
    }

    return { message: FORGOT_PASSWORD_MESSAGE };
  }

  async resetPassword(input: unknown) {
    const { token, newPassword } = resetPasswordSchema.parse(input);
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('Link inválido ou expirado. Solicite uma nova redefinição.');
    }

    if (!record.user.active) {
      throw new BadRequestException('Usuário inativo. Contate o administrador.');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash: await bcrypt.hash(newPassword, 10) },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);

    return { message: 'Senha redefinida com sucesso. Você já pode fazer login.' };
  }
}
