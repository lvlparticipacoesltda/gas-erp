import { useCallback, useEffect, useMemo, useState } from 'react';
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
  haversineDistanceMeters,
  type ScheduleDayType,
} from '@gas-erp/shared';
import { Loading, StateMessage } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import {
  fetchMySchedule,
  fetchMyTimeClock,
  mapPunchesToSlots,
  nextPunchSlot,
  punchTimeClock,
  PUNCH_SLOT_LABELS,
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

function dayFillColor(type: ScheduleDayType) {
  if (type === 'WORK') return colors.success;
  if (type === 'HALF_DAY') return colors.warning;
  return colors.textFaint;
}

function dayTypeBadgeColors(type: ScheduleDayType) {
  if (type === 'WORK') return { bg: colors.successBg, text: colors.successText };
  if (type === 'HALF_DAY') return { bg: colors.warningBg, text: colors.warningText };
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
  const { user } = useAuth();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<ScheduleEntryDto[]>([]);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [storeName, setStoreName] = useState<string>('');
  const [storeLat, setStoreLat] = useState<number | null>(null);
  const [storeLng, setStoreLng] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [punch, setPunch] = useState<TimeClockMe | null>(null);
  const [punchBusy, setPunchBusy] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [distanceM, setDistanceM] = useState<number | null>(null);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const data = await fetchMySchedule(year, month);
      setStoreId(data.store.id);
      setStoreName(data.store.name);
      setStoreLat(data.store.latitude);
      setStoreLng(data.store.longitude);
      setEntries(data.collaborators[0]?.entries ?? []);
      return data.store.id as string | null;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar escala');
      return null;
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [year, month]);

  const loadPunch = useCallback(async (sid: string) => {
    try {
      const data = await fetchMyTimeClock(sid);
      setPunch(data);
    } catch {
      setPunch(null);
    }
  }, []);

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
      .filter((e) => e.date >= today && e.dayType !== 'DAY_OFF')
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

  const activePunchSlot = useMemo(
    () => (punch ? nextPunchSlot(punch.punches) : 'ent1'),
    [punch],
  );

  function shiftMonth(delta: number) {
    const d = new Date(year, month - 1 + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  }

  async function refreshDistance() {
    if (storeLat == null || storeLng == null) {
      setDistanceM(null);
      return null;
    }
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      setError('Permissão de localização necessária para bater o ponto.');
      return null;
    }
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const dist = haversineDistanceMeters(
      pos.coords.latitude,
      pos.coords.longitude,
      storeLat,
      storeLng,
    );
    setDistanceM(dist);
    return { pos, dist };
  }

  async function takePhoto() {
    const cam = await ImagePicker.requestCameraPermissionsAsync();
    if (!cam.granted) {
      setError('Permissão de câmera necessária para a foto do ponto.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.4,
      base64: true,
      allowsEditing: false,
      exif: false,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setPhotoUri(asset.uri);
    setPhotoBase64(asset.base64 ?? null);
  }

  async function submitPunch() {
    if (!storeId || !punch) return;
    setPunchBusy(true);
    setError(null);
    try {
      const geo = await refreshDistance();
      if (!geo) throw new Error('Não foi possível obter o GPS.');
      if (geo.dist > TIME_CLOCK_GEOFENCE_METERS) {
        throw new Error(
          `Você está a ~${Math.round(geo.dist)} m da unidade. Aproxime-se (máx. ${TIME_CLOCK_GEOFENCE_METERS} m).`,
        );
      }
      if (!photoBase64) throw new Error('Tire uma foto para validar o ponto.');

      await punchTimeClock({
        storeId,
        type: punch.nextType,
        latitude: geo.pos.coords.latitude,
        longitude: geo.pos.coords.longitude,
        accuracy: geo.pos.coords.accuracy ?? undefined,
        photoBase64,
      });
      setPhotoUri(null);
      setPhotoBase64(null);
      await loadPunch(storeId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao bater ponto');
    } finally {
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
        <Text style={styles.hello}>Olá, {user?.name?.split(' ')[0] ?? 'entregador'}!</Text>
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
            <Text style={styles.summaryLabel}>Meias jornadas</Text>
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
              <Ionicons name="calendar-outline" size={22} color={colors.success} />
              <View style={styles.nextTextBlock}>
                <Text style={styles.nextDate}>
                  {formatCommitmentDate(nextCommitment.date)}
                </Text>
                <Text style={styles.nextHours}>
                  {nextCommitment.startTime?.slice(0, 5)} às{' '}
                  {nextCommitment.endTime?.slice(0, 5)}
                </Text>
                {nextCommitment.storeName ? (
                  <Text style={styles.nextStore}>Unidade: {nextCommitment.storeName}</Text>
                ) : storeName ? (
                  <Text style={styles.nextStore}>Unidade: {storeName}</Text>
                ) : null}
              </View>
              <View style={[styles.nextBadge, { backgroundColor: nextBadgeColors.bg }]}>
                <Text style={[styles.nextBadgeText, { color: nextBadgeColors.text }]}>
                  {SCHEDULE_DAY_TYPE_LABELS[nextCommitment.dayType]}
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Bater ponto</Text>
          <Text style={styles.hint}>
            Disponível a até {TIME_CLOCK_GEOFENCE_METERS} m da unidade. Foto obrigatória.
          </Text>

          <View style={styles.slotsGrid}>
            {(['ent1', 'sai1', 'ent2', 'sai2'] as PunchSlotKey[]).map((key) => {
              const time = punchSlots[key];
              const isNext = activePunchSlot === key && !time;
              return (
                <View
                  key={key}
                  style={[styles.slotCell, isNext && styles.slotCellNext]}
                >
                  <Text style={[styles.slotLabel, isNext && styles.slotLabelNext]}>
                    {PUNCH_SLOT_LABELS[key]}
                  </Text>
                  <Text style={[styles.slotTime, time ? styles.slotTimeFilled : null]}>
                    {time ?? '--:--'}
                  </Text>
                </View>
              );
            })}
          </View>

          {punch ? (
            <Text style={styles.punchStatus}>
              Próximo: {punch.nextType === 'CLOCK_IN' ? 'Entrada' : 'Saída'}
              {' · '}
              {PUNCH_SLOT_LABELS[activePunchSlot]}
            </Text>
          ) : null}
          {distanceM != null ? (
            <Text style={styles.hint}>
              Distância atual: ~{Math.round(distanceM)} m
              {distanceM > TIME_CLOCK_GEOFENCE_METERS ? ' (fora do raio)' : ' (ok)'}
            </Text>
          ) : null}

          <View style={styles.punchActions}>
            <Pressable style={styles.secondaryBtn} onPress={() => void refreshDistance()}>
              <Text style={styles.secondaryBtnText}>Atualizar GPS</Text>
            </Pressable>
            <Pressable style={styles.secondaryBtn} onPress={() => void takePhoto()}>
              <Text style={styles.secondaryBtnText}>Tirar foto</Text>
            </Pressable>
          </View>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.preview} />
          ) : null}
          <Pressable
            style={[styles.primaryBtn, (!canPunch || punchBusy) && styles.btnDisabled]}
            disabled={!canPunch || punchBusy}
            onPress={() => void submitPunch()}
          >
            {punchBusy ? (
              <ActivityIndicator color={colors.primaryText} />
            ) : (
              <Text style={styles.primaryBtnText}>
                {punch?.nextType === 'CLOCK_OUT' ? 'Registrar saída' : 'Registrar entrada'}
              </Text>
            )}
          </Pressable>
        </View>
      </ScrollView>

      <Modal visible={!!selectedDate} animationType="slide" transparent>
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
            {selectedEntry ? (
              <>
                {selectedEntry.storeName || storeName ? (
                  <Text style={styles.modalLine}>
                    Unidade: {selectedEntry.storeName ?? storeName}
                  </Text>
                ) : null}
                <Text style={styles.badge}>
                  {SCHEDULE_DAY_TYPE_LABELS[selectedEntry.dayType]}
                </Text>
                {selectedEntry.dayType !== 'DAY_OFF' ? (
                  <>
                    <Text style={styles.modalLine}>
                      Entrada {selectedEntry.startTime?.slice(0, 5)} · Saída{' '}
                      {selectedEntry.endTime?.slice(0, 5)}
                    </Text>
                    {selectedEntry.breakStart && selectedEntry.breakEnd ? (
                      <Text style={styles.modalLine}>
                        Intervalo {selectedEntry.breakStart.slice(0, 5)} –{' '}
                        {selectedEntry.breakEnd.slice(0, 5)}
                      </Text>
                    ) : null}
                  </>
                ) : (
                  <Text style={styles.modalLine}>Dia de folga</Text>
                )}
                {selectedEntry.notes ? (
                  <Text style={styles.modalNotes}>{selectedEntry.notes}</Text>
                ) : null}
              </>
            ) : (
              <>
                {storeName ? (
                  <Text style={styles.modalLine}>Unidade: {storeName}</Text>
                ) : null}
                <Text style={styles.modalLine}>Sem escala cadastrada neste dia.</Text>
              </>
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
  hello: { fontSize: 22, fontWeight: '700', color: colors.text },
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
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  nextTextBlock: { flex: 1, gap: 2 },
  nextDate: { fontSize: 14, fontWeight: '700', color: colors.text },
  nextHours: { fontSize: 13, color: colors.textMuted },
  nextStore: { fontSize: 12, color: colors.textFaint, marginTop: 2 },
  nextBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  nextBadgeText: { fontSize: 12, fontWeight: '600' },
  hint: { fontSize: 12, color: colors.textMuted },
  punchStatus: { fontSize: 13, color: colors.text, fontWeight: '600' },
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
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.successBg,
    color: colors.successText,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.sm,
    fontSize: 12,
    fontWeight: '600',
  },
  modalLine: { fontSize: 14, color: colors.textMuted },
  modalNotes: { fontSize: 13, color: colors.text, marginTop: 4 },
});
