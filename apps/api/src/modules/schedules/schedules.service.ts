import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ScheduleDayType, TimeClockPunchType, UserRole } from '@gas-erp/database';
import {
  AuthUser,
  ROLE_LABELS,
  TIME_CLOCK_DAY_STATUS_LABELS,
  TIME_CLOCK_GEOFENCE_METERS,
  TIME_CLOCK_PHOTO_MAX_BYTES,
  canManageSchedules,
  canViewTimeClockLog,
  copyScheduleSchema,
  getBusinessDayBounds,
  haversineDistanceMeters,
  scheduleMonthQuerySchema,
  timeClockCardsQuerySchema,
  timeClockHistoryQuerySchema,
  timeClockMeQuerySchema,
  timeClockPunchSchema,
  timeClockReportQuerySchema,
  upsertScheduleDaySchema,
  upsertTimeClockDaySchema,
  zonedTimeToUtc,
  type TimeClockDayStatus,
} from '@gas-erp/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { assertScreenPermission, assertStoreAccess } from '../../common/guards';
import { CnpjLookupService } from '../../common/cnpj/cnpj-lookup.service';

const BR_TZ = 'America/Sao_Paulo';
/** Tolerância (minutos) após o horário de entrada da escala antes de marcar atraso. */
const LATE_GRACE_MINUTES = 10;

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

function brazilDateKey(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: BR_TZ });
}

