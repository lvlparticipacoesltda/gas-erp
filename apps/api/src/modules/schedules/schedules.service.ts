import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ScheduleDayType, TimeClockPunchType, UserRole } from '@gas-erp/database';
import {
  AuthUser,
  TIME_CLOCK_GEOFENCE_METERS,
  TIME_CLOCK_PHOTO_MAX_BYTES,
  canManageSchedules,
  copyScheduleSchema,
  haversineDistanceMeters,
  scheduleMonthQuerySchema,
  timeClockHistoryQuerySchema,
  timeClockMeQuerySchema,
  timeClockPunchSchema,
  upsertScheduleDaySchema,
} from '@gas-erp/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { assertScreenPermission, assertStoreAccess } from '../../common/guards';

function monthBounds(year: number, month: number): { start: Date; end: Date } {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start, end };
}

function parseDateOnly(isoDate: string): Date {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

@Injectable()
export class SchedulesService {
  constructor(private prisma: PrismaService) {}

  private assertCanViewSchedules(user: AuthUser) {
    if (canManageSchedules(user.role)) return;
    // App do entregador lê a própria escala sem permissão de tela web.
    if (user.role === 'DELIVERER') return;
    if (user.role === 'ATTENDANT') {
      assertScreenPermission(user, 'store.schedules');
      return;
    }
    throw new ForbiddenException('Sem permissão para escalas');
  }

  private assertCanManage(user: AuthUser) {
    if (!canManageSchedules(user.role)) {
      throw new ForbiddenException('Apenas master ou gerente podem editar a escala');
    }
  }

  async getMonthGrid(user: AuthUser, query: unknown) {
    const params = scheduleMonthQuerySchema.parse(query);
    assertStoreAccess(user, params.storeId);
    this.assertCanViewSchedules(user);

    const store = await this.prisma.store.findFirst({
      where: { id: params.storeId, organizationId: user.organizationId },
      select: { id: true, name: true, latitude: true, longitude: true },
    });
    if (!store) throw new NotFoundException('Loja não encontrada');

    const collaborators = await this.listCollaborators(user, params.storeId, params.roleFilter);
    const { start, end } = monthBounds(params.year, params.month);

    const entries = await this.prisma.workScheduleEntry.findMany({
      where: {
        storeId: params.storeId,
        organizationId: user.organizationId,
        date: { gte: start, lt: end },
        userId: { in: collaborators.map((c) => c.id) },
      },
      orderBy: [{ userId: 'asc' }, { date: 'asc' }],
    });

    const byUser = new Map<string, typeof entries>();
    for (const entry of entries) {
      const list = byUser.get(entry.userId) ?? [];
      list.push(entry);
      byUser.set(entry.userId, list);
    }

    return {
      store,
      year: params.year,
      month: params.month,
      daysInMonth: daysInMonth(params.year, params.month),
      collaborators: collaborators.map((c) => ({
        ...c,
        entries: (byUser.get(c.id) ?? []).map((e) => ({
          id: e.id,
          date: formatDateOnly(e.date),
          dayType: e.dayType,
          startTime: e.startTime,
          endTime: e.endTime,
          breakStart: e.breakStart,
          breakEnd: e.breakEnd,
          notes: e.notes,
        })),
      })),
    };
  }

  /** Lista colaboradores da loja conforme papel e ACL do visualizador. */
  private async listCollaborators(
    user: AuthUser,
    storeId: string,
    roleFilter: 'deliverers' | 'attendants' | 'all',
  ) {
    const wantDeliverers = roleFilter === 'deliverers' || roleFilter === 'all';
    const wantAttendants = roleFilter === 'attendants' || roleFilter === 'all';

    // Atendente: só entregadores da unidade + a própria pessoa.
    if (user.role === 'ATTENDANT') {
      const deliverers = wantDeliverers
        ? await this.prisma.user.findMany({
            where: {
              organizationId: user.organizationId,
              role: UserRole.DELIVERER,
              active: true,
              deliverer: { stores: { some: { storeId } } },
            },
            select: { id: true, name: true, role: true, email: true },
            orderBy: { name: 'asc' },
          })
        : [];
      const self = await this.prisma.user.findUnique({
        where: { id: user.id },
        select: { id: true, name: true, role: true, email: true },
      });
      const rows = [...deliverers];
      if (self && wantAttendants && !rows.some((r) => r.id === self.id)) {
        rows.push(self);
      }
      return rows.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    }

    // Entregador (app): só a própria escala.
    if (user.role === 'DELIVERER') {
      const self = await this.prisma.user.findUnique({
        where: { id: user.id },
        select: { id: true, name: true, role: true, email: true },
      });
      return self ? [self] : [];
    }

    const rows: Array<{ id: string; name: string; role: UserRole; email: string }> = [];

    if (wantDeliverers) {
      const deliverers = await this.prisma.user.findMany({
        where: {
          organizationId: user.organizationId,
          role: UserRole.DELIVERER,
          active: true,
          deliverer: { stores: { some: { storeId } } },
        },
        select: { id: true, name: true, role: true, email: true },
        orderBy: { name: 'asc' },
      });
      rows.push(...deliverers);
    }

    if (wantAttendants) {
      const attendants = await this.prisma.user.findMany({
        where: {
          organizationId: user.organizationId,
          role: { in: [UserRole.ATTENDANT, UserRole.STORE_MANAGER] },
          active: true,
          userStores: { some: { storeId } },
        },
        select: { id: true, name: true, role: true, email: true },
        orderBy: { name: 'asc' },
      });
      rows.push(...attendants);
    }

    return rows;
  }

  async upsertDay(user: AuthUser, input: unknown) {
    this.assertCanManage(user);
    const data = upsertScheduleDaySchema.parse(input);
    assertStoreAccess(user, data.storeId);

    const store = await this.prisma.store.findFirst({
      where: { id: data.storeId, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!store) throw new NotFoundException('Loja não encontrada');

    await this.assertUserBelongsToStore(data.userId, data.storeId, user.organizationId);

    const date = parseDateOnly(data.date);
    const dayType = data.dayType as ScheduleDayType;
    const isOff = dayType === ScheduleDayType.DAY_OFF;

    return this.prisma.workScheduleEntry.upsert({
      where: {
        storeId_userId_date: {
          storeId: data.storeId,
          userId: data.userId,
          date,
        },
      },
      create: {
        organizationId: user.organizationId,
        storeId: data.storeId,
        userId: data.userId,
        date,
        dayType,
        startTime: isOff ? null : data.startTime ?? null,
        endTime: isOff ? null : data.endTime ?? null,
        breakStart: isOff ? null : data.breakStart ?? null,
        breakEnd: isOff ? null : data.breakEnd ?? null,
        notes: data.notes ?? null,
        createdById: user.id,
        updatedById: user.id,
      },
      update: {
        dayType,
        startTime: isOff ? null : data.startTime ?? null,
        endTime: isOff ? null : data.endTime ?? null,
        breakStart: isOff ? null : data.breakStart ?? null,
        breakEnd: isOff ? null : data.breakEnd ?? null,
        notes: data.notes ?? null,
        updatedById: user.id,
      },
    });
  }

  async deleteDay(user: AuthUser, id: string) {
    this.assertCanManage(user);
    const entry = await this.prisma.workScheduleEntry.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!entry) throw new NotFoundException('Dia da escala não encontrado');
    assertStoreAccess(user, entry.storeId);
    await this.prisma.workScheduleEntry.delete({ where: { id } });
    return { ok: true };
  }

  async copyMonth(user: AuthUser, input: unknown) {
    this.assertCanManage(user);
    const data = copyScheduleSchema.parse(input);
    assertStoreAccess(user, data.storeId);

    const source = monthBounds(data.sourceYear, data.sourceMonth);
    const targetDays = daysInMonth(data.targetYear, data.targetMonth);

    const where: Prisma.WorkScheduleEntryWhereInput = {
      storeId: data.storeId,
      organizationId: user.organizationId,
      date: { gte: source.start, lt: source.end },
      ...(data.sourceUserId ? { userId: data.sourceUserId } : {}),
    };

    const sourceEntries = await this.prisma.workScheduleEntry.findMany({ where });
    if (sourceEntries.length === 0) {
      return { copied: 0 };
    }

    const targetUserId = data.targetUserId ?? data.sourceUserId;
    if (data.targetUserId && data.sourceUserId) {
      await this.assertUserBelongsToStore(data.targetUserId, data.storeId, user.organizationId);
    }

    let copied = 0;
    for (const entry of sourceEntries) {
      const day = entry.date.getUTCDate();
      if (day > targetDays) continue;
      const targetDate = new Date(Date.UTC(data.targetYear, data.targetMonth - 1, day));
      const userId = targetUserId && data.sourceUserId === entry.userId
        ? (data.targetUserId ?? entry.userId)
        : entry.userId;

      await this.prisma.workScheduleEntry.upsert({
        where: {
          storeId_userId_date: {
            storeId: data.storeId,
            userId,
            date: targetDate,
          },
        },
        create: {
          organizationId: user.organizationId,
          storeId: data.storeId,
          userId,
          date: targetDate,
          dayType: entry.dayType,
          startTime: entry.startTime,
          endTime: entry.endTime,
          breakStart: entry.breakStart,
          breakEnd: entry.breakEnd,
          notes: entry.notes,
          createdById: user.id,
          updatedById: user.id,
        },
        update: {
          dayType: entry.dayType,
          startTime: entry.startTime,
          endTime: entry.endTime,
          breakStart: entry.breakStart,
          breakEnd: entry.breakEnd,
          notes: entry.notes,
          updatedById: user.id,
        },
      });
      copied += 1;
    }

    return { copied };
  }

  private async assertUserBelongsToStore(
    userId: string,
    storeId: string,
    organizationId: string,
  ) {
    const target = await this.prisma.user.findFirst({
      where: { id: userId, organizationId, active: true },
      include: {
        userStores: { where: { storeId }, select: { id: true } },
        deliverer: { include: { stores: { where: { storeId }, select: { id: true } } } },
      },
    });
    if (!target) throw new BadRequestException('Colaborador não encontrado');

    const ok =
      target.userStores.length > 0
      || (target.deliverer?.stores.length ?? 0) > 0
      || target.role === UserRole.ORG_MASTER
      || target.role === UserRole.PLATFORM_ADMIN;
    if (!ok) {
      throw new BadRequestException('Colaborador não pertence a esta unidade');
    }
  }

  // ─── Time clock ───────────────────────────────────────────────────────────

  async getMyPunches(user: AuthUser, query: unknown) {
    const params = timeClockMeQuerySchema.parse(query);
    assertStoreAccess(user, params.storeId);

    const dateStr = params.date ?? new Date().toISOString().slice(0, 10);
    const dayStart = parseDateOnly(dateStr);
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    const punches = await this.prisma.timeClockPunch.findMany({
      where: {
        organizationId: user.organizationId,
        storeId: params.storeId,
        userId: user.id,
        punchedAt: { gte: dayStart, lt: dayEnd },
      },
      orderBy: { punchedAt: 'asc' },
      select: {
        id: true,
        type: true,
        punchedAt: true,
        latitude: true,
        longitude: true,
        distanceMeters: true,
        source: true,
        photoBytes: false,
      },
    });

    const last = punches[punches.length - 1] ?? null;
    const nextType: TimeClockPunchType =
      !last || last.type === TimeClockPunchType.CLOCK_OUT
        ? TimeClockPunchType.CLOCK_IN
        : TimeClockPunchType.CLOCK_OUT;

    const store = await this.prisma.store.findFirst({
      where: { id: params.storeId, organizationId: user.organizationId },
      select: { id: true, name: true, latitude: true, longitude: true },
    });

    const schedule = await this.prisma.workScheduleEntry.findUnique({
      where: {
        storeId_userId_date: {
          storeId: params.storeId,
          userId: user.id,
          date: dayStart,
        },
      },
    });

    return {
      date: dateStr,
      store,
      nextType,
      punches,
      schedule: schedule
        ? {
            id: schedule.id,
            dayType: schedule.dayType,
            startTime: schedule.startTime,
            endTime: schedule.endTime,
            breakStart: schedule.breakStart,
            breakEnd: schedule.breakEnd,
            notes: schedule.notes,
          }
        : null,
      geofenceMeters: TIME_CLOCK_GEOFENCE_METERS,
    };
  }

  async punch(user: AuthUser, input: unknown) {
    const data = timeClockPunchSchema.parse(input);
    assertStoreAccess(user, data.storeId);

    if (data.source === 'WEB') {
      if (user.role === 'DELIVERER') {
        throw new ForbiddenException('Entregadores devem bater ponto pelo aplicativo');
      }
      if (
        user.role !== 'ATTENDANT'
        && user.role !== 'STORE_MANAGER'
        && user.role !== 'ORG_MASTER'
        && user.role !== 'PLATFORM_ADMIN'
      ) {
        throw new ForbiddenException('Sem permissão para bater ponto nesta unidade');
      }
    } else {
      if (user.role !== 'DELIVERER') {
        throw new ForbiddenException('Ponto mobile é exclusivo do entregador');
      }
    }

    const store = await this.prisma.store.findFirst({
      where: { id: data.storeId, organizationId: user.organizationId },
      select: { id: true, latitude: true, longitude: true },
    });
    if (!store) throw new NotFoundException('Loja não encontrada');

    // Valida alternância IN/OUT no dia (timezone UTC date — suficiente para BR business day).
    const today = new Date().toISOString().slice(0, 10);
    const dayStart = parseDateOnly(today);
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    const last = await this.prisma.timeClockPunch.findFirst({
      where: {
        storeId: data.storeId,
        userId: user.id,
        punchedAt: { gte: dayStart, lt: dayEnd },
      },
      orderBy: { punchedAt: 'desc' },
    });

    const expected: TimeClockPunchType =
      !last || last.type === TimeClockPunchType.CLOCK_OUT
        ? TimeClockPunchType.CLOCK_IN
        : TimeClockPunchType.CLOCK_OUT;

    if (data.type !== expected) {
      throw new BadRequestException(
        expected === TimeClockPunchType.CLOCK_IN
          ? 'Próximo ponto deve ser Entrada.'
          : 'Próximo ponto deve ser Saída.',
      );
    }

    let distanceMeters: number | null = null;
    let photoBytes: Uint8Array | null = null;

    if (data.source === 'MOBILE') {
      if (store.latitude == null || store.longitude == null) {
        throw new BadRequestException(
          'A unidade não tem coordenadas cadastradas. Atualize o endereço da loja no painel master.',
        );
      }
      if (data.latitude == null || data.longitude == null) {
        throw new BadRequestException('Localização GPS é obrigatória para bater ponto no app.');
      }
      if (!data.photoBase64) {
        throw new BadRequestException('Foto é obrigatória para bater ponto no app.');
      }

      distanceMeters = haversineDistanceMeters(
        data.latitude,
        data.longitude,
        store.latitude,
        store.longitude,
      );
      if (distanceMeters > TIME_CLOCK_GEOFENCE_METERS) {
        throw new BadRequestException(
          `Você está a ~${Math.round(distanceMeters)} m da unidade. Aproxime-se (máx. ${TIME_CLOCK_GEOFENCE_METERS} m) para bater o ponto.`,
        );
      }

      const raw = data.photoBase64.replace(/^data:image\/\w+;base64,/, '');
      const buf = Buffer.from(raw, 'base64');
      if (buf.length === 0) {
        throw new BadRequestException('Foto inválida.');
      }
      if (buf.length > TIME_CLOCK_PHOTO_MAX_BYTES) {
        throw new BadRequestException('Foto muito grande (máx. 400 KB).');
      }
      photoBytes = new Uint8Array(buf);
    }

    const punch = await this.prisma.timeClockPunch.create({
      data: {
        organizationId: user.organizationId,
        storeId: data.storeId,
        userId: user.id,
        type: data.type as TimeClockPunchType,
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
        accuracy: data.accuracy ?? null,
        distanceMeters,
        photoBytes: photoBytes ? Buffer.from(photoBytes) : null,
        source: data.source,
      },
      select: {
        id: true,
        type: true,
        punchedAt: true,
        latitude: true,
        longitude: true,
        distanceMeters: true,
        source: true,
      },
    });

    return punch;
  }

  async listPunches(user: AuthUser, query: unknown) {
    this.assertCanManage(user);
    const params = timeClockHistoryQuerySchema.parse(query);
    assertStoreAccess(user, params.storeId);

    const from = parseDateOnly(params.from);
    const to = parseDateOnly(params.to);
    to.setUTCDate(to.getUTCDate() + 1);

    return this.prisma.timeClockPunch.findMany({
      where: {
        organizationId: user.organizationId,
        storeId: params.storeId,
        punchedAt: { gte: from, lt: to },
        ...(params.userId ? { userId: params.userId } : {}),
      },
      orderBy: { punchedAt: 'desc' },
      select: {
        id: true,
        type: true,
        punchedAt: true,
        latitude: true,
        longitude: true,
        distanceMeters: true,
        source: true,
        user: { select: { id: true, name: true, role: true } },
      },
      take: 500,
    });
  }

  /** Escala do próprio entregador no app (qualquer loja vinculada). */
  async getMyMonth(user: AuthUser, query: unknown) {
    if (user.role !== 'DELIVERER' && !canManageSchedules(user.role) && user.role !== 'ATTENDANT') {
      throw new ForbiddenException('Sem permissão');
    }

    const year = Number((query as { year?: string }).year);
    const month = Number((query as { month?: string }).month);
    if (!year || !month || month < 1 || month > 12) {
      throw new BadRequestException('Informe year e month');
    }

    let storeId = (query as { storeId?: string }).storeId;
    if (!storeId) {
      if (user.role === 'DELIVERER') {
        const deliverer = await this.prisma.deliverer.findUnique({
          where: { userId: user.id },
          include: { stores: { take: 1, orderBy: { createdAt: 'asc' } } },
        });
        storeId = deliverer?.availableStoreId ?? deliverer?.stores[0]?.storeId;
      } else {
        storeId = user.storeIds[0];
      }
    }
    if (!storeId) throw new BadRequestException('Nenhuma unidade vinculada');

    return this.getMonthGrid(user, {
      storeId,
      year,
      month,
      roleFilter: user.role === 'DELIVERER' ? 'deliverers' : 'all',
    });
  }
}
