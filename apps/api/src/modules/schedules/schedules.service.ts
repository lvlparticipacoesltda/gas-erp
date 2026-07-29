import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ScheduleDayType, TimeClockPunchType, UserRole } from '@gas-erp/database';
import {
  AuthUser,
  ROLE_LABELS,
  TIME_CLOCK_DAY_STATUS_LABELS,
  TIME_CLOCK_GEOFENCE_METERS,
  TIME_CLOCK_PHOTO_UPLOAD_MAX_BYTES,
  canManageSchedules,
  canViewTimeClockLog,
  assignTimeClockPunchSlots,
  computeTimeClockDayTotals,
  copyScheduleSchema,
  formatMinutesComma,
  formatMinutesCommaOrNull,
  getBusinessDayBounds,
  haversineDistanceMeters,
  intervalsFromSlots,
  isTimeClockDayComplete,
  parseHmToMinutes,
  scheduleMonthQuerySchema,
  timeClockCardsQuerySchema,
  timeClockDayPhotosQuerySchema,
  timeClockHistoryQuerySchema,
  timeClockMeQuerySchema,
  timeClockPunchSchema,
  timeClockReportQuerySchema,
  todayDateKey,
  upsertScheduleDaySchema,
  upsertTimeClockDaySchema,
  upsertWeeklyScheduleSchema,
  weeklyScheduleListQuerySchema,
  applyWeeklyScheduleSchema,
  applyStoreWeekliesSchema,
  WEEKDAY_LABELS_SHORT,
  zonedTimeToUtc,
  type TimeClockDayStatus,
} from '@gas-erp/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { assertScreenPermission, assertStoreAccess } from '../../common/guards';
import { CnpjLookupService } from '../../common/cnpj/cnpj-lookup.service';
import { compressJpegToMaxBytes } from '../../common/images/compress-jpeg';

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
  stores: Array<{ id: string; name: string }>;
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
  userStores: {
    select: { store: { select: { id: true, name: true } } },
  },
  deliverer: {
    select: {
      stores: {
        select: { store: { select: { id: true, name: true } } },
      },
    },
  },
} as const;

function mapCollaboratorStores(
  row: {
    userStores: Array<{ store: { id: string; name: string } }>;
    deliverer: { stores: Array<{ store: { id: string; name: string } }> } | null;
  },
): Array<{ id: string; name: string }> {
  const byId = new Map<string, { id: string; name: string }>();
  for (const us of row.userStores) byId.set(us.store.id, us.store);
  for (const ds of row.deliverer?.stores ?? []) byId.set(ds.store.id, ds.store);
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

function toCollabRow(
  row: {
    id: string;
    name: string;
    role: UserRole;
    email: string;
    cpf: string | null;
    pis: string | null;
    admittedAt: Date | null;
    jobTitle: string | null;
    userStores: Array<{ store: { id: string; name: string } }>;
    deliverer: { stores: Array<{ store: { id: string; name: string } }> } | null;
  },
): CollabRow {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    email: row.email,
    cpf: row.cpf,
    pis: row.pis,
    admittedAt: row.admittedAt,
    jobTitle: row.jobTitle,
    stores: mapCollaboratorStores(row),
  };
}

@Injectable()
export class SchedulesService {
  private readonly logger = new Logger(SchedulesService.name);

  constructor(
    private prisma: PrismaService,
    private cnpjLookup: CnpjLookupService,
  ) {}