function brazilTimeHm(date: Date): string {
  return date.toLocaleTimeString('pt-BR', {
    timeZone: BR_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function parseHmToMinutes(hm: string): number | null {
  const match = hm.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function resolveDayStatus(input: {
  dayType: ScheduleDayType | null;
  startTime: string | null;
  clockIn: Date | null;
  clockOut: Date | null;
}): TimeClockDayStatus {
  const { dayType, startTime, clockIn, clockOut } = input;

  if (!dayType || dayType === ScheduleDayType.DAY_OFF) {
    if (clockIn || clockOut) return 'OFF_SCHEDULE';
    return 'DAY_OFF';
  }

  if (!clockIn && !clockOut) return 'ABSENT';
  if (!clockIn || !clockOut) return 'INCOMPLETE';

  if (startTime) {
    const expected = parseHmToMinutes(startTime.slice(0, 5));
    const actual = parseHmToMinutes(brazilTimeHm(clockIn));
    if (expected != null && actual != null && actual > expected + LATE_GRACE_MINUTES) {
      return 'LATE';
    }
  }
  return 'OK';
}

const WEEKDAY_LABELS_MON = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'] as const;

function weekdayMon0FromDateOnly(dateStr: string): number {
  const js = parseDateOnly(dateStr).getUTCDay(); // 0=dom
  return js === 0 ? 6 : js - 1;
}

function sliceHm(value?: string | null): string | null {
  return value ? value.slice(0, 5) : null;
}

function formatPrevistoFromSchedule(entry: {
  dayType: ScheduleDayType;
  startTime: string | null;
  endTime: string | null;
  breakStart: string | null;
  breakEnd: string | null;
} | null): string {
  if (!entry || entry.dayType === ScheduleDayType.DAY_OFF) return 'Folga';
  const start = sliceHm(entry.startTime);
  const end = sliceHm(entry.endTime);
  const breakStart = sliceHm(entry.breakStart);
  const breakEnd = sliceHm(entry.breakEnd);
  if (start && end && breakStart && breakEnd) {
    return `${start}-${breakStart} ${breakEnd}-${end}`;
  }
  if (start && end) return `${start}-${end}`;
  return '—';
}

function scheduleSlotsFromEntry(entry: {
  dayType: ScheduleDayType;
  startTime: string | null;
  endTime: string | null;
  breakStart: string | null;
  breakEnd: string | null;
} | null): { ent1: string | null; sai1: string | null; ent2: string | null; sai2: string | null } {
  if (!entry || entry.dayType === ScheduleDayType.DAY_OFF) {
    return { ent1: null, sai1: null, ent2: null, sai2: null };
  }
  const start = sliceHm(entry.startTime);
  const end = sliceHm(entry.endTime);
  const breakStart = sliceHm(entry.breakStart);
  const breakEnd = sliceHm(entry.breakEnd);
  if (start && end && breakStart && breakEnd) {
    return { ent1: start, sai1: breakStart, ent2: breakEnd, sai2: end };
  }
  return { ent1: start, sai1: null, ent2: null, sai2: end };
}

function formatMinutesComma(totalMinutes: number): string {
  const mins = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')},${String(m).padStart(2, '0')}`;
}

function formatPunchHm(at: Date | null, source: string | null): string | null {
  if (!at) return null;
  const hm = brazilTimeHm(at);
  return source === 'MOBILE' ? `${hm}(M)` : hm;
}

type PunchSlotBucket = {
  ent1: Date | null;
  sai1: Date | null;
  ent2: Date | null;
  sai2: Date | null;
  sourceEnt1: string | null;
  sourceSai1: string | null;
  sourceEnt2: string | null;
  sourceSai2: string | null;
};

function assignDayPunchSlots(
  punches: Array<{ type: TimeClockPunchType; punchedAt: Date; source: string }>,
): PunchSlotBucket {
  const empty: PunchSlotBucket = {
    ent1: null,
    sai1: null,
    ent2: null,
    sai2: null,
    sourceEnt1: null,
    sourceSai1: null,
    sourceEnt2: null,
    sourceSai2: null,
  };
  if (punches.length === 0) return empty;

  const ordered = [...punches].sort((a, b) => a.punchedAt.getTime() - b.punchedAt.getTime());
  const ins = ordered.filter((p) => p.type === TimeClockPunchType.CLOCK_IN);
  const outs = ordered.filter((p) => p.type === TimeClockPunchType.CLOCK_OUT);

  return {
    ent1: ins[0]?.punchedAt ?? null,
    sai1: outs[0]?.punchedAt ?? null,
    ent2: ins[1]?.punchedAt ?? null,
    sai2: outs[1]?.punchedAt ?? null,
    sourceEnt1: ins[0]?.source ?? null,
    sourceSai1: outs[0]?.source ?? null,
    sourceEnt2: ins[1]?.source ?? null,
    sourceSai2: outs[1]?.source ?? null,
  };
}

function workedMinutesFromSlots(slots: PunchSlotBucket): number {
  const pairMinutes = (start: Date | null, end: Date | null) => {
    if (!start || !end) return 0;
    return Math.max(0, (end.getTime() - start.getTime()) / 60000);
  };
  return pairMinutes(slots.ent1, slots.sai1) + pairMinutes(slots.ent2, slots.sai2);
}

function parseHmParts(hm: string): { hour: number; minute: number } {
  const [hour, minute] = hm.slice(0, 5).split(':').map(Number);
  return { hour, minute };
}

function mostCommon<T>(values: T[]): T | null {
  if (values.length === 0) return null;
  const counts = new Map<string, { count: number; value: T }>();
  for (const value of values) {
    const key = JSON.stringify(value);
    const prev = counts.get(key);
    if (prev) prev.count += 1;
    else counts.set(key, { count: 1, value });
  }
  let best: { count: number; value: T } | null = null;
  for (const item of counts.values()) {
    if (!best || item.count > best.count) best = item;
  }
  return best?.value ?? null;
}

type CollabRow = {
  id: string;
  name: string;
  role: UserRole;
  email: string;
  cpf: string | null;
  pis: string | null;
  admittedAt: Date | null;
  jobTitle: string | null;
};

const collaboratorSelect = {
  id: true,
  name: true,
  role: true,
  email: true,
  cpf: true,
  pis: true,
  admittedAt: true,
  jobTitle: true,
} as const;

@Injectable()
export class SchedulesService {
  constructor(
    private prisma: PrismaService,
    private cnpjLookup: CnpjLookupService,
  ) {}

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

  private assertCanViewTimeClock(user: AuthUser) {
    if (canViewTimeClockLog(user.role, user.permissions)) return;
    throw new ForbiddenException('Sem permissão para consultar o cartão de ponto');
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
  ): Promise<CollabRow[]> {
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
            select: collaboratorSelect,
            orderBy: { name: 'asc' },
          })
        : [];
      const self = await this.prisma.user.findUnique({
        where: { id: user.id },
        select: collaboratorSelect,
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
        select: collaboratorSelect,
      });
      return self ? [self] : [];
    }

    const rows: CollabRow[] = [];

    if (wantDeliverers) {
      const deliverers = await this.prisma.user.findMany({
        where: {
          organizationId: user.organizationId,
          role: UserRole.DELIVERER,
          active: true,
          deliverer: { stores: { some: { storeId } } },
        },
        select: collaboratorSelect,
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
        select: collaboratorSelect,
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

  /**
   * Log mensal: compara escala planejada com batidas (entrada/saída) por colaborador/dia.
   */
  async getTimeClockReport(user: AuthUser, query: unknown) {
    this.assertCanManage(user);
    const params = timeClockReportQuerySchema.parse(query);
    assertStoreAccess(user, params.storeId);

    const store = await this.prisma.store.findFirst({
      where: { id: params.storeId, organizationId: user.organizationId },
      select: { id: true, name: true },
    });
    if (!store) throw new NotFoundException('Loja não encontrada');

    const collaborators = await this.listCollaborators(user, params.storeId, params.roleFilter);
    const filtered = params.userId
      ? collaborators.filter((c) => c.id === params.userId)
      : collaborators;
    const userIds = filtered.map((c) => c.id);
    if (userIds.length === 0) {
      return { store, year: params.year, month: params.month, rows: [] };
    }

    const { start, end } = monthBounds(params.year, params.month);
    // Margem de 1 dia nas pontas para punches perto da meia-noite no fuso BR.
    const punchFrom = new Date(start);
    punchFrom.setUTCDate(punchFrom.getUTCDate() - 1);
    const punchTo = new Date(end);
    punchTo.setUTCDate(punchTo.getUTCDate() + 1);

    const [entries, punches] = await Promise.all([
      this.prisma.workScheduleEntry.findMany({
        where: {
          organizationId: user.organizationId,
          storeId: params.storeId,
          userId: { in: userIds },
          date: { gte: start, lt: end },
        },
      }),
      this.prisma.timeClockPunch.findMany({
        where: {
          organizationId: user.organizationId,
          storeId: params.storeId,
          userId: { in: userIds },
          punchedAt: { gte: punchFrom, lt: punchTo },
        },
        orderBy: { punchedAt: 'asc' },
        select: {
          userId: true,
          type: true,
          punchedAt: true,
          source: true,
        },
      }),
    ]);

    const scheduleByKey = new Map<string, (typeof entries)[number]>();
    for (const entry of entries) {
      scheduleByKey.set(`${entry.userId}|${formatDateOnly(entry.date)}`, entry);
    }

    type DayPunches = {
      clockIn: Date | null;
      clockOut: Date | null;
      sourceIn: string | null;
      sourceOut: string | null;
    };
    const punchesByKey = new Map<string, DayPunches>();
    for (const punch of punches) {
      const dateKey = brazilDateKey(punch.punchedAt);
      // Ignora batidas fora do mês filtrado (após conversão BR).
      const [y, m] = dateKey.split('-').map(Number);
      if (y !== params.year || m !== params.month) continue;

      const key = `${punch.userId}|${dateKey}`;
      const bucket = punchesByKey.get(key) ?? {
        clockIn: null,
        clockOut: null,
        sourceIn: null,
        sourceOut: null,
      };
      if (punch.type === TimeClockPunchType.CLOCK_IN && !bucket.clockIn) {
        bucket.clockIn = punch.punchedAt;
        bucket.sourceIn = punch.source;
      }
      if (punch.type === TimeClockPunchType.CLOCK_OUT) {
        bucket.clockOut = punch.punchedAt;
        bucket.sourceOut = punch.source;
      }
      punchesByKey.set(key, bucket);
    }

    const collabById = new Map(filtered.map((c) => [c.id, c]));
    const keys = new Set<string>([...scheduleByKey.keys(), ...punchesByKey.keys()]);
    const rows = [...keys]
      .map((key) => {
        const [userId, date] = key.split('|');
        const collab = collabById.get(userId);
        if (!collab) return null;
        const schedule = scheduleByKey.get(key) ?? null;
        const punch = punchesByKey.get(key) ?? {
          clockIn: null,
          clockOut: null,
          sourceIn: null,
          sourceOut: null,
        };
        const status = resolveDayStatus({
          dayType: schedule?.dayType ?? null,
          startTime: schedule?.startTime ?? null,
          clockIn: punch.clockIn,
          clockOut: punch.clockOut,
        });
        return {
          userId,
          userName: collab.name,
          userRole: collab.role,
          date,
          dayType: schedule?.dayType ?? null,
          scheduledStart: schedule?.startTime?.slice(0, 5) ?? null,
          scheduledEnd: schedule?.endTime?.slice(0, 5) ?? null,
          clockIn: punch.clockIn ? brazilTimeHm(punch.clockIn) : null,
          clockOut: punch.clockOut ? brazilTimeHm(punch.clockOut) : null,
          clockInAt: punch.clockIn?.toISOString() ?? null,
          clockOutAt: punch.clockOut?.toISOString() ?? null,
          sourceIn: punch.sourceIn,
          sourceOut: punch.sourceOut,
          status,
          statusLabel: TIME_CLOCK_DAY_STATUS_LABELS[status],
        };
      })
      .filter((row): row is NonNullable<typeof row> => row != null)
      .sort((a, b) => {
        const byDate = b.date.localeCompare(a.date);
        if (byDate !== 0) return byDate;
        return a.userName.localeCompare(b.userName, 'pt-BR');
      });

    return {
      store,
      year: params.year,
      month: params.month,
      rows,
    };
  }

  /**
   * Cartões de ponto no formato do fechamento (4 batidas, previsto, totais simples).
   */
  async getTimeClockCards(user: AuthUser, query: unknown) {
    this.assertCanViewTimeClock(user);
    const params = timeClockCardsQuerySchema.parse(query);
    assertStoreAccess(user, params.storeId);

    const store = await this.prisma.store.findFirst({
      where: { id: params.storeId, organizationId: user.organizationId },
      select: {
        id: true,
        name: true,
        cnpj: true,
        legalName: true,
        organization: { select: { name: true } },
      },
    });
    if (!store) throw new NotFoundException('Loja não encontrada');

    let companyName = store.legalName?.trim() || null;
    if (!companyName) {
      const fromCnpj = await this.cnpjLookup.lookupCompanyName(store.cnpj);
      if (fromCnpj) {
        companyName = fromCnpj;
        // Persiste para não depender da API externa nas próximas cargas.
        void this.prisma.store
          .update({ where: { id: store.id }, data: { legalName: fromCnpj } })
          .catch(() => undefined);
      }
    }
    companyName = companyName ?? store.organization.name;

    const collaborators = await this.listCollaborators(user, params.storeId, params.roleFilter);
    const filtered = params.userId
      ? collaborators.filter((c) => c.id === params.userId)
      : collaborators;
    const userIds = filtered.map((c) => c.id);

    if (userIds.length === 0) {
      return {
        store: {
          id: store.id,
          name: store.name,
          cnpj: store.cnpj,
          organizationName: companyName,
        },
        year: params.year,
        month: params.month,
        cards: [],
      };
    }

    const { start, end } = monthBounds(params.year, params.month);
    const punchFrom = new Date(start);
    punchFrom.setUTCDate(punchFrom.getUTCDate() - 1);
    const punchTo = new Date(end);
    punchTo.setUTCDate(punchTo.getUTCDate() + 1);
    const dim = daysInMonth(params.year, params.month);

    const [entries, punches] = await Promise.all([
      this.prisma.workScheduleEntry.findMany({
        where: {
          organizationId: user.organizationId,
          storeId: params.storeId,
          userId: { in: userIds },
          date: { gte: start, lt: end },
        },
      }),
      this.prisma.timeClockPunch.findMany({
        where: {
          organizationId: user.organizationId,
          storeId: params.storeId,
          userId: { in: userIds },
          punchedAt: { gte: punchFrom, lt: punchTo },
        },
        orderBy: { punchedAt: 'asc' },
        select: {
          userId: true,
          type: true,
          punchedAt: true,
          source: true,
        },
      }),
    ]);

    const scheduleByKey = new Map<string, (typeof entries)[number]>();
    const schedulesByUser = new Map<string, typeof entries>();
    for (const entry of entries) {
      scheduleByKey.set(`${entry.userId}|${formatDateOnly(entry.date)}`, entry);
      const list = schedulesByUser.get(entry.userId) ?? [];
      list.push(entry);
      schedulesByUser.set(entry.userId, list);
    }

    const punchesByKey = new Map<
      string,
      Array<{ type: TimeClockPunchType; punchedAt: Date; source: string }>
    >();
    for (const punch of punches) {
      const dateKey = brazilDateKey(punch.punchedAt);
      const [y, m] = dateKey.split('-').map(Number);
      if (y !== params.year || m !== params.month) continue;
      const key = `${punch.userId}|${dateKey}`;
      const list = punchesByKey.get(key) ?? [];
      list.push({ type: punch.type, punchedAt: punch.punchedAt, source: punch.source });
      punchesByKey.set(key, list);
    }

    const cards = filtered
      .map((collab) => {
        const userEntries = schedulesByUser.get(collab.id) ?? [];
        const horarioTrabalho = WEEKDAY_LABELS_MON.map((label, mon0) => {
          const dayEntries = userEntries.filter(
            (e) => weekdayMon0FromDateOnly(formatDateOnly(e.date)) === mon0,
          );
          const dayType = mostCommon(dayEntries.map((e) => e.dayType));
          if (!dayType) {
            return {
              weekday: label,
              previsto: '—',
              ent1: null as string | null,
              sai1: null as string | null,
              ent2: null as string | null,
              sai2: null as string | null,
            };
          }
          const typed = dayEntries.filter((e) => e.dayType === dayType);
          const pattern = mostCommon(
            typed.map((e) => ({
              dayType: e.dayType,
              startTime: e.startTime,
              endTime: e.endTime,
              breakStart: e.breakStart,
              breakEnd: e.breakEnd,
            })),
          );
          const slots = scheduleSlotsFromEntry(pattern);
          return {
            weekday: label,
            previsto: formatPrevistoFromSchedule(pattern),
            ...slots,
          };
        });

        let totalNormaisMinutes = 0;
        let faltas = 0;
        let atrasos = 0;

        const days = Array.from({ length: dim }, (_, i) => {
          const day = i + 1;
          const date = `${params.year}-${String(params.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const key = `${collab.id}|${date}`;
          const schedule = scheduleByKey.get(key) ?? null;
          const slots = assignDayPunchSlots(punchesByKey.get(key) ?? []);
          const worked = workedMinutesFromSlots(slots);
          totalNormaisMinutes += worked;

          const clockIn = slots.ent1;
          const clockOut = slots.sai2 ?? slots.sai1;
          const status = resolveDayStatus({
            dayType: schedule?.dayType ?? null,
            startTime: schedule?.startTime ?? null,
            clockIn,
            clockOut,
          });
          if (status === 'ABSENT') faltas += 1;
          if (status === 'LATE') atrasos += 1;

          return {
            date,
            day,
            weekday: WEEKDAY_LABELS_MON[weekdayMon0FromDateOnly(date)],
            dayType: schedule?.dayType ?? null,
            previsto: formatPrevistoFromSchedule(schedule),
            ent1: formatPunchHm(slots.ent1, slots.sourceEnt1),
            sai1: formatPunchHm(slots.sai1, slots.sourceSai1),
            ent2: formatPunchHm(slots.ent2, slots.sourceEnt2),
            sai2: formatPunchHm(slots.sai2, slots.sourceSai2),
            totalNormais: formatMinutesComma(worked),
            totalNormaisMinutes: Math.round(worked),
            status,
            statusLabel: TIME_CLOCK_DAY_STATUS_LABELS[status],
          };
        });

        return {
          header: {
            companyName,
            cnpj: store.cnpj,
            storeName: store.name,
            userId: collab.id,
            userName: collab.name,
            cpf: collab.cpf,
            pis: collab.pis,
            admittedAt: collab.admittedAt ? formatDateOnly(collab.admittedAt) : null,
            jobTitle: collab.jobTitle,
            role: collab.role,
            roleLabel: ROLE_LABELS[collab.role] ?? collab.role,
          },
          horarioTrabalho,
          days,
          totals: {
            totalNormais: formatMinutesComma(totalNormaisMinutes),
            totalNormaisMinutes: Math.round(totalNormaisMinutes),
            faltas,
            atrasos,
          },
        };
      })
      .sort((a, b) => a.header.userName.localeCompare(b.header.userName, 'pt-BR'));

    return {
      store: {
        id: store.id,
        name: store.name,
        cnpj: store.cnpj,
        organizationName: companyName,
      },
      year: params.year,
      month: params.month,
      cards,
    };
  }

  /**
   * Substitui as batidas do dia (ENT.1/SAÍ.1/ENT.2/SAÍ.2) — master/gerente.
   */
  async upsertTimeClockDay(user: AuthUser, input: unknown) {
    this.assertCanManage(user);
    const data = upsertTimeClockDaySchema.parse(input);
    assertStoreAccess(user, data.storeId);

    const collaborators = await this.listCollaborators(user, data.storeId, 'all');
    if (!collaborators.some((c) => c.id === data.userId)) {
      throw new NotFoundException('Colaborador não encontrado nesta unidade');
    }

    const slots: Array<{ key: 'ent1' | 'sai1' | 'ent2' | 'sai2'; type: TimeClockPunchType; hm: string | null }> = [
      { key: 'ent1', type: TimeClockPunchType.CLOCK_IN, hm: data.ent1 ?? null },
      { key: 'sai1', type: TimeClockPunchType.CLOCK_OUT, hm: data.sai1 ?? null },
      { key: 'ent2', type: TimeClockPunchType.CLOCK_IN, hm: data.ent2 ?? null },
      { key: 'sai2', type: TimeClockPunchType.CLOCK_OUT, hm: data.sai2 ?? null },
    ];

    let seenEmpty = false;
    for (const slot of slots) {
      if (slot.hm == null) {
        seenEmpty = true;
        continue;
      }
      if (seenEmpty) {
        throw new BadRequestException(
          'Preencha os horários em ordem (ENT.1 → SAÍ.1 → ENT.2 → SAÍ.2), sem buracos.',
        );
      }
    }

    const filled = slots.filter((s): s is typeof s & { hm: string } => s.hm != null);
    let prevMinutes = -1;
    for (const slot of filled) {
      const mins = parseHmToMinutes(slot.hm);
      if (mins == null) {
        throw new BadRequestException(`Horário inválido em ${slot.key.toUpperCase()}`);
      }
      if (mins <= prevMinutes) {
        throw new BadRequestException('Os horários devem estar em ordem crescente no dia.');
      }
      prevMinutes = mins;
    }

    const { start, end } = getBusinessDayBounds(data.date);
    const createData = filled.map((slot) => {
      const { hour, minute } = parseHmParts(slot.hm);
      return {
        organizationId: user.organizationId,
        storeId: data.storeId,
        userId: data.userId,
        type: slot.type,
        punchedAt: zonedTimeToUtc(data.date, hour, minute, 0),
        source: 'WEB' as const,
        latitude: null,
        longitude: null,
        accuracy: null,
        distanceMeters: null,
        photoBytes: null,
      };
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.timeClockPunch.deleteMany({
        where: {
          organizationId: user.organizationId,
          storeId: data.storeId,
          userId: data.userId,
          punchedAt: { gte: start, lt: end },
        },
      });
      if (createData.length > 0) {
        await tx.timeClockPunch.createMany({ data: createData });
      }
    });

    const [year, month] = data.date.split('-').map(Number);
    const cardsResult = await this.getTimeClockCards(user, {
      storeId: data.storeId,
      year,
      month,
      userId: data.userId,
      roleFilter: 'all',
    });
    const card = cardsResult.cards[0] ?? null;
    const day = card?.days.find((d) => d.date === data.date) ?? null;
    return { card, day };
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
