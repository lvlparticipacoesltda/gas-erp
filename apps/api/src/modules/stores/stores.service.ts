import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  createStoreSchema,
  updateStoreSchema,
  type CreateStoreInput,
  type UpdateStoreInput,
} from '@gas-erp/shared';
import { AuthUser } from '@gas-erp/shared';
import { AuditService } from '../../common/audit/audit.service';
import { StorePaymentMethodsService } from './store-payment-methods.service';
import { GeocodingService } from '../../common/geocoding/geocoding.service';
import { CnpjLookupService } from '../../common/cnpj/cnpj-lookup.service';

function buildLegacyAddress(data: {
  street?: string | null;
  number?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
}): string | undefined {
  const line = [data.street, data.number].filter(Boolean).join(', ');
  const city = [data.city, data.state].filter(Boolean).join(' - ');
  const parts = [line, data.neighborhood, city].filter(Boolean);
  return parts.length ? parts.join(', ') : undefined;
}

@Injectable()
export class StoresService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private paymentMethods: StorePaymentMethodsService,
    private geocoding: GeocodingService,
    private cnpjLookup: CnpjLookupService,
  ) {}

  private async resolveLegalName(cnpj?: string | null): Promise<string | null | undefined> {
    if (cnpj === undefined) return undefined;
    if (cnpj == null || cnpj === '') return null;
    return (await this.cnpjLookup.lookupCompanyName(cnpj)) ?? null;
  }

  findAll(user: AuthUser) {
    const where =
      user.role === 'ORG_MASTER' || user.role === 'PLATFORM_ADMIN'
        ? { organizationId: user.organizationId }
        : { id: { in: user.storeIds }, organizationId: user.organizationId };

    return this.prisma.store.findMany({
      where,
      orderBy: { name: 'asc' },
    });
  }

  async findOne(user: AuthUser, id: string) {
    const store = await this.prisma.store.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!store) throw new NotFoundException('Loja não encontrada');
    if (user.role !== 'ORG_MASTER' && user.role !== 'PLATFORM_ADMIN' && !user.storeIds.includes(id)) {
      throw new NotFoundException('Loja não encontrada');
    }
    return store;
  }

  private async resolveCoords(
    data: CreateStoreInput | UpdateStoreInput,
    previous?: { latitude: number | null; longitude: number | null },
  ): Promise<{ latitude?: number | null; longitude?: number | null }> {
    if (data.latitude != null && data.longitude != null) {
      return { latitude: data.latitude, longitude: data.longitude };
    }

    const street = data.street?.trim();
    const city = data.city?.trim();
    const state = data.state?.trim();
    if (!street || !city || !state) {
      return {};
    }

    try {
      const geo = await this.geocoding.geocodeAddress(
        {
          street,
          number: data.number,
          neighborhood: data.neighborhood,
          city,
          state,
          zipCode: data.zipCode,
        },
        { purpose: 'store' },
      );
      if (geo) {
        return { latitude: geo.latitude, longitude: geo.longitude };
      }
    } catch {
      // Mantém coords anteriores se geocode falhar.
    }

    if (previous) {
      return { latitude: previous.latitude, longitude: previous.longitude };
    }
    return { latitude: null, longitude: null };
  }

  private withLegacyAddress<T extends CreateStoreInput | UpdateStoreInput>(data: T) {
    const legacy =
      data.address?.trim() ||
      buildLegacyAddress({
        street: data.street,
        number: data.number,
        neighborhood: data.neighborhood,
        city: data.city,
        state: data.state,
      });

    return {
      ...data,
      address: legacy,
      zipCode: data.zipCode?.replace(/\D/g, '') || data.zipCode,
      cnpj: data.cnpj != null ? data.cnpj.replace(/\D/g, '') || null : data.cnpj,
    };
  }

  async create(user: AuthUser, input: unknown) {
    const parsed = createStoreSchema.parse(input);
    const coords = await this.resolveCoords(parsed);
    const data = this.withLegacyAddress({ ...parsed, ...coords });
    const legalName = await this.resolveLegalName(data.cnpj);

    const store = await this.prisma.store.create({
      data: {
        name: data.name,
        code: data.code,
        organizationId: user.organizationId,
        cnpj: data.cnpj ?? null,
        legalName: legalName ?? null,
        address: data.address,
        street: data.street,
        number: data.number,
        complement: data.complement,
        neighborhood: data.neighborhood,
        city: data.city,
        state: data.state,
        zipCode: data.zipCode,
        landmark: data.landmark,
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
        active: data.active,
      },
    });
    await this.paymentMethods.seedForStore(store.id, store.organizationId);
    await this.audit.log(user, 'CREATE', 'Store', store.id, data as Record<string, unknown>);
    return store;
  }

  async update(user: AuthUser, id: string, input: unknown) {
    const existing = await this.findOne(user, id);
    const parsed = updateStoreSchema.parse(input);
    const coords = await this.resolveCoords(parsed, {
      latitude: existing.latitude,
      longitude: existing.longitude,
    });
    const data = this.withLegacyAddress({ ...parsed, ...coords });
    const legalName =
      data.cnpj !== undefined
        ? await this.resolveLegalName(data.cnpj)
        : undefined;

    const store = await this.prisma.store.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.code !== undefined ? { code: data.code } : {}),
        ...(data.cnpj !== undefined ? { cnpj: data.cnpj } : {}),
        ...(legalName !== undefined ? { legalName } : {}),
        ...(data.address !== undefined ? { address: data.address } : {}),
        ...(data.street !== undefined ? { street: data.street } : {}),
        ...(data.number !== undefined ? { number: data.number } : {}),
        ...(data.complement !== undefined ? { complement: data.complement } : {}),
        ...(data.neighborhood !== undefined ? { neighborhood: data.neighborhood } : {}),
        ...(data.city !== undefined ? { city: data.city } : {}),
        ...(data.state !== undefined ? { state: data.state } : {}),
        ...(data.zipCode !== undefined ? { zipCode: data.zipCode } : {}),
        ...(data.landmark !== undefined ? { landmark: data.landmark } : {}),
        ...(data.latitude !== undefined ? { latitude: data.latitude } : {}),
        ...(data.longitude !== undefined ? { longitude: data.longitude } : {}),
        ...(data.active !== undefined ? { active: data.active } : {}),
      },
    });
    await this.audit.log(user, 'UPDATE', 'Store', id, data as Record<string, unknown>);
    return store;
  }

  async remove(user: AuthUser, id: string) {
    await this.findOne(user, id);

    await this.prisma.$transaction(
      async (tx) => {
        await tx.sale.deleteMany({ where: { storeId: id } });
        await tx.stockTransfer.deleteMany({
          where: { OR: [{ fromStoreId: id }, { toStoreId: id }] },
        });
        await tx.store.delete({ where: { id } });
      },
      { timeout: 120_000 },
    );

    await this.audit.log(user, 'DELETE', 'Store', id);
    return { ok: true };
  }
}