  /** Comprime a selfie em background após a batida já estar gravada. */
  private schedulePunchPhotoCompress(punchId: string, original: Buffer) {
    void (async () => {
      try {
        const compressed = await compressJpegToMaxBytes(original);
        if (compressed.length >= original.length) return;
        await this.prisma.timeClockPunch.update({
          where: { id: punchId },
          data: { photoBytes: new Uint8Array(compressed) },
        });
        this.logger.log(
          `Foto do ponto ${punchId} comprimida: ${original.length} → ${compressed.length} bytes`,
        );
      } catch (err) {
        this.logger.warn(
          `Falha ao comprimir foto do ponto ${punchId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    })();
  }

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
    if (user.role === 'DELIVERER') {
      // App: permite a unidade da escala de hoje mesmo se o JWT ainda não listar a loja.
      if (!user.storeIds.includes(params.storeId)) {
        const todayKey = todayDateKey(BR_TZ);
        const todayEntry = await this.prisma.workScheduleEntry.findUnique({
          where: {
            organizationId_userId_date: {
              organizationId: user.organizationId,
              userId: user.id,
              date: parseDateOnly(todayKey),
            },
          },
          select: { storeId: true },
        });
        if (todayEntry?.storeId !== params.storeId) {
          throw new ForbiddenException('Sem acesso a esta loja');
        }
      }
    } else {
      assertStoreAccess(user, params.storeId);
    }
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
        organizationId: user.organizationId,
        date: { gte: start, lt: end },
        userId: { in: collaborators.map((c) => c.id) },
      },
      include: { store: { select: { id: true, name: true } } },
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
        id: c.id,
        name: c.name,
        role: c.role,
        email: c.email,
        stores: c.stores,
        entries: (byUser.get(c.id) ?? []).map((e) => ({
          id: e.id,
          date: formatDateOnly(e.date),
          dayType: e.dayType,
          startTime: e.startTime,
          endTime: e.endTime,
          breakStart: e.breakStart,
          breakEnd: e.breakEnd,
          notes: e.notes,
          storeId: e.storeId,
          storeName: e.store.name,
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
      return rows
        .map(toCollabRow)
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    }

    // Entregador (app): só a própria escala.
    if (user.role === 'DELIVERER') {
      const self = await this.prisma.user.findUnique({
        where: { id: user.id },
        select: collaboratorSelect,
      });
      return self ? [toCollabRow(self)] : [];
    }

    const rows: Array<Parameters<typeof toCollabRow>[0]> = [];

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

    return rows.map(toCollabRow);
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
        organizationId_userId_date: {
          organizationId: user.organizationId,
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
        storeId: data.storeId,
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
    await this.assertCanEditCollaboratorSchedule(user, entry.userId);
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
      organizationId: user.organizationId,
      date: { gte: source.start, lt: source.end },
      ...(data.sourceUserId
        ? { userId: data.sourceUserId }
        : {
            userId: {
              in: (await this.listCollaborators(user, data.storeId, 'all')).map((c) => c.id),
            },
          }),
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
          organizationId_userId_date: {
            organizationId: user.organizationId,
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
          storeId: data.storeId,
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

  private formatWeeklySummary(
    days: Array<{
      weekday: number;
      dayType: ScheduleDayType;
      startTime: string | null;
      endTime: string | null;
      breakStart: string | null;
      breakEnd: string | null;
    }>,
  ): string {
    const ordered = [...days].sort((a, b) => a.weekday - b.weekday);
    const groups = new Map<string, number[]>();
    for (const day of ordered) {
      let key: string;
      if (day.dayType === ScheduleDayType.DAY_OFF || (!day.startTime && !day.endTime)) {
        key = 'Folga';
      } else {
        const parts = [day.startTime, day.breakStart, day.breakEnd, day.endTime]
          .filter(Boolean)
          .map((t) => t!.slice(0, 5));
        // Compact: 08:00-12:00 13:00-17:00
        if (parts.length === 4) {
          key = `${parts[0]}-${parts[1]} ${parts[2]}-${parts[3]}`;
        } else if (parts.length >= 2) {
          key = `${parts[0]}-${parts[parts.length - 1]}`;
        } else {
          key = parts[0] ?? '—';
        }
      }
      const list = groups.get(key) ?? [];
      list.push(day.weekday);
      groups.set(key, list);
    }
    return Array.from(groups.entries())
      .map(([pattern, weekdays]) => {
        const labels = weekdays.map((w) => WEEKDAY_LABELS_SHORT[w]).join(' ');
        return `${labels}: ${pattern}`;
      })
      .join(' · ');
  }

  private mapWeeklyDto(weekly: {
    id: string;
    userId: string;
    storeId: string;
    name: string;
    active: boolean;
    updatedAt: Date;
    user: { id: string; name: string; role: UserRole; email: string };
    store: { id: string; name: string };
    days: Array<{
      weekday: number;
      dayType: ScheduleDayType;
      startTime: string | null;
      endTime: string | null;
      breakStart: string | null;
      breakEnd: string | null;
    }>;
  }) {
    return {
      id: weekly.id,
      userId: weekly.userId,
      storeId: weekly.storeId,
      storeName: weekly.store.name,
      name: weekly.name,
      active: weekly.active,
      type: 'Semanal' as const,
      summary: this.formatWeeklySummary(weekly.days),
      updatedAt: weekly.updatedAt.toISOString(),
      user: {
        id: weekly.user.id,
        name: weekly.user.name,
        role: weekly.user.role,
        email: weekly.user.email,
      },
      days: weekly.days
        .slice()
        .sort((a, b) => a.weekday - b.weekday)
        .map((d) => ({
          weekday: d.weekday,
          dayType: d.dayType,
          startTime: d.startTime,
          endTime: d.endTime,
          breakStart: d.breakStart,
          breakEnd: d.breakEnd,
        })),
    };
  }

  async listWeeklies(user: AuthUser, query: unknown) {
    this.assertCanManage(user);
    const params = weeklyScheduleListQuerySchema.parse(query);
    assertStoreAccess(user, params.storeId);

    const collaborators = await this.listCollaborators(user, params.storeId, 'all');
    const collabIds = collaborators.map((c) => c.id);
    if (collabIds.length === 0) return { items: [], eligibleUsers: [] };

    const existingUserIds = await this.prisma.workScheduleWeekly.findMany({
      where: {
        organizationId: user.organizationId,
        userId: { in: collabIds },
      },
      select: { userId: true },
    });
    const hasWeekly = new Set(existingUserIds.map((w) => w.userId));

    const weeklies = await this.prisma.workScheduleWeekly.findMany({
      where: {
        organizationId: user.organizationId,
        userId: { in: collabIds },
        ...(params.status === 'active'
          ? { active: true }
          : params.status === 'inactive'
            ? { active: false }
            : {}),
        ...(params.q?.trim()
          ? {
              OR: [
                { name: { contains: params.q.trim(), mode: 'insensitive' as const } },
                { user: { name: { contains: params.q.trim(), mode: 'insensitive' as const } } },
              ],
            }
          : {}),
      },
      include: {
        user: { select: { id: true, name: true, role: true, email: true } },
        store: { select: { id: true, name: true } },
        days: true,
      },
      orderBy: { name: 'asc' },
    });

    return {
      items: weeklies.map((w) => this.mapWeeklyDto(w)),
      eligibleUsers: collaborators
        .filter((c) => !hasWeekly.has(c.id))
        .map((c) => ({ id: c.id, name: c.name, role: c.role, email: c.email })),
    };
  }

  async getWeekly(user: AuthUser, userId: string) {
    this.assertCanManage(user);
    const weekly = await this.prisma.workScheduleWeekly.findFirst({
      where: { organizationId: user.organizationId, userId },
      include: {
        user: { select: { id: true, name: true, role: true, email: true } },
        store: { select: { id: true, name: true } },
        days: true,
      },
    });
    if (!weekly) throw new NotFoundException('Horário semanal não encontrado');
    assertStoreAccess(user, weekly.storeId);
    return this.mapWeeklyDto(weekly);
  }

  async upsertWeekly(user: AuthUser, userId: string, input: unknown) {
    this.assertCanManage(user);
    const data = upsertWeeklyScheduleSchema.parse(input);
    assertStoreAccess(user, data.storeId);
    await this.assertUserBelongsToStore(userId, data.storeId, user.organizationId);

    const weekdaySet = new Set(data.days.map((d) => d.weekday));
    if (weekdaySet.size !== 7) {
      throw new BadRequestException('Informe exatamente um dia para cada weekday 0–6.');
    }

    const targetUser = await this.prisma.user.findFirst({
      where: { id: userId, organizationId: user.organizationId, active: true },
      select: { id: true, name: true, role: true },
    });
    if (!targetUser) throw new NotFoundException('Colaborador não encontrado');
    if (
      targetUser.role !== UserRole.DELIVERER
      && targetUser.role !== UserRole.ATTENDANT
      && targetUser.role !== UserRole.STORE_MANAGER
    ) {
      throw new BadRequestException('Horário semanal só para entregadores, atendentes ou gerentes.');
    }

    await this.prisma.$transaction(async (tx) => {
      const weekly = await tx.workScheduleWeekly.upsert({
        where: { userId },
        create: {
          organizationId: user.organizationId,
          userId,
          storeId: data.storeId,
          name: data.name,
          active: data.active,
        },
        update: {
          storeId: data.storeId,
          name: data.name,
          active: data.active,
        },
      });

      await tx.workScheduleWeeklyDay.deleteMany({ where: { weeklyId: weekly.id } });
      await tx.workScheduleWeeklyDay.createMany({
        data: data.days.map((day) => {
          const isOff = day.dayType === 'DAY_OFF';
          return {
            weeklyId: weekly.id,
            weekday: day.weekday,
            dayType: day.dayType as ScheduleDayType,
            startTime: isOff ? null : day.startTime ?? null,
            endTime: isOff ? null : day.endTime ?? null,
            breakStart: isOff ? null : day.breakStart ?? null,
            breakEnd: isOff ? null : day.breakEnd ?? null,
          };
        }),
      });
    });

    return this.getWeekly(user, userId);
  }

  async deleteWeekly(user: AuthUser, userId: string) {
    this.assertCanManage(user);
    const weekly = await this.prisma.workScheduleWeekly.findFirst({
      where: { organizationId: user.organizationId, userId },
    });
    if (!weekly) throw new NotFoundException('Horário semanal não encontrado');
    assertStoreAccess(user, weekly.storeId);
    await this.prisma.workScheduleWeekly.delete({ where: { id: weekly.id } });
    return { ok: true };
  }

  async applyWeekly(user: AuthUser, userId: string, input: unknown) {
    this.assertCanManage(user);
    const data = applyWeeklyScheduleSchema.parse(input);

    const weekly = await this.prisma.workScheduleWeekly.findFirst({
      where: { organizationId: user.organizationId, userId },
      include: { days: true },
    });
    if (!weekly) throw new NotFoundException('Horário semanal não encontrado');
    if (!weekly.active) {
      throw new BadRequestException('Horário inativo não pode ser aplicado.');
    }

    const storeId = data.storeId ?? weekly.storeId;
    assertStoreAccess(user, storeId);
    await this.assertUserBelongsToStore(userId, storeId, user.organizationId);

    const byWeekday = new Map(weekly.days.map((d) => [d.weekday, d]));
    const totalDays = daysInMonth(data.year, data.month);
    const { start, end } = monthBounds(data.year, data.month);

    const existing = await this.prisma.workScheduleEntry.findMany({
      where: {
        organizationId: user.organizationId,
        userId,
        date: { gte: start, lt: end },
      },
      select: { date: true },
    });
    const existingKeys = new Set(existing.map((e) => formatDateOnly(e.date)));

    let created = 0;
    let skipped = 0;

    for (let day = 1; day <= totalDays; day += 1) {
      const date = new Date(Date.UTC(data.year, data.month - 1, day));
      const key = formatDateOnly(date);
      if (existingKeys.has(key)) {
        skipped += 1;
        continue;
      }
      // Date.UTC midday weekday: use noon UTC to avoid TZ edge — date-only is UTC midnight
      // weekday of calendar date in BR: use the UTC date's getUTCDay which matches civil calendar for Date @ UTC midnight
      const weekday = date.getUTCDay();
      const template = byWeekday.get(weekday);
      if (!template) {
        skipped += 1;
        continue;
      }
      const isOff = template.dayType === ScheduleDayType.DAY_OFF;
      await this.prisma.workScheduleEntry.create({
        data: {
          organizationId: user.organizationId,
          storeId,
          userId,
          date,
          dayType: template.dayType,
          startTime: isOff ? null : template.startTime,
          endTime: isOff ? null : template.endTime,
          breakStart: isOff ? null : template.breakStart,
          breakEnd: isOff ? null : template.breakEnd,
          createdById: user.id,
          updatedById: user.id,
        },
      });
      created += 1;
    }

    return { created, skipped, year: data.year, month: data.month };
  }

  async applyStoreWeeklies(user: AuthUser, input: unknown) {
    this.assertCanManage(user);
    const data = applyStoreWeekliesSchema.parse(input);
    assertStoreAccess(user, data.storeId);

    const collaborators = await this.listCollaborators(user, data.storeId, 'all');
    const collabIds = collaborators.map((c) => c.id);
    const weeklies = await this.prisma.workScheduleWeekly.findMany({
      where: {
        organizationId: user.organizationId,
        userId: { in: collabIds },
        active: true,
      },
      select: { userId: true },
    });

    let created = 0;
    let skipped = 0;
    for (const w of weeklies) {
      // Usa a unidade salva no horário de cada pessoa (não força a loja do filtro).
      const result = await this.applyWeekly(user, w.userId, {
        year: data.year,
        month: data.month,
      });
      created += result.created;
      skipped += result.skipped;
    }

    return { created, skipped, appliedUsers: weeklies.length, year: data.year, month: data.month };
  }

  private async assertCanEditCollaboratorSchedule(user: AuthUser, targetUserId: string) {
    if (user.role === 'ORG_MASTER' || user.role === 'PLATFORM_ADMIN') return;
    const storeIds = user.storeIds ?? [];
    if (storeIds.length === 0) {
      throw new ForbiddenException('Sem permissão para editar esta escala');
    }
    for (const storeId of storeIds) {
      try {
        await this.assertUserBelongsToStore(targetUserId, storeId, user.organizationId);
        return;
      } catch {
        // tenta próxima unidade
      }
    }
    throw new ForbiddenException('Colaborador não pertence às suas unidades');
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
    if (user.role === 'DELIVERER' && !user.storeIds.includes(params.storeId)) {
      const todayKey = todayDateKey(BR_TZ);
      const todayEntry = await this.prisma.workScheduleEntry.findUnique({
        where: {
          organizationId_userId_date: {
            organizationId: user.organizationId,
            userId: user.id,
            date: parseDateOnly(todayKey),
          },
        },
        select: { storeId: true },
      });
      if (todayEntry?.storeId !== params.storeId) {
        throw new ForbiddenException('Sem acesso a esta loja');
      }
    } else {
      assertStoreAccess(user, params.storeId);
    }

    const dateStr = params.date ?? todayDateKey(BR_TZ);
    const { start: dayStart, end: dayEnd } = getBusinessDayBounds(dateStr, BR_TZ);
    const scheduleDate = parseDateOnly(dateStr);

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
    const dayComplete = isTimeClockDayComplete(punches);
    const nextType: TimeClockPunchType | null = dayComplete
      ? null
      : !last || last.type === TimeClockPunchType.CLOCK_OUT
        ? TimeClockPunchType.CLOCK_IN
        : TimeClockPunchType.CLOCK_OUT;

    const store = await this.prisma.store.findFirst({
      where: { id: params.storeId, organizationId: user.organizationId },
      select: { id: true, name: true, latitude: true, longitude: true },
    });

    const schedule = await this.prisma.workScheduleEntry.findUnique({
      where: {
        organizationId_userId_date: {
          organizationId: user.organizationId,
          userId: user.id,
          date: scheduleDate,
        },
      },
    });

    return {
      date: dateStr,
      store,
      nextType,
      dayComplete,
      punches,
      schedule: schedule
        ? {
            id: schedule.id,
            storeId: schedule.storeId,
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
    if (user.role === 'DELIVERER' && data.source === 'MOBILE' && !user.storeIds.includes(data.storeId)) {
      const todayKey = todayDateKey(BR_TZ);
      const todayEntry = await this.prisma.workScheduleEntry.findUnique({
        where: {
          organizationId_userId_date: {
            organizationId: user.organizationId,
            userId: user.id,
            date: parseDateOnly(todayKey),
          },
        },
        select: { storeId: true },
      });
      if (todayEntry?.storeId !== data.storeId) {
        throw new ForbiddenException('Sem acesso a esta loja');
      }
    } else {
      assertStoreAccess(user, data.storeId);
    }

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

    // Alternância IN/OUT no dia operacional (America/Sao_Paulo).
    const todayKey = todayDateKey(BR_TZ);
    const { start: dayStart, end: dayEnd } = getBusinessDayBounds(todayKey, BR_TZ);

    const dayPunches = await this.prisma.timeClockPunch.findMany({
      where: {
        storeId: data.storeId,
        userId: user.id,
        punchedAt: { gte: dayStart, lt: dayEnd },
      },
      orderBy: { punchedAt: 'asc' },
      select: { type: true, punchedAt: true },
    });

    if (isTimeClockDayComplete(dayPunches)) {
      throw new BadRequestException(
        'Ponto do dia já está completo (ENT.1, SAÍ.1, ENT.2 e SAÍ.2). Não é possível registrar outra batida.',
      );
    }

    const last = dayPunches[dayPunches.length - 1] ?? null;
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
      if (buf.length > TIME_CLOCK_PHOTO_UPLOAD_MAX_BYTES) {
        throw new BadRequestException(
          `Foto muito grande (máx. ${Math.round(TIME_CLOCK_PHOTO_UPLOAD_MAX_BYTES / (1024 * 1024))} MB).`,
        );
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

    // Ponto já está no banco — compressão não bloqueia o app.
    if (photoBytes) {
      this.schedulePunchPhotoCompress(punch.id, Buffer.from(photoBytes));
    }

    return punch;
  }

  /** Fotos das batidas de um dia (cartão de ponto). */
  async getDayPhotos(user: AuthUser, query: unknown) {
    this.assertCanViewTimeClock(user);
    const params = timeClockDayPhotosQuerySchema.parse(query);
    assertStoreAccess(user, params.storeId);

    const { start: dayStart, end: dayEnd } = getBusinessDayBounds(params.date, BR_TZ);
    // Busca todas as batidas do dia para mapear ENT.1/SAÍ.1/ENT.2/SAÍ.2 corretamente
    // (batidas manuais na web podem não ter foto).
    const punches = await this.prisma.timeClockPunch.findMany({
      where: {
        organizationId: user.organizationId,
        storeId: params.storeId,
        userId: params.userId,
        punchedAt: { gte: dayStart, lt: dayEnd },
      },
      orderBy: { punchedAt: 'asc' },
      select: {
        id: true,
        type: true,
        punchedAt: true,
        source: true,
        photoBytes: true,
      },
    });

    const slotted = assignTimeClockPunchSlots(
      punches.map((p) => ({
        id: p.id,
        type: p.type,
        punchedAt: p.punchedAt,
        source: p.source,
        photoBytes: p.photoBytes,
      })),
    );

    const slotOrder = { ent1: 0, sai1: 1, ent2: 2, sai2: 3 } as const;
    const photos = slotted
      .filter((p) => p.photoBytes != null)
      .sort((a, b) => slotOrder[a.slot] - slotOrder[b.slot])
      .map((punch) => ({
        id: punch.id,
        type: punch.type,
        slot: punch.slot,
        slotLabel: punch.slotLabel,
        punchedAt: punch.punchedAt.toISOString(),
        source: punch.source,
        mimeType: 'image/jpeg' as const,
        photoBase64: Buffer.from(punch.photoBytes!).toString('base64'),
      }));

    return {
      date: params.date,
      photos,
    };
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
   * Cartões de ponto no formato do fechamento PDF (4 batidas + totais CLT).
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

    const [entries, punches, punchesWithPhoto] = await Promise.all([
      this.prisma.workScheduleEntry.findMany({
        where: {
          organizationId: user.organizationId,
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
      this.prisma.timeClockPunch.findMany({
        where: {
          organizationId: user.organizationId,
          storeId: params.storeId,
          userId: { in: userIds },
          punchedAt: { gte: punchFrom, lt: punchTo },
          photoBytes: { not: null },
        },
        select: {
          userId: true,
          punchedAt: true,
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

    const photosByKey = new Set<string>();
    for (const punch of punchesWithPhoto) {
      const dateKey = brazilDateKey(punch.punchedAt);
      const [y, m] = dateKey.split('-').map(Number);
      if (y !== params.year || m !== params.month) continue;
      photosByKey.add(`${punch.userId}|${dateKey}`);
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
        let totalNoturnoMinutes = 0;
        let diaFaltaMinutes = 0;
        let faltaEAtrasoMinutes = 0;
        let extra50dMinutes = 0;
        let extraDiurnaMinutes = 0;
        let extraNoturnaMinutes = 0;
        let bancoTotalMinutes = 0;
        let faltas = 0;
        let atrasos = 0;
        let bancoSaldoRunning = 0;

        const days = Array.from({ length: dim }, (_, i) => {
          const day = i + 1;
          const date = `${params.year}-${String(params.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const key = `${collab.id}|${date}`;
          const schedule = scheduleByKey.get(key) ?? null;
          const slots = assignDayPunchSlots(punchesByKey.get(key) ?? []);
          const scheduleSlots = scheduleSlotsFromEntry(schedule);
          const isWorkDay = Boolean(
            schedule && schedule.dayType !== ScheduleDayType.DAY_OFF,
          );

          const scheduledIntervals = intervalsFromSlots(scheduleSlots);
          const workedIntervals = intervalsFromSlots({
            ent1: slots.ent1 ? brazilTimeHm(slots.ent1) : null,
            sai1: slots.sai1 ? brazilTimeHm(slots.sai1) : null,
            ent2: slots.ent2 ? brazilTimeHm(slots.ent2) : null,
            sai2: slots.sai2 ? brazilTimeHm(slots.sai2) : null,
          });

          const calc = computeTimeClockDayTotals({
            isWorkDay,
            scheduled: scheduledIntervals,
            worked: workedIntervals,
            scheduledStartMinutes: parseHmToMinutes(scheduleSlots.ent1),
            scheduledEndMinutes: parseHmToMinutes(scheduleSlots.sai2 ?? scheduleSlots.sai1),
            firstInMinutes: slots.ent1 ? parseHmToMinutes(brazilTimeHm(slots.ent1)) : null,
            lastOutMinutes: slots.sai2
              ? parseHmToMinutes(brazilTimeHm(slots.sai2))
              : slots.sai1
                ? parseHmToMinutes(brazilTimeHm(slots.sai1))
                : null,
          });

          bancoSaldoRunning += calc.bancoTotalMinutes;
          totalNormaisMinutes += calc.totalNormaisMinutes;
          totalNoturnoMinutes += calc.totalNoturnoMinutes;
          diaFaltaMinutes += calc.diaFaltaMinutes;
          faltaEAtrasoMinutes += calc.faltaEAtrasoMinutes;
          extra50dMinutes += calc.extra50dMinutes;
          extraDiurnaMinutes += calc.extraDiurnaMinutes;
          extraNoturnaMinutes += calc.extraNoturnaMinutes;
          bancoTotalMinutes += calc.bancoTotalMinutes;

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
            hasPhotos: photosByKey.has(key),
            totalNormais: formatMinutesCommaOrNull(calc.totalNormaisMinutes),
            totalNormaisMinutes: calc.totalNormaisMinutes,
            totalNoturno: formatMinutesCommaOrNull(calc.totalNoturnoMinutes),
            totalNoturnoMinutes: calc.totalNoturnoMinutes,
            diaFalta: formatMinutesCommaOrNull(calc.diaFaltaMinutes),
            diaFaltaMinutes: calc.diaFaltaMinutes,
            faltaEAtraso: formatMinutesCommaOrNull(calc.faltaEAtrasoMinutes),
            faltaEAtrasoMinutes: calc.faltaEAtrasoMinutes,
            abono: null as string | null,
            abonoMinutes: 0,
            extra50d: formatMinutesCommaOrNull(calc.extra50dMinutes),
            extra50dMinutes: calc.extra50dMinutes,
            extraDiurna: formatMinutesCommaOrNull(calc.extraDiurnaMinutes),
            extraDiurnaMinutes: calc.extraDiurnaMinutes,
            extraNoturna: formatMinutesCommaOrNull(calc.extraNoturnaMinutes),
            extraNoturnaMinutes: calc.extraNoturnaMinutes,
            bancoTotal: formatMinutesCommaOrNull(calc.bancoTotalMinutes),
            bancoTotalMinutes: calc.bancoTotalMinutes,
            bancoSaldo: bancoSaldoRunning > 0 ? formatMinutesComma(bancoSaldoRunning) : null,
            bancoSaldoMinutes: bancoSaldoRunning,
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
            totalNoturno: formatMinutesCommaOrNull(totalNoturnoMinutes),
            totalNoturnoMinutes: Math.round(totalNoturnoMinutes),
            diaFalta: formatMinutesCommaOrNull(diaFaltaMinutes),
            diaFaltaMinutes: Math.round(diaFaltaMinutes),
            faltaEAtraso: formatMinutesCommaOrNull(faltaEAtrasoMinutes),
            faltaEAtrasoMinutes: Math.round(faltaEAtrasoMinutes),
            abono: null as string | null,
            extra50d: formatMinutesCommaOrNull(extra50dMinutes),
            extra50dMinutes: Math.round(extra50dMinutes),
            extraDiurna: formatMinutesCommaOrNull(extraDiurnaMinutes),
            extraDiurnaMinutes: Math.round(extraDiurnaMinutes),
            extraNoturna: formatMinutesCommaOrNull(extraNoturnaMinutes),
            extraNoturnaMinutes: Math.round(extraNoturnaMinutes),
            bancoTotal: formatMinutesCommaOrNull(bancoTotalMinutes),
            bancoTotalMinutes: Math.round(bancoTotalMinutes),
            bancoSaldo: formatMinutesCommaOrNull(bancoSaldoRunning) ?? formatMinutesComma(0),
            bancoSaldoMinutes: Math.round(bancoSaldoRunning),
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

  /** Escala do próprio colaborador no app — entries por pessoa; store = unidade do dia (ponto). */
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
        // Unidade de referência do ponto = escala de hoje (quando houver trabalho).
        const todayKey = todayDateKey(BR_TZ);
        const todayEntry = await this.prisma.workScheduleEntry.findUnique({
          where: {
            organizationId_userId_date: {
              organizationId: user.organizationId,
              userId: user.id,
              date: parseDateOnly(todayKey),
            },
          },
          select: { id: true, storeId: true, dayType: true },
        });

        const deliverer = await this.prisma.deliverer.findUnique({
          where: { userId: user.id },
          include: { stores: { orderBy: { createdAt: 'asc' } } },
        });
        const linkedStoreIds = new Set(
          (deliverer?.stores ?? []).map((s) => s.storeId),
        );
        const fallbackStoreId =
          deliverer?.availableStoreId && linkedStoreIds.has(deliverer.availableStoreId)
            ? deliverer.availableStoreId
            : deliverer?.stores[0]?.storeId;

        if (
          todayEntry?.storeId
          && todayEntry.dayType !== ScheduleDayType.DAY_OFF
          && linkedStoreIds.has(todayEntry.storeId)
        ) {
          storeId = todayEntry.storeId;
        } else if (
          todayEntry?.storeId
          && todayEntry.dayType !== ScheduleDayType.DAY_OFF
          && fallbackStoreId
          && !linkedStoreIds.has(todayEntry.storeId)
        ) {
          // Escala apontava para loja da qual o entregador foi desvinculado.
          await this.prisma.workScheduleEntry.update({
            where: { id: todayEntry.id },
            data: { storeId: fallbackStoreId },
          });
          storeId = fallbackStoreId;
        } else {
          storeId = fallbackStoreId;
        }
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
