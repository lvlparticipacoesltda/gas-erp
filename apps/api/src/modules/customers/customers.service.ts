import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { customerAddressSchema, createCustomerSchema, updateCustomerSchema } from '@gas-erp/shared';
import { AuthUser } from '@gas-erp/shared';
import { paginate, paginatedResult } from '../../common/utils/pagination';

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService) {}

  async findAll(user: AuthUser, search?: string, page = 1, pageSize = 20) {
    const { skip, take, page: p, pageSize: ps } = paginate(page, pageSize);
    const where = {
      organizationId: user.organizationId,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { phone: { contains: search } },
              { document: { contains: search } },
            ],
          }
        : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        skip,
        take,
        include: { category: true, addresses: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.customer.count({ where }),
    ]);
    return paginatedResult(data, total, p, ps);
  }

  async findOne(user: AuthUser, id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, organizationId: user.organizationId },
      include: { category: true, addresses: true, sales: { take: 10, orderBy: { createdAt: 'desc' } } },
    });
    if (!customer) throw new NotFoundException('Cliente não encontrado');
    return customer;
  }

  async create(user: AuthUser, input: unknown) {
    const data = createCustomerSchema.parse(input);
    return this.prisma.customer.create({
      data: {
        organizationId: user.organizationId,
        name: data.name,
        email: data.email || null,
        phone: data.phone,
        document: data.document,
        notes: data.notes,
        categoryId: data.categoryId,
        addresses: data.addresses?.length
          ? { create: data.addresses }
          : undefined,
      },
      include: { addresses: true, category: true },
    });
  }

  async update(user: AuthUser, id: string, input: unknown) {
    await this.findOne(user, id);
    const data = updateCustomerSchema.parse(input);
    return this.prisma.customer.update({
      where: { id },
      data: {
        name: data.name,
        email: data.email || null,
        phone: data.phone,
        document: data.document,
        notes: data.notes,
        categoryId: data.categoryId,
      },
      include: { addresses: true, category: true },
    });
  }

  async addAddress(user: AuthUser, customerId: string, input: unknown) {
    await this.findOne(user, customerId);
    const data = customerAddressSchema.parse(input);
    return this.prisma.customerAddress.create({
      data: { ...data, customerId },
    });
  }
}
