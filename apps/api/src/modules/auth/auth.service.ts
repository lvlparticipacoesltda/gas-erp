import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { loginSchema } from '@gas-erp/shared';
import { AuthUser } from '@gas-erp/shared';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
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
      role: user.role,
      organizationId: user.organizationId,
      storeIds: user.userStores.map((us) => us.storeId),
      stores: user.userStores.map((us) => us.store),
      organization: user.organization,
    };
  }
}
