import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { customerAddressSchema, createCustomerSchema, updateCustomerSchema } from '@gas-erp/shared';
import { AuthUser } from '@gas-erp/shared';
import { assertStoreAccess } from '../../common/guards';
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

  async findOne(user: AuthUser, id: string, storeId?: string) {
    if (storeId) assertStoreAccess(user, storeId);

    const customer = await this.prisma.customer.findFirst({
      where: { id, organizationId: user.organizationId },
      include: {
        category: true,
        addresses: true,
        sales: {
          where: storeId ? { storeId } : undefined,
          take: 50,
          orderBy: { createdAt: 'desc' },
          include: {
            items: { include: { product: { select: { name: true } } } },
          },
        },
      },
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
    const customer = await this.findOne(user, id);
    const data = updateCustomerSchema.parse(input);
    const { addresses, ...customerData } = data;

    await this.prisma.customer.update({
      where: { id },
      data: {
        ...(customerData.name !== undefined ? { name: customerData.name } : {}),
        ...(customerData.email !== undefined ? { email: customerData.email || null } : {}),
        ...(customerData.phone !== undefined ? { phone: customerData.phone } : {}),
        ...(customerData.document !== undefined ? { document: customerData.document } : {}),
        ...(customerData.notes !== undefined ? { notes: customerData.notes } : {}),
        ...(customerData.categoryId !== undefined ? { categoryId: customerData.categoryId } : {}),
      },
    });

    if (addresses?.[0]) {
      const addr = addresses[0];
      const existing = customer.addresses.find((a) => a.isDefault) ?? customer.addresses[0];
      if (existing) {
        await this.prisma.customerAddress.update({
          where: { id: existing.id },
          data: addr,
        });
      } else {
        await this.prisma.customerAddress.create({
          data: { ...addr, customerId: id, isDefault: addr.isDefault ?? true },
        });
      }
    }

    return this.findOne(user, id);
  }

  async addAddress(user: AuthUser, customerId: string, input: unknown) {
    await this.findOne(user, customerId);
    const data = customerAddressSchema.parse(input);
    return this.prisma.customerAddress.create({
      data: { ...data, customerId },
    });
  }
}
