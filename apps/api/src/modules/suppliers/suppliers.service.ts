import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { createSupplierSchema, updateSupplierSchema } from '@gas-erp/shared';
import { AuthUser } from '@gas-erp/shared';
import { paginate, paginatedResult } from '../../common/utils/pagination';

@Injectable()
export class SuppliersService {
  constructor(private prisma: PrismaService) {}

  async findAll(user: AuthUser, search?: string, page = 1, pageSize = 20) {
    const { skip, take, page: p, pageSize: ps } = paginate(page, pageSize);
    const where = {
      organizationId: user.organizationId,
      active: true,
      ...(search
        ? {
            OR: [
              { legalName: { contains: search, mode: 'insensitive' as const } },
              { tradeName: { contains: search, mode: 'insensitive' as const } },
              { document: { contains: search } },
              { phone: { contains: search } },
            ],
          }
        : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.supplier.findMany({
        where,
        skip,
        take,
        orderBy: { legalName: 'asc' },
      }),
      this.prisma.supplier.count({ where }),
    ]);
    return paginatedResult(data, total, p, ps);
  }

  async findOne(user: AuthUser, id: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!supplier) throw new NotFoundException('Fornecedor não encontrado');
    return supplier;
  }

  async create(user: AuthUser, input: unknown) {
    const data = createSupplierSchema.parse(input);
    return this.prisma.supplier.create({
      data: {
        organizationId: user.organizationId,
        type: data.type ?? 'PJ',
        legalName: data.legalName,
        tradeName: data.tradeName || null,
        document: data.document || null,
        stateRegistration: data.stateRegistration || null,
        email: data.email || null,
        phone: data.phone || null,
        rntrc: data.rntrc || null,
        zipCode: data.zipCode || null,
        street: data.street || null,
        number: data.number || null,
        complement: data.complement || null,
        neighborhood: data.neighborhood || null,
        city: data.city || null,
        state: data.state || null,
        landmark: data.landmark || null,
        notes: data.notes || null,
        finalConsumer: data.finalConsumer ?? false,
        publicAgency: data.publicAgency ?? false,
        active: data.active ?? true,
      },
    });
  }

  async update(user: AuthUser, id: string, input: unknown) {
    await this.findOne(user, id);
    const data = updateSupplierSchema.parse(input);
    return this.prisma.supplier.update({
      where: { id },
      data: {
        ...(data.type !== undefined ? { type: data.type } : {}),
        ...(data.legalName !== undefined ? { legalName: data.legalName } : {}),
        ...(data.tradeName !== undefined ? { tradeName: data.tradeName || null } : {}),
        ...(data.document !== undefined ? { document: data.document || null } : {}),
        ...(data.stateRegistration !== undefined
          ? { stateRegistration: data.stateRegistration || null }
          : {}),
        ...(data.email !== undefined ? { email: data.email || null } : {}),
        ...(data.phone !== undefined ? { phone: data.phone || null } : {}),
        ...(data.rntrc !== undefined ? { rntrc: data.rntrc || null } : {}),
        ...(data.zipCode !== undefined ? { zipCode: data.zipCode || null } : {}),
        ...(data.street !== undefined ? { street: data.street || null } : {}),
        ...(data.number !== undefined ? { number: data.number || null } : {}),
        ...(data.complement !== undefined ? { complement: data.complement || null } : {}),
        ...(data.neighborhood !== undefined ? { neighborhood: data.neighborhood || null } : {}),
        ...(data.city !== undefined ? { city: data.city || null } : {}),
        ...(data.state !== undefined ? { state: data.state || null } : {}),
        ...(data.landmark !== undefined ? { landmark: data.landmark || null } : {}),
        ...(data.notes !== undefined ? { notes: data.notes || null } : {}),
        ...(data.finalConsumer !== undefined ? { finalConsumer: data.finalConsumer } : {}),
        ...(data.publicAgency !== undefined ? { publicAgency: data.publicAgency } : {}),
        ...(data.active !== undefined ? { active: data.active } : {}),
      },
    });
  }

  async remove(user: AuthUser, id: string) {
    await this.findOne(user, id);
    return this.prisma.supplier.update({
      where: { id },
      data: { active: false },
    });
  }
}
