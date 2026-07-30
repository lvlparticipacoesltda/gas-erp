import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import {
  SCHEDULE_DAY_TYPE_LABELS,
  TIME_CLOCK_GEOFENCE_METERS,
  TIME_CLOCK_PHOTO_UPLOAD_MAX_BYTES,
  haversineDistanceMeters,
  isNonWorkingScheduleDay,
  type ScheduleDayType,
  type TimeClockPunchType,
} from '@gas-erp/shared';
import { Loading, StateMessage } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import {
  fetchMySchedule,
  fetchMyTimeClock,
  mapPunchesToSlots,
  nextPunchSlot,
  punchTimeClock,
  PUNCH_SLOT_LABELS,
  timeClockSlotPunchType,
  type PunchSlotKey,
  type ScheduleEntryDto,
  type TimeClockMe,
} from '@/lib/schedules';
import { colors, radius, spacing } from '@/theme';

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
const WEEKDAYS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError && err.message) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

function isForbidden(err: unknown): boolean {
  return err instanceof ApiError && err.status === 403;
}

/** Tamanho real do binário a partir do base64 (sem data-URL). */
function base64ByteLength(b64: string): number {
  const cleaned = b64.replace(/^data:image\/\w+;base64,/, '').replace(/\s/g, '');
  const padding = cleaned.endsWith('==') ? 2 : cleaned.endsWith('=') ? 1 : 0;
  return Math.floor((cleaned.length * 3) / 4) - padding;
}

function dayFillColor(type: ScheduleDayType) {
  if (type === 'WORK') return colors.success;
  if (type === 'HALF_DAY') return colors.warning;
  if (type === 'VACATION') return colors.primary;
  return colors.textFaint;
}

function dayTypeBadgeColors(type: ScheduleDayType) {
  if (type === 'WORK') return { bg: colors.successBg, text: colors.successText };
  if (type === 'HALF_DAY') return { bg: colors.warningBg, text: colors.warningText };
  if (type === 'VACATION') return { bg: colors.surfaceAlt, text: colors.primary };
  return { bg: colors.surfaceAlt, text: colors.textMuted };
}

