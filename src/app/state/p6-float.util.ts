// src/app/state/p6-float.util.ts
export function isCriticalTaskRow(
  t: any,
  optsOrHpd: number | { hoursPerDay?: number; epsilonHours?: number } = 8,
): boolean {
  // ---- options & tolerances ----
  const hoursPerDay = typeof optsOrHpd === 'number' ? optsOrHpd : (optsOrHpd.hoursPerDay ?? 8);
  const epsilonHours = typeof optsOrHpd === 'number'
    ? Math.max(1, Math.round(hoursPerDay * 0.05))       // ~5% HPD, но не меньше 1ч
    : (optsOrHpd.epsilonHours ?? Math.max(1, Math.round(hoursPerDay * 0.05)));

  // ---- helpers ----
  const pickProp = <T = unknown>(obj: any, keys: string[]): T | undefined => {
    if (!obj) return undefined as any;
    for (const k of keys) {
      if (Object.prototype.hasOwnProperty.call(obj, k)) return obj[k] as T;
      const found = Object.keys(obj).find(ok => ok.toLowerCase() === k.toLowerCase());
      if (found) return obj[found] as T;
    }
    return undefined as any;
  };
  const toNum = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    const s = String(v).replace(/[\s,]+/g, '');
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };
  const toDate = (v: unknown): Date | null => {
    if (!v) return null;
    const d = v instanceof Date ? v : new Date(String(v).replace(' ', 'T'));
    return Number.isFinite(d.valueOf()) ? d : null;
  };
  const diffH = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 3_600_000;

  // ---- 1) Явные ЧАСЫ Total Float ----
  const tfh = toNum(pickProp(t, ['total_float_hr_cnt','TotalFloatHours','TF_Hours','tf_hours']));
  if (tfh != null) return tfh <= epsilonHours; // допускаем небольшой дрейф

  // ---- 2) Явные ДНИ Total Float ----
  const tfd = toNum(pickProp(t, ['total_float_day_cnt','TotalFloatDays','TF_Days','tf_days']));
  if (tfd != null) return (tfd * hoursPerDay) <= epsilonHours;

  // ---- 3) Пара TotalFloat + Units (XER/XML) → перевод в часы ----
  const tf = toNum(pickProp(t, ['TotalFloat','total_float','TF','Float']));
  if (tf != null) {
    const uRaw = pickProp(t, ['TotalFloatUnits','FloatUnits','Units','DurationUnits']);
    const u = String(uRaw ?? '').trim().toUpperCase();
    let tfHours = tf; // по умолчанию считаем часы
    if (u === 'D' || u === 'DAY' || u === 'DAYS') tfHours = tf * hoursPerDay;
    else if (u === 'W' || u === 'WK' || u === 'WKS' || u === 'WEEK' || u === 'WEEKS') tfHours = tf * hoursPerDay * 5;
    else if (u === 'MO' || u === 'MON' || u === 'MONS' || u === 'MONTH' || u === 'MONTHS') tfHours = tf * hoursPerDay * 21.667;
    else if (u === 'Y' || u === 'YR' || u === 'YRS' || u === 'YEAR' || u === 'YEARS') tfHours = tf * hoursPerDay * 260;
    // H/HR/HRS/HOUR/HOURS или пустые → уже часы
    return tfHours <= epsilonHours;
  }

  // ---- 4) Расчёт по датам: min(LF−EF, LS−ES) в часах с допуском ----
  const ES = toDate(pickProp(t, ['early_start_date','EarlyStart']));
  const EF = toDate(pickProp(t, ['early_end_date','EarlyFinish']));
  const LS = toDate(pickProp(t, ['late_start_date','LateStart']));
  const LF = toDate(pickProp(t, ['late_end_date','LateFinish']));
  const diffs: number[] = [];
  if (EF && LF) diffs.push(diffH(EF, LF));
  if (ES && LS) diffs.push(diffH(ES, LS));
  if (diffs.length) return Math.min(...diffs) <= epsilonHours;

  // ---- 5) Фолбэки-маркеры (Longest Path/FloatPath) ----
  const fp  = toNum(pickProp(t, ['float_path','FloatPath']));
  const fpo = toNum(pickProp(t, ['float_path_order','FloatPathOrder']));
  if (fp === 1 || fpo === 1) return true;
  const lp = pickProp(t, ['OnLongestPath','IsOnLongestPath','Critical']);
  if (lp !== undefined) {
    const s = String(lp).trim().toLowerCase();
    if (['y','yes','true','1'].includes(s)) return true;
  }

  return false;
}