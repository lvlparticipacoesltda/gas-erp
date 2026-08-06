import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../../common/mail/mail.service';
import {
  AuthUser,
  SESSION_SUPERSEDED_CODE,
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  resolveUserPermissions,
  updateProfileSchema,
} from '@gas-erp/shared';

const FORGOT_PASSWORD_MESSAGE =
  'Se o e-mail estiver cadastrado, você receberá instruções para redefinir a senha em breve.';

const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000;
const PAIRING_CODE_TTL_MS = 10 * 60 * 1000;

export type LoginRequestMeta = {
  ipAddress?: string | null;
  userAgent?: string | null;
};

function normalizePairingCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '');
}

function generatePairingCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  const bytes = randomBytes(6);
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[bytes[i]! % alphabet.length];
  }
  return code;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private mail: MailService,
  ) {}

  async login(input: unknown, meta: LoginRequestMeta = {}) {
    const { email, password, client, deviceId, pairingCode } = loginSchema.parse(input);
    const user = await this.prisma.user.findFirst({
      where: { email, active: true },
      include: { userStores: true, organization: true },
    });
    if (!user) throw new UnauthorizedException('Credenciais inválidas');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Credenciais inválidas');

    if (user.role === 'DELIVERER' && client === 'web') {
      throw new ForbiddenException(
        'Entregadores devem acessar pelo aplicativo móvel. O painel web é exclusivo para a equipe da loja.',
      );
    }

    const now = new Date();
    let trustedDeviceId: string | null = null;

    // Atendente: pareamento ou aparelho já confiável → convive com sessão web.
    if (user.role === 'ATTENDANT' && client === 'mobile' && deviceId) {
      if (pairingCode) {
        const code = normalizePairingCode(pairingCode);
        const pairing = await this.prisma.devicePairingCode.findFirst({
          where: {
            userId: user.id,
            code,
            usedAt: null,
            expiresAt: { gt: now },
          },
          orderBy: { createdAt: 'desc' },
        });
        if (!pairing) {
          throw new BadRequestException(
            'Código de aparelho inválido ou expirado. Gere um novo em Minha conta.',
          );
        }
        await this.prisma.$transaction([
          this.prisma.devicePairingCode.update({
            where: { id: pairing.id },
            data: { usedAt: now },
          }),
          this.prisma.trustedDevice.upsert({
            where: { userId_deviceId: { userId: user.id, deviceId } },
            create: { userId: user.id, deviceId, lastSeenAt: now },
            update: { lastSeenAt: now },
          }),
        ]);
        trustedDeviceId = deviceId;
      } else {
        const trusted = await this.prisma.trustedDevice.findUnique({
          where: { userId_deviceId: { userId: user.id, deviceId } },
        });
        if (trusted) {
          trustedDeviceId = deviceId;
          await this.prisma.trustedDevice.update({
            where: { id: trusted.id },
            data: { lastSeenAt: now },
          });
        }
      }
    }

    if (user.role === 'ATTENDANT' && client === 'mobile' && trustedDeviceId) {
      // Mantém sessões web; revoga outras sessões mobile.
      await this.prisma.userSession.updateMany({
        where: {
          userId: user.id,
          revokedAt: null,
          OR: [{ client: 'mobile' }, { client: null }],
        },
        data: {
          revokedAt: now,
          revokeReason: 'replaced_by_new_login',
        },
      });
    } else if (user.role === 'ATTENDANT' && client === 'web') {
      // Mantém sessões mobile de aparelhos confiáveis; revoga web e mobile não confiáveis.
      const trusted = await this.prisma.trustedDevice.findMany({
        where: { userId: user.id },
        select: { deviceId: true },
      });
      const trustedIds = trusted.map((t) => t.deviceId);
      const active = await this.prisma.userSession.findMany({
        where: { userId: user.id, revokedAt: null },
        select: { id: true, client: true, deviceId: true },
      });
      const toRevoke = active
        .filter((s) => {
          if (s.client === 'mobile' && s.deviceId && trustedIds.includes(s.deviceId)) {
            return false;
          }
          return true;
        })
        .map((s) => s.id);
      if (toRevoke.length > 0) {
        await this.prisma.userSession.updateMany({
          where: { id: { in: toRevoke } },
          data: {
            revokedAt: now,
            revokeReason: 'replaced_by_new_login',
          },
        });
      }
    } else {
      // Login único (entregador e demais casos).
      await this.prisma.userSession.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: {
          revokedAt: now,
          revokeReason: 'replaced_by_new_login',
        },
      });
    }

    const session = await this.prisma.userSession.create({
      data: {
        userId: user.id,
        client: client ?? null,
        deviceId: client === 'mobile' ? deviceId ?? null : null,
        ipAddress: meta.ipAddress?.slice(0, 128) || null,
        userAgent: meta.userAgent?.slice(0, 512) || null,
      },
    });

    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organizationId: user.organizationId,
      storeIds: user.userStores.map((us) => us.storeId),
      permissions: resolveUserPermissions(user.role, user.permissions),
      sessionId: session.id,
    };

    const accessToken = await this.jwt.signAsync(authUser);
    return {
      accessToken,
      user: authUser,
      organization: { id: user.organization.id, name: user.organization.name },
      trustedDevice: Boolean(trustedDeviceId),
    };
  }

  private assertAttendant(user: AuthUser) {
    if (user.role !== 'ATTENDANT') {
      throw new ForbiddenException('Dispositivos confiáveis são exclusivos de atendentes.');
    }
  }

  async createPairingCode(user: AuthUser) {
    this.assertAttendant(user);
    const now = new Date();
    const code = generatePairingCode();
    const expiresAt = new Date(now.getTime() + PAIRING_CODE_TTL_MS);
    await this.prisma.devicePairingCode.create({
      data: {
        userId: user.id,
        code,
        expiresAt,
      },
    });
    return {
      code,
      expiresAt: expiresAt.toISOString(),
      expiresInSeconds: Math.floor(PAIRING_CODE_TTL_MS / 1000),
    };
  }

  async listTrustedDevices(user: AuthUser) {
    this.assertAttendant(user);
    const devices = await this.prisma.trustedDevice.findMany({
      where: { userId: user.id },
      orderBy: { lastSeenAt: 'desc' },
    });
    return {
      items: devices.map((d) => ({
        id: d.id,
        deviceId: d.deviceId,
        label: d.label,
        createdAt: d.createdAt.toISOString(),
        lastSeenAt: d.lastSeenAt.toISOString(),
      })),
    };
  }

  async deleteTrustedDevice(user: AuthUser, id: string) {
    this.assertAttendant(user);
    const device = await this.prisma.trustedDevice.findFirst({
      where: { id, userId: user.id },
    });
    if (!device) throw new BadRequestException('Aparelho não encontrado');
    await this.prisma.$transaction([
      this.prisma.trustedDevice.delete({ where: { id: device.id } }),
      this.prisma.userSession.updateMany({
        where: {
          userId: user.id,
          deviceId: device.deviceId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
          revokeReason: 'revoked_by_admin',
        },
      }),
    ]);
    return { ok: true };
  }

  async logout(sessionId: string | undefined) {
    if (!sessionId) return { ok: true };
    await this.prisma.userSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: 'logout' },
    });
    return { ok: true };
  }

  /** Valida sid do JWT; atualiza lastSeenAt (e IP, com evidência se mudou). */
  async assertActiveSession(
    userId: string,
    sessionId: string | undefined,
    requestIp?: string | null,
  ): Promise<void> {
    if (!sessionId) {
      throw new UnauthorizedException({
        code: SESSION_SUPERSEDED_CODE,
        message: 'Sessão expirada. Faça login novamente.',
      });
    }

    const session = await this.prisma.userSession.findFirst({
      where: { id: sessionId, userId },
      select: {
        id: true,
        userId: true,
        client: true,
        deviceId: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
        revokedAt: true,
        revokeReason: true,
        lastSeenAt: true,
      },
    });

    if (!session) {
      throw new UnauthorizedException({
        code: SESSION_SUPERSEDED_CODE,
        message: 'Sessão inválida. Faça login novamente.',
      });
    }

    if (session.revokedAt) {
      const message =
        session.revokeReason === 'replaced_by_new_login'
          ? 'Sua conta foi acessada de outro lugar. Faça login novamente.'
          : session.revokeReason === 'revoked_by_admin'
            ? 'Sua sessão foi encerrada pelo administrador. Faça login novamente.'
            : 'Sessão encerrada. Faça login novamente.';
      throw new UnauthorizedException({
        code: SESSION_SUPERSEDED_CODE,
        message,
      });
    }

    const now = new Date();
    const shouldTouch = Date.now() - session.lastSeenAt.getTime() >= LAST_SEEN_THROTTLE_MS;
    const incomingIp = requestIp?.slice(0, 128) || null;
    const ipChanged =
      Boolean(incomingIp)
      && Boolean(session.ipAddress)
      && incomingIp !== session.ipAddress;

    // Só avalia troca de IP no mesmo ritmo do lastSeen (evita spam de evidências).
    if (!shouldTouch && !(incomingIp && !session.ipAddress)) return;

    if (ipChanged && incomingIp && session.ipAddress) {
      // Evidência: mantém o IP antigo como sessão encerrada; a ativa passa a ser o novo IP.
      //
      // O painel dispara várias requisições em paralelo. Sem o compare-and-swap
      // abaixo, todas liam o mesmo `session.ipAddress` antigo e cada uma gravava
      // sua própria evidência — o resultado eram N linhas encerradas idênticas
      // (mesmo IP, mesmo início, mesmo fim), porque a cópia herda `createdAt` e
      // `lastSeenAt` do original. O `updateMany` condicionado ao IP antigo só
      // acerta uma linha: quem perder a corrida vê `count === 0` e não duplica.
      await this.prisma
        .$transaction(async (tx) => {
          const swapped = await tx.userSession.updateMany({
            where: { id: session.id, ipAddress: session.ipAddress, revokedAt: null },
            data: { ipAddress: incomingIp, lastSeenAt: now },
          });
          if (swapped.count === 0) return;
          await tx.userSession.create({
            data: {
              userId: session.userId,
              client: session.client,
              deviceId: session.deviceId,
              ipAddress: session.ipAddress,
              userAgent: session.userAgent,
              createdAt: session.createdAt,
              lastSeenAt: session.lastSeenAt,
              revokedAt: now,
              revokeReason: 'ip_changed',
            },
          });
        })
        .catch(() => undefined);
      return;
    }

    await this.prisma.userSession.update({
      where: { id: session.id },
      data: {
        lastSeenAt: now,
        ...(incomingIp && !session.ipAddress ? { ipAddress: incomingIp } : {}),
      },
    }).catch(() => undefined);
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
      permissions: resolveUserPermissions(user.role, user.permissions),
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
      permissions: resolveUserPermissions(updated.role, updated.permissions),
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
      // Novo login obrigatório após reset.
      this.prisma.userSession.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date(), revokeReason: 'password_reset' },
      }),
    ]);

    return { message: 'Senha redefinida com sucesso. Você já pode fazer login.' };
  }
}