function formatCommitmentDate(date: string) {
  const formatted = new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

export default function ScheduleScreen() {
  const { user, logout } = useAuth();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 403 conta/horário inativo — escala e ponto indisponíveis. */
  const [accessBlocked, setAccessBlocked] = useState(false);
  const [entries, setEntries] = useState<ScheduleEntryDto[]>([]);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [storeName, setStoreName] = useState<string>('');
  const [storeLat, setStoreLat] = useState<number | null>(null);
  const [storeLng, setStoreLng] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [punch, setPunch] = useState<TimeClockMe | null>(null);
  const [punchBusy, setPunchBusy] = useState(false);
  const [punchSyncing, setPunchSyncing] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [distanceM, setDistanceM] = useState<number | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<PunchSlotKey | null>(null);
  const lastGeoRef = useRef<{
    pos: Location.LocationObject;
    dist: number;
    at: number;
  } | null>(null);

  const clearScheduleState = useCallback(() => {
    setStoreId(null);
    setStoreName('');
    setStoreLat(null);
    setStoreLng(null);
    setEntries([]);
    setPunch(null);
    setPhotoUri(null);
    setPhotoBase64(null);
    setDistanceM(null);
  }, []);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const data = await fetchMySchedule(year, month);
      setAccessBlocked(false);
      setStoreId(data.store.id);
      setStoreName(data.store.name);
      setStoreLat(data.store.latitude);
      setStoreLng(data.store.longitude);
      const mine =
        data.collaborators.find((c) => c.id === user?.id)
        ?? data.collaborators[0];
      setEntries(mine?.entries ?? []);
      return data.store.id as string | null;
    } catch (err) {
      const message = errorMessage(err, 'Falha ao carregar escala');
      setError(message);
      if (isForbidden(err)) {
        setAccessBlocked(true);
        clearScheduleState();
      }
      return null;
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [year, month, clearScheduleState, user?.id]);

  const loadPunch = useCallback(async (sid: string) => {
    try {
      const data = await fetchMyTimeClock(sid);
      setPunch(data);
    } catch (err) {
      setPunch(null);
      if (isForbidden(err)) {
        setAccessBlocked(true);
        clearScheduleState();
        setError(errorMessage(err, 'Escala e ponto indisponíveis.'));
      }
    }
  }, [clearScheduleState]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (storeId) void loadPunch(storeId);
  }, [storeId, loadPunch]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const sid = await load({ silent: true });
      if (sid) await loadPunch(sid);
    } finally {
      setRefreshing(false);
    }
  }, [load, loadPunch]);

  const entryByDate = useMemo(() => {
    const map = new Map<string, ScheduleEntryDto>();
    for (const e of entries) map.set(e.date, e);
    return map;
  }, [entries]);

  const summary = useMemo(() => {
    let work = 0;
    let half = 0;
    let off = 0;
    for (const e of entries) {
      if (e.dayType === 'WORK') work += 1;
      else if (e.dayType === 'HALF_DAY') half += 1;
      else off += 1;
    }
    return { work, half, off };
  }, [entries]);

  const calendarWeeks = useMemo(() => {
    const first = new Date(year, month - 1, 1);
    const startPad = first.getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    const cells: Array<{ day: number | null; date: string | null }> = [];
    for (let i = 0; i < startPad; i++) cells.push({ day: null, date: null });
    for (let d = 1; d <= daysInMonth; d++) {
      const date = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ day: d, date });
    }
    while (cells.length % 7 !== 0) cells.push({ day: null, date: null });

    const weeks: Array<typeof cells> = [];
    for (let i = 0; i < cells.length; i += 7) {
      weeks.push(cells.slice(i, i + 7));
    }
    return weeks;
  }, [year, month]);

  const nextCommitment = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = entries
      .filter((e) => e.date >= today && !isNonWorkingScheduleDay(e.dayType))
      .sort((a, b) => a.date.localeCompare(b.date));
    return upcoming[0] ?? null;
  }, [entries]);

  const selectedEntry = selectedDate ? entryByDate.get(selectedDate) : undefined;
  const nextBadgeColors = nextCommitment
    ? dayTypeBadgeColors(nextCommitment.dayType)
    : null;

  const canPunch =
    Boolean(photoBase64 || photoUri) &&
    distanceM != null &&
    distanceM <= TIME_CLOCK_GEOFENCE_METERS;

  const punchSlots = useMemo(() => {
    if (!punch) {
      return { ent1: null, sai1: null, ent2: null, sai2: null } as Record<
        PunchSlotKey,
        string | null
      >;
    }
    return mapPunchesToSlots(punch.punches);
  }, [punch]);

  const isAttendant = user?.role === 'ATTENDANT';

  const dayComplete = useMemo(() => {
    if (!punch) return false;
    if (punch.dayComplete != null) return punch.dayComplete;
    return Boolean(
      punchSlots.ent1 && punchSlots.sai1 && punchSlots.ent2 && punchSlots.sai2,
    );
  }, [punch, punchSlots]);

  const sequentialSlot = useMemo(
    () => (punch ? nextPunchSlot(punch.punches) : 'ent1'),
    [punch],
  );

  // Atendente: ENT.1 obrigatório; depois escolhe o slot vazio.
  useEffect(() => {
    if (!isAttendant) {
      setSelectedSlot(null);
      return;
    }
    if (dayComplete) {
      setSelectedSlot(null);
      return;
    }
    if (!punchSlots.ent1) {
      setSelectedSlot('ent1');
      return;
    }
    setSelectedSlot((prev) => {
      if (prev && !punchSlots[prev]) return prev;
      return null;
    });
  }, [isAttendant, dayComplete, punchSlots]);

  const activePunchSlot = isAttendant
    ? (selectedSlot ?? (!punchSlots.ent1 ? 'ent1' : null))
    : sequentialSlot;

  const activePunchType = activePunchSlot
    ? timeClockSlotPunchType(activePunchSlot)
    : punch?.nextType ?? null;

  const canSubmitPunch =
    canPunch
    && !dayComplete
    && activePunchSlot != null
    && activePunchType != null
    && !punchSyncing;

  function shiftMonth(delta: number) {
    const d = new Date(year, month - 1 + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  }

  async function refreshDistance() {
    if (storeLat == null || storeLng == null) {
      setDistanceM(null);
      setError(
        'A unidade do ponto não tem coordenadas cadastradas. Peça para atualizar o endereço da loja no painel.',
      );
      return null;
    }
    try {
      const servicesOn = await Location.hasServicesEnabledAsync();
      if (!servicesOn) {
        setError(
          'Localização desligada no aparelho. Ative o GPS (no emulador: Extended Controls → Location e defina um ponto).',
        );
        return null;
      }

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError('Permissão de localização necessária para bater o ponto.');
        return null;
      }

      let pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }).catch(() => null);

      // Emulador / GPS frio: tenta última posição conhecida.
      if (!pos) {
        pos = await Location.getLastKnownPositionAsync({
          maxAge: 5 * 60_000,
          requiredAccuracy: 500,
        });
      }

      if (!pos) {
        setError(
          'GPS indisponível no momento. No emulador Android, abra os três pontinhos → Location, escolha um ponto perto da unidade e toque em Set Location.',
        );
        return null;
      }

      const dist = haversineDistanceMeters(
        pos.coords.latitude,
        pos.coords.longitude,
        storeLat,
        storeLng,
      );
      setDistanceM(dist);
      lastGeoRef.current = { pos, dist, at: Date.now() };
      setError(null);
      return { pos, dist };
    } catch (err) {
      const raw = err instanceof Error ? err.message : '';
      const friendly = /unavailable|location services|timed out|TIMEOUT/i.test(raw)
        ? 'GPS indisponível. No emulador: Extended Controls (⋯) → Location → defina coordenadas perto da loja → Set Location.'
        : raw || 'Não foi possível obter a localização.';
      setError(friendly);
      return null;
    }
  }

  /** Reusa GPS recente (<45s) para o registro ficar imediato. */
  async function resolveGeoForPunch() {
    const cached = lastGeoRef.current;
    if (
      cached
      && Date.now() - cached.at < 45_000
      && cached.dist <= TIME_CLOCK_GEOFENCE_METERS
    ) {
      return cached;
    }
    return refreshDistance();
  }

  async function takePhoto() {
    const cam = await ImagePicker.requestCameraPermissionsAsync();
    if (!cam.granted) {
      setError('Permissão de câmera necessária para a foto do ponto.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      // Qualidade moderada na captura; compressão final fica no servidor.
      quality: 0.55,
      base64: true,
      allowsEditing: false,
      exif: false,
    });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    if (!asset.base64) {
      setError('Não foi possível ler a foto. Tente novamente.');
      return;
    }
    if (base64ByteLength(asset.base64) > TIME_CLOCK_PHOTO_UPLOAD_MAX_BYTES) {
      setError('Foto muito grande. Tire outra com menos luz de fundo.');
      return;
    }

    setPhotoUri(asset.uri);
    setPhotoBase64(asset.base64);
    setError(null);
    // Aquecer GPS enquanto o usuário confere a foto.
    void refreshDistance();
  }

  function applyOptimisticPunch(
    current: TimeClockMe,
    type: TimeClockPunchType,
    slot: PunchSlotKey,
    dist: number | null,
  ): TimeClockMe {
    const punches = [
      ...current.punches,
      {
        id: `local-${Date.now()}`,
        type,
        punchedAt: new Date().toISOString(),
        distanceMeters: dist,
        source: 'MOBILE' as const,
        slot,
      },
    ];
    const slots = mapPunchesToSlots(punches);
    const complete = Boolean(slots.ent1 && slots.sai1 && slots.ent2 && slots.sai2);
    return {
      ...current,
      punches,
      dayComplete: complete,
      nextType: complete ? null : type === 'CLOCK_IN' ? 'CLOCK_OUT' : 'CLOCK_IN',
    };
  }

  async function submitPunch() {
    if (!storeId || !punch || !activePunchSlot || !activePunchType || dayComplete || punchSyncing) {
      return;
    }
    if (!photoBase64) {
      setError('Tire uma foto para validar o ponto.');
      return;
    }

    setPunchBusy(true);
    setError(null);
    try {
      const geo = await resolveGeoForPunch();
      if (!geo) throw new Error('Não foi possível obter o GPS.');
      if (geo.dist > TIME_CLOCK_GEOFENCE_METERS) {
        throw new Error(
          `Você está a ~${Math.round(geo.dist)} m da unidade. Aproxime-se (máx. ${TIME_CLOCK_GEOFENCE_METERS} m).`,
        );
      }

      const type = activePunchType;
      const slot = activePunchSlot;
      const sid = storeId;
      const snapshot = punch;
      const b64 = photoBase64.replace(/^data:image\/\w+;base64,/, '');

      // Feedback imediato — upload segue em background; compressão é no servidor.
      setPunch(applyOptimisticPunch(punch, type, slot, geo.dist));
      setPhotoUri(null);
      setPhotoBase64(null);
      setPunchBusy(false);
      setPunchSyncing(true);
      if (isAttendant) setSelectedSlot(null);

      void (async () => {
        try {
          await punchTimeClock({
            storeId: sid,
            type,
            slot,
            latitude: geo.pos.coords.latitude,
            longitude: geo.pos.coords.longitude,
            accuracy: geo.pos.coords.accuracy ?? undefined,
            photoBase64: b64,
          });
          await loadPunch(sid);
        } catch (err) {
          const message = errorMessage(
            err,
            'Falha ao enviar o ponto. Tente novamente.',
          );
          setError(message);
          if (isForbidden(err)) {
            setAccessBlocked(true);
            clearScheduleState();
          } else {
            try {
              await loadPunch(sid);
            } catch {
              setPunch(snapshot);
            }
          }
        } finally {
          setPunchSyncing(false);
        }
      })();
    } catch (err) {
      setError(errorMessage(err, 'Falha ao bater ponto'));
      setPunchBusy(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Loading label="Carregando escala…" />
      </SafeAreaView>
    );
  }

  if (accessBlocked) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView
          contentContainerStyle={styles.blockedContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void onRefresh()}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
        >
          <View style={styles.helloRow}>
            <Text style={styles.hello}>Olá, {user?.name?.split(' ')[0] ?? 'colaborador'}!</Text>
            {user?.role === 'ATTENDANT' ? (
              <Pressable onPress={() => void logout()} hitSlop={8} style={styles.logoutBtn}>
                <Ionicons name="log-out-outline" size={22} color={colors.textMuted} />
                <Text style={styles.logoutText}>Sair</Text>
              </Pressable>
            ) : null}
          </View>
          <StateMessage
            emoji="🚫"
            title="Escala e ponto indisponíveis"
            subtitle={
              error
              ?? 'Sua conta ou horário está inativo. Fale com o gestor da unidade.'
            }
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <View style={styles.helloRow}>
          <Text style={styles.hello}>Olá, {user?.name?.split(' ')[0] ?? 'colaborador'}!</Text>
          {user?.role === 'ATTENDANT' ? (
            <Pressable onPress={() => void logout()} hitSlop={8} style={styles.logoutBtn}>
              <Ionicons name="log-out-outline" size={22} color={colors.textMuted} />
              <Text style={styles.logoutText}>Sair</Text>
            </Pressable>
          ) : null}
        </View>
        <Text style={styles.sub}>Confira sua escala de trabalho</Text>
        {storeName ? <Text style={styles.store}>Unidade: {storeName}</Text> : null}

        {error ? <StateMessage title="Atenção" subtitle={error} /> : null}

        <View style={styles.calCard}>
          <View style={styles.calHeader}>
            <View style={styles.calHeaderLeft}>
              <Ionicons name="calendar-outline" size={20} color={colors.primary} />
              <Text style={styles.calHeaderTitle}>Escala de Trabalho</Text>
            </View>
            <View style={styles.monthRow}>
              <Pressable onPress={() => shiftMonth(-1)} hitSlop={12}>
                <Ionicons name="chevron-back" size={20} color={colors.text} />
              </Pressable>
              <Text style={styles.monthTitle}>
                {MONTH_NAMES[month - 1]} / {year}
              </Text>
              <Pressable onPress={() => shiftMonth(1)} hitSlop={12}>
                <Ionicons name="chevron-forward" size={20} color={colors.text} />
              </Pressable>
            </View>
          </View>

          <View style={styles.weekRow}>
            {WEEKDAYS.map((w, i) => (
              <Text key={`${w}-${i}`} style={styles.weekLabel}>
                {w}
              </Text>
            ))}
          </View>
          <View style={styles.grid}>
            {calendarWeeks.map((week, wi) => (
              <View key={wi} style={styles.weekGridRow}>
                {week.map((cell, idx) => {
                  const entry = cell.date ? entryByDate.get(cell.date) : undefined;
                  const isSelected = cell.date === selectedDate;
                  const hasEntry = Boolean(entry);
                  const fill = entry ? dayFillColor(entry.dayType) : undefined;
                  return (
                    <Pressable
                      key={`${wi}-${idx}`}
                      style={styles.dayCell}
                      disabled={!cell.day}
                      onPress={() => cell.date && setSelectedDate(cell.date)}
                    >
                      {cell.day ? (
                        <View
                          style={[
                            styles.daySquare,
                            hasEntry && fill
                              ? { backgroundColor: fill }
                              : styles.daySquareEmpty,
                            isSelected && styles.daySelected,
                            isSelected && !hasEntry && styles.daySelectedEmpty,
                          ]}
                        >
                        <Text
                          style={[
                            styles.dayNum,
                            !hasEntry && styles.dayNumMuted,
                            hasEntry && { color: colors.primaryText },
                          ]}
                        >
                            {cell.day}
                          </Text>
                        </View>
                      ) : (
                        <View style={styles.daySquarePlaceholder} />
                      )}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Ionicons name="briefcase-outline" size={22} color={colors.success} />
            <Text style={styles.summaryLabel}>Efetivo</Text>
            <Text style={styles.summaryValue}>{summary.work} dias</Text>
          </View>
          <View style={styles.summaryCard}>
            <Ionicons name="time-outline" size={22} color={colors.warning} />
            <Text style={styles.summaryLabel}>Atestados</Text>
            <Text style={styles.summaryValue}>{summary.half} dias</Text>
          </View>
          <View style={styles.summaryCard}>
            <Ionicons name="bed-outline" size={22} color={colors.textFaint} />
            <Text style={styles.summaryLabel}>Folgas</Text>
            <Text style={styles.summaryValue}>{summary.off} dias</Text>
          </View>
        </View>

        {nextCommitment && nextBadgeColors ? (
          <View style={styles.nextSection}>
            <Text style={styles.sectionTitle}>Próximo compromisso</Text>
            <View style={styles.nextCard}>
              <View style={styles.nextUnitBanner}>
                <View style={styles.nextUnitIcon}>
                  <Ionicons name="location" size={16} color={colors.primary} />
                </View>
                <View style={styles.nextUnitTextBlock}>
                  <Text style={styles.nextUnitLabel}>Unidade do dia</Text>
                  <Text style={styles.nextUnitName}>
                    {nextCommitment.storeName ?? storeName ?? '—'}
                  </Text>
                </View>
              </View>
              <View style={styles.nextMetaRow}>
                <View style={styles.nextTextBlock}>
                  <Text style={styles.nextDate}>
                    {formatCommitmentDate(nextCommitment.date)}
                  </Text>
                  <Text style={styles.nextHours}>
                    {nextCommitment.startTime?.slice(0, 5)} às{' '}
                    {nextCommitment.endTime?.slice(0, 5)}
                  </Text>
                </View>
                <View style={[styles.nextBadge, { backgroundColor: nextBadgeColors.bg }]}>
                  <Text style={[styles.nextBadgeText, { color: nextBadgeColors.text }]}>
                    {SCHEDULE_DAY_TYPE_LABELS[nextCommitment.dayType]}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Bater ponto</Text>
          {storeName ? (
            <View style={styles.punchUnitBanner}>
              <Ionicons name="business-outline" size={16} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.punchUnitLabel}>Ponto nesta unidade</Text>
                <Text style={styles.punchUnitName}>{storeName}</Text>
              </View>
            </View>
          ) : null}
          <Text style={styles.hint}>
            Disponível a até {TIME_CLOCK_GEOFENCE_METERS} m da unidade. Foto obrigatória.
            {isAttendant
              ? ' Após ENT.1, toque no horário desejado (pode pular SAÍ.1 / ENT.2).'
              : ''}
          </Text>

          <View style={styles.slotsGrid}>
            {(['ent1', 'sai1', 'ent2', 'sai2'] as PunchSlotKey[]).map((key) => {
              const time = punchSlots[key];
              const isFilled = Boolean(time);
              const canSelect =
                isAttendant
                && !dayComplete
                && !punchSyncing
                && !isFilled
                && (key === 'ent1' || Boolean(punchSlots.ent1));
              const isNext = !dayComplete && activePunchSlot === key && !time;
              const Cell = canSelect ? Pressable : View;
              return (
                <Cell
                  key={key}
                  style={[
                    styles.slotCell,
                    isNext && styles.slotCellNext,
                    canSelect && styles.slotCellSelectable,
                  ]}
                  onPress={canSelect ? () => setSelectedSlot(key) : undefined}
                >
                  <Text style={[styles.slotLabel, isNext && styles.slotLabelNext]}>
                    {PUNCH_SLOT_LABELS[key]}
                  </Text>
                  <Text style={[styles.slotTime, time ? styles.slotTimeFilled : null]}>
                    {time ?? '--:--'}
                  </Text>
                </Cell>
              );
            })}
          </View>

          {dayComplete ? (
            <Text style={styles.punchStatus}>Ponto do dia completo</Text>
          ) : punch ? (
            <Text style={styles.punchStatus}>
              {activePunchSlot
                ? `Próximo: ${activePunchType === 'CLOCK_OUT' ? 'Saída' : 'Entrada'} · ${PUNCH_SLOT_LABELS[activePunchSlot]}`
                : isAttendant
                  ? 'Toque em SAÍ.1, ENT.2 ou SAÍ.2 para escolher o próximo ponto'
                  : 'Próximo ponto'}
            </Text>
          ) : null}
          {punchSyncing ? (
            <View style={styles.syncRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.syncText}>
                Ponto registrado · enviando ao servidor…
              </Text>
            </View>
          ) : null}
          {distanceM != null ? (
            <Text style={styles.hint}>
              Distância atual: ~{Math.round(distanceM)} m
              {distanceM > TIME_CLOCK_GEOFENCE_METERS ? ' (fora do raio)' : ' (ok)'}
            </Text>
          ) : null}

          {!dayComplete ? (
            <>
              <View style={styles.punchActions}>
                <Pressable
                  style={[styles.secondaryBtn, punchSyncing && styles.btnDisabled]}
                  disabled={punchSyncing}
                  onPress={() => void refreshDistance()}
                >
                  <Text style={styles.secondaryBtnText}>Atualizar GPS</Text>
                </Pressable>
                <Pressable
                  style={[styles.secondaryBtn, punchSyncing && styles.btnDisabled]}
                  disabled={punchSyncing}
                  onPress={() => void takePhoto()}
                >
                  <Text style={styles.secondaryBtnText}>Tirar foto</Text>
                </Pressable>
              </View>
              {photoUri ? (
                <Image source={{ uri: photoUri }} style={styles.preview} />
              ) : null}
              <Pressable
                style={[styles.primaryBtn, (!canSubmitPunch || punchBusy) && styles.btnDisabled]}
                disabled={!canSubmitPunch || punchBusy}
                onPress={() => void submitPunch()}
              >
                {punchBusy ? (
                  <ActivityIndicator color={colors.primaryText} />
                ) : (
                  <Text style={styles.primaryBtnText}>
                    {activePunchType === 'CLOCK_OUT' ? 'Registrar saída' : 'Registrar entrada'}
                    {activePunchSlot ? ` (${PUNCH_SLOT_LABELS[activePunchSlot]})` : ''}
                  </Text>
                )}
              </Pressable>
            </>
          ) : (
            <Text style={styles.hint}>
              ENT.1, SAÍ.1, ENT.2 e SAÍ.2 já registrados. Não é possível bater ponto novamente hoje.
            </Text>
          )}
        </View>
      </ScrollView>

      <Modal
        visible={!!selectedDate}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedDate(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {selectedDate
                ? new Date(selectedDate + 'T12:00:00').toLocaleDateString('pt-BR', {
                    weekday: 'long',
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric',
                  })
                : ''}
            </Text>
            {selectedEntry &&
            selectedEntry.dayType !== 'DAY_OFF' &&
            selectedEntry.dayType !== 'VACATION' &&
            (selectedEntry.storeName || storeName) ? (
              <View style={styles.modalUnitBanner}>
                <Ionicons name="location" size={16} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalUnitLabel}>Unidade do dia</Text>
                  <Text style={styles.modalUnitName}>
                    {selectedEntry.storeName ?? storeName}
                  </Text>
                </View>
              </View>
            ) : null}
            {selectedEntry ? (
              <>
                {!isNonWorkingScheduleDay(selectedEntry.dayType) ? (
                  <>
                    <View style={styles.modalMetaRow}>
                      <Text style={styles.modalLineFlex}>
                        Entrada {selectedEntry.startTime?.slice(0, 5)} · Saída{' '}
                        {selectedEntry.endTime?.slice(0, 5)}
                      </Text>
                      <View
                        style={[
                          styles.badge,
                          selectedEntry.dayType === 'HALF_DAY'
                            ? styles.badgeHalf
                            : styles.badgeWork,
                        ]}
                      >
                        <Text
                          style={[
                            styles.badgeText,
                            selectedEntry.dayType === 'HALF_DAY'
                              ? styles.badgeTextHalf
                              : styles.badgeTextWork,
                          ]}
                        >
                          {SCHEDULE_DAY_TYPE_LABELS[selectedEntry.dayType]}
                        </Text>
                      </View>
                    </View>
                    {selectedEntry.breakStart && selectedEntry.breakEnd ? (
                      <Text style={styles.modalLine}>
                        Intervalo {selectedEntry.breakStart.slice(0, 5)} –{' '}
                        {selectedEntry.breakEnd.slice(0, 5)}
                      </Text>
                    ) : null}
                  </>
                ) : (
                  <View style={styles.modalMetaRow}>
                    <Text style={styles.modalLineFlex}>Dia de folga</Text>
                    <View style={[styles.badge, styles.badgeOff]}>
                      <Text style={[styles.badgeText, styles.badgeTextOff]}>
                        {SCHEDULE_DAY_TYPE_LABELS[selectedEntry.dayType]}
                      </Text>
                    </View>
                  </View>
                )}
                {selectedEntry.notes ? (
                  <Text style={styles.modalNotes}>{selectedEntry.notes}</Text>
                ) : null}
              </>
            ) : (
              <Text style={styles.modalLine}>Sem escala cadastrada neste dia.</Text>
            )}
            <Pressable style={styles.primaryBtn} onPress={() => setSelectedDate(null)}>
              <Text style={styles.primaryBtnText}>Entendi</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  blockedContent: {
    flexGrow: 1,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
    justifyContent: 'center',
  },
  hello: { fontSize: 22, fontWeight: '700', color: colors.text, flex: 1 },
  helloRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  logoutText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  sub: { fontSize: 14, color: colors.textMuted, marginTop: -4 },
  store: { fontSize: 12, color: colors.textFaint },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  calCard: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  calHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  calHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 1,
  },
  calHeaderTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  monthTitle: { fontSize: 13, fontWeight: '600', color: colors.text },
  weekRow: { flexDirection: 'row', marginBottom: spacing.xs },
  weekLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    color: colors.textFaint,
    fontWeight: '600',
  },
  grid: { gap: 4 },
  weekGridRow: { flexDirection: 'row' },
  dayCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 3,
  },
  daySquare: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  daySquareEmpty: {
    backgroundColor: 'transparent',
  },
  daySquarePlaceholder: {
    width: 40,
    height: 40,
  },
  daySelected: {
    borderWidth: 2.5,
    borderColor: colors.text,
  },
  daySelectedEmpty: {
    backgroundColor: colors.surface,
  },
  dayNum: { fontSize: 15, color: colors.text, fontWeight: '700' },
  dayNumMuted: { color: colors.textFaint, fontWeight: '500' },
  summaryRow: { flexDirection: 'row', gap: spacing.sm },
  summaryCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: '400',
    color: colors.textMuted,
    textAlign: 'center',
  },
  summaryValue: { fontSize: 18, fontWeight: '700', color: colors.text, textAlign: 'center' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  nextSection: { gap: spacing.sm },
  nextCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: spacing.md,
  },
  nextUnitBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.infoBg,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#F0D5C4',
  },
  nextUnitIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextUnitTextBlock: { flex: 1, gap: 1 },
  nextUnitLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textMuted,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  nextUnitName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  nextMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  nextTextBlock: { flex: 1, gap: 2 },
  nextDate: { fontSize: 14, fontWeight: '700', color: colors.text },
  nextHours: { fontSize: 13, color: colors.textMuted },
  nextBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  nextBadgeText: { fontSize: 12, fontWeight: '600' },
  punchUnitBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.infoBg,
    borderRadius: radius.sm,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#F0D5C4',
  },
  punchUnitLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textMuted,
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  punchUnitName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  hint: { fontSize: 12, color: colors.textMuted },
  punchStatus: { fontSize: 13, color: colors.text, fontWeight: '600' },
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  syncText: { flex: 1, fontSize: 12, color: colors.primary, fontWeight: '500' },
  punchActions: { flexDirection: 'row', gap: spacing.sm },
  slotsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  slotCell: {
    width: '47%',
    flexGrow: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: 2,
  },
  slotCellSelectable: {
    borderStyle: 'dashed' as const,
  },
  slotCellNext: {
    borderColor: colors.primary,
    borderWidth: 1.5,
    backgroundColor: colors.surface,
  },
  slotLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textFaint,
    letterSpacing: 0.3,
  },
  slotLabelNext: {
    color: colors.primary,
  },
  slotTime: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textFaint,
    fontVariant: ['tabular-nums'],
  },
  slotTimeFilled: {
    color: colors.text,
  },
  secondaryBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 10,
    alignItems: 'center',
  },
  secondaryBtnText: { color: colors.text, fontWeight: '600', fontSize: 13 },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  primaryBtnText: { color: colors.primaryText, fontWeight: '700', fontSize: 15 },
  btnDisabled: { opacity: 0.6 },
  preview: {
    width: '100%',
    height: 160,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.sm,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    textTransform: 'capitalize',
  },
  modalUnitBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.infoBg,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#F0D5C4',
    marginTop: spacing.xs,
  },
  modalUnitLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textMuted,
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  modalUnitName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  modalMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  modalLine: { fontSize: 14, color: colors.textMuted },
  modalLineFlex: { flex: 1, fontSize: 14, color: colors.textMuted },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  badgeWork: { backgroundColor: colors.successBg },
  badgeHalf: { backgroundColor: colors.warningBg },
  badgeOff: { backgroundColor: colors.surfaceAlt },
  badgeText: { fontSize: 12, fontWeight: '600' },
  badgeTextWork: { color: colors.successText },
  badgeTextHalf: { color: colors.warningText },
  badgeTextOff: { color: colors.textMuted },
  modalNotes: { fontSize: 13, color: colors.text, marginTop: 4 },
});
