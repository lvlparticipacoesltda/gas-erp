import {
  TIME_CLOCK_LATE_GRACE_MINUTES,
  computeTimeClockDayTotals,
  formatMinutesComma,
  formatMinutesCommaOrNull,
  intervalsFromSlots,
  makeInterval,
  nightOverlapMinutes,
  parseHmToMinutes,
} from '../dist/time-clock-totals.js';

function assert(label, condition) {
  if (!condition) {
    console.error('FAIL:', label);
    process.exitCode = 1;
  } else {
    console.log('OK:', label);
  }
}

assert('grace is 10', TIME_CLOCK_LATE_GRACE_MINUTES === 10);
assert('parse 10:27', parseHmToMinutes('10:27') === 10 * 60 + 27);
assert('format 7h46', formatMinutesComma(7 * 60 + 46) === '07,46');
assert('format zero null', formatMinutesCommaOrNull(0) === null);

const nightBit = nightOverlapMinutes(makeInterval(21 * 60, 22 * 60 + 30));
assert('night overlap 22:00-22:30 = 30', nightBit === 30);

// Dia padrão sem extra: 10:00-14:30 + 15:30-19:00, batidas iguais
{
  const scheduled = intervalsFromSlots({
    ent1: '10:00',
    sai1: '14:30',
    ent2: '15:30',
    sai2: '19:00',
  });
  const worked = intervalsFromSlots({
    ent1: '10:00',
    sai1: '14:30',
    ent2: '15:30',
    sai2: '19:00',
  });
  const r = computeTimeClockDayTotals({
    isWorkDay: true,
    scheduled,
    worked,
    scheduledStartMinutes: parseHmToMinutes('10:00'),
    scheduledEndMinutes: parseHmToMinutes('19:00'),
    firstInMinutes: parseHmToMinutes('10:00'),
    lastOutMinutes: parseHmToMinutes('19:00'),
  });
  assert('normais 8h', r.totalNormaisMinutes === 8 * 60);
  assert('sem noturno', r.totalNoturnoMinutes === 0);
  assert('sem extra', r.extraDiurnaMinutes === 0 && r.extraNoturnaMinutes === 0);
  assert('sem falta', r.diaFaltaMinutes === 0 && r.faltaEAtrasoMinutes === 0);
}

// Saída após 22h
{
  const scheduled = intervalsFromSlots({
    ent1: '10:00',
    sai1: '14:30',
    ent2: '15:30',
    sai2: '19:00',
  });
  const worked = intervalsFromSlots({
    ent1: '10:00',
    sai1: '14:30',
    ent2: '15:30',
    sai2: '22:30',
  });
  const r = computeTimeClockDayTotals({
    isWorkDay: true,
    scheduled,
    worked,
    scheduledStartMinutes: parseHmToMinutes('10:00'),
    scheduledEndMinutes: parseHmToMinutes('19:00'),
    firstInMinutes: parseHmToMinutes('10:00'),
    lastOutMinutes: parseHmToMinutes('22:30'),
  });
  assert('normais capped 8h', r.totalNormaisMinutes === 8 * 60);
  assert('noturno 30min', r.totalNoturnoMinutes === 30);
  assert('extra diurna 3h', r.extraDiurnaMinutes === 3 * 60);
  assert('extra noturna 30', r.extraNoturnaMinutes === 30);
  assert('extra 50d = diurna', r.extra50dMinutes === r.extraDiurnaMinutes);
  assert('banco = extras', r.bancoTotalMinutes === r.extraDiurnaMinutes + r.extraNoturnaMinutes);
}

// Falta integral
{
  const scheduled = intervalsFromSlots({
    ent1: '10:00',
    sai1: '14:30',
    ent2: '15:30',
    sai2: '19:00',
  });
  const r = computeTimeClockDayTotals({
    isWorkDay: true,
    scheduled,
    worked: [],
    scheduledStartMinutes: parseHmToMinutes('10:00'),
    scheduledEndMinutes: parseHmToMinutes('19:00'),
  });
  assert('dia falta 8h', r.diaFaltaMinutes === 8 * 60);
  assert('sem atraso separado', r.faltaEAtrasoMinutes === 0);
}

// Atraso > 10 min
{
  const scheduled = intervalsFromSlots({
    ent1: '10:00',
    sai1: '14:30',
    ent2: '15:30',
    sai2: '19:00',
  });
  const worked = intervalsFromSlots({
    ent1: '10:25',
    sai1: '14:30',
    ent2: '15:30',
    sai2: '19:00',
  });
  const r = computeTimeClockDayTotals({
    isWorkDay: true,
    scheduled,
    worked,
    scheduledStartMinutes: parseHmToMinutes('10:00'),
    scheduledEndMinutes: parseHmToMinutes('19:00'),
    firstInMinutes: parseHmToMinutes('10:25'),
    lastOutMinutes: parseHmToMinutes('19:00'),
  });
  assert('atraso 15min', r.faltaEAtrasoMinutes === 15);
}

// Folga sem batida
{
  const r = computeTimeClockDayTotals({
    isWorkDay: false,
    scheduled: [],
    worked: [],
  });
  assert('folga vazia', r.totalNormaisMinutes === 0 && r.diaFaltaMinutes === 0);
}

// Banco acumulado (simulação mês)
{
  let saldo = 0;
  const days = [
    computeTimeClockDayTotals({
      isWorkDay: true,
      scheduled: intervalsFromSlots({ ent1: '08:00', sai1: '12:00', ent2: '13:00', sai2: '17:00' }),
      worked: intervalsFromSlots({ ent1: '08:00', sai1: '12:00', ent2: '13:00', sai2: '18:00' }),
      scheduledStartMinutes: 8 * 60,
      scheduledEndMinutes: 17 * 60,
      firstInMinutes: 8 * 60,
      lastOutMinutes: 18 * 60,
    }),
    computeTimeClockDayTotals({
      isWorkDay: true,
      scheduled: intervalsFromSlots({ ent1: '08:00', sai1: '12:00', ent2: '13:00', sai2: '17:00' }),
      worked: intervalsFromSlots({ ent1: '08:00', sai1: '12:00', ent2: '13:00', sai2: '17:30' }),
      scheduledStartMinutes: 8 * 60,
      scheduledEndMinutes: 17 * 60,
      firstInMinutes: 8 * 60,
      lastOutMinutes: 17 * 60 + 30,
    }),
  ];
  const saldos = days.map((d) => {
    saldo += d.bancoTotalMinutes;
    return saldo;
  });
  assert('banco dia1 60', days[0].bancoTotalMinutes === 60);
  assert('banco dia2 30', days[1].bancoTotalMinutes === 30);
  assert('saldo acumula 90', saldos[1] === 90);
}

if (process.exitCode) {
  console.error('time-clock-totals verification failed');
  process.exit(process.exitCode);
}
console.log('time-clock-totals OK');
