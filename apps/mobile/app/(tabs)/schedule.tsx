import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
  punchTimeClock,
  type ScheduleEntryDto,
  type TimeClockMe,
} from '@/lib/schedules';
import { colors, radius, spacing } from '@/theme';

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

function dayColor(type: ScheduleDayType | undefined) {
  if (!type) return colors.border;
  if (type === 'WORK') return colors.success;
  if (type === 'HALF_DAY') return colors.warning;
  return colors.textFaint;
}

export default function ScheduleScreen() {
  const { user } = useAuth();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [loading, setLoading] = useState(true);
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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMySchedule(year, month);
      setStoreId(data.store.id);
      setStoreName(data.store.name);
      setStoreLat(data.store.latitude);
      setStoreLng(data.store.longitude);
      setEntries(data.collaborators[0]?.entries ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar escala');
    } finally {
      setLoading(false);
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

  const calendarCells = useMemo(() => {
    const first = new Date(year, month - 1, 1);
    const startPad = first.getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    const cells: Array<{ day: number | null; date: string | null }> = [];
    for (let i = 0; i < startPad; i++) cells.push({ day: null, date: null });
    for (let d = 1; d <= daysInMonth; d++) {
      const date = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ day: d, date });
    }
    return cells;
  }, [year, month]);

  const nextCommitment = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = entries
      .filter((e) => e.date >= today && e.dayType !== 'DAY_OFF')
      .sort((a, b) => a.date.localeCompare(b.date));
    return upcoming[0] ?? null;
  }, [entries]);

  const selectedEntry = selectedDate ? entryByDate.get(selectedDate) : undefined;

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
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.hello}>Olá, {user?.name?.split(' ')[0] ?? 'entregador'}!</Text>
        <Text style={styles.sub}>Confira sua escala de trabalho</Text>
        {storeName ? <Text style={styles.store}>Unidade: {storeName}</Text> : null}

        {error ? <StateMessage title="Atenção" subtitle={error} /> : null}

        <View style={styles.card}>
          <View style={styles.monthRow}>
            <Pressable onPress={() => shiftMonth(-1)} hitSlop={12}>
              <Text style={styles.monthNav}>‹</Text>
            </Pressable>
            <Text style={styles.monthTitle}>
              {MONTH_NAMES[month - 1]} {year}
            </Text>
            <Pressable onPress={() => shiftMonth(1)} hitSlop={12}>
              <Text style={styles.monthNav}>›</Text>
            </Pressable>
          </View>

          <View style={styles.weekRow}>
            {WEEKDAYS.map((w, i) => (
              <Text key={`${w}-${i}`} style={styles.weekLabel}>
                {w}
              </Text>
            ))}
          </View>
          <View style={styles.grid}>
            {calendarCells.map((cell, idx) => {
              const entry = cell.date ? entryByDate.get(cell.date) : undefined;
              const isSelected = cell.date === selectedDate;
              return (
                <Pressable
                  key={idx}
                  style={[styles.dayCell, isSelected && styles.daySelected]}
                  disabled={!cell.day}
                  onPress={() => cell.date && setSelectedDate(cell.date)}
                >
                  {cell.day ? (
                    <>
                      <Text style={styles.dayNum}>{cell.day}</Text>
                      <View
                        style={[styles.dot, { backgroundColor: dayColor(entry?.dayType) }]}
                      />
                    </>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{summary.work}</Text>
            <Text style={styles.summaryLabel}>Trabalhados</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{summary.half}</Text>
            <Text style={styles.summaryLabel}>Meias jornadas</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{summary.off}</Text>
            <Text style={styles.summaryLabel}>Folgas</Text>
          </View>
        </View>

        {nextCommitment ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Próximo compromisso</Text>
            <Text style={styles.nextDate}>
              {new Date(nextCommitment.date + 'T12:00:00').toLocaleDateString('pt-BR', {
                weekday: 'long',
                day: '2-digit',
                month: 'long',
              })}
            </Text>
            <Text style={styles.nextHours}>
              {nextCommitment.startTime?.slice(0, 5)} às {nextCommitment.endTime?.slice(0, 5)}
              {' · '}
              {SCHEDULE_DAY_TYPE_LABELS[nextCommitment.dayType]}
            </Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Bater ponto</Text>
          <Text style={styles.hint}>
            Disponível a até {TIME_CLOCK_GEOFENCE_METERS} m da unidade. Foto obrigatória.
          </Text>
          {punch ? (
            <Text style={styles.punchStatus}>
              Próximo: {punch.nextType === 'CLOCK_IN' ? 'Entrada' : 'Saída'}
              {punch.punches.length
                ? ` · ${punch.punches.length} registro(s) hoje`
                : ' · nenhum registro hoje'}
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
            style={[styles.primaryBtn, punchBusy && styles.btnDisabled]}
            disabled={punchBusy}
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
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  monthTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  monthNav: { fontSize: 28, color: colors.primary, paddingHorizontal: 8 },
  weekRow: { flexDirection: 'row' },
  weekLabel: {
    width: `${100 / 7}%`,
    textAlign: 'center',
    fontSize: 11,
    color: colors.textFaint,
    fontWeight: '600',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  daySelected: {
    borderWidth: 2,
    borderColor: colors.text,
    borderRadius: radius.sm,
  },
  dayNum: { fontSize: 13, color: colors.text, fontWeight: '500' },
  dot: { width: 7, height: 7, borderRadius: 4 },
  summaryRow: { flexDirection: 'row', gap: spacing.sm },
  summaryCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  summaryValue: { fontSize: 20, fontWeight: '700', color: colors.text },
  summaryLabel: { fontSize: 11, color: colors.textMuted, textAlign: 'center' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  nextDate: { fontSize: 14, color: colors.text, textTransform: 'capitalize' },
  nextHours: { fontSize: 13, color: colors.textMuted },
  hint: { fontSize: 12, color: colors.textMuted },
  punchStatus: { fontSize: 13, color: colors.text, fontWeight: '600' },
  punchActions: { flexDirection: 'row', gap: spacing.sm },
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
