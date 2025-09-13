// parser/mapper/calendar.mapper.ts — Calendar XML → CALENDAR row
import type { P6Scalar } from '../parser.types.ts';

/* ===== helpers ===== */
function txt(el: Element, tag: string): string {
  const n = el.getElementsByTagName(tag)[0];
  return n?.textContent?.trim() ?? '';
}
function num(el: Element, tag: string): number | null {
  const s = txt(el, tag);
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function dt(el: Element, tag: string): Date | null {
  const s = txt(el, tag);
  if (!s) return null;
  const iso = s.includes('T') ? s : s.length === 10 ? `${s}T00:00:00` : s.replace(' ', 'T');
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}
function anyTxt(el: Element, tags: string[]): string | null {
  for (const t of tags) {
    const v = txt(el, t);
    if (v) return v;
  }
  return null;
}
function anyNum(el: Element, tags: string[]): number | null {
  for (const t of tags) {
    const v = num(el, t);
    if (v !== null) return v;
  }
  return null;
}
function anyDt(el: Element, tags: string[]): Date | null {
  for (const t of tags) {
    const v = dt(el, t);
    if (v) return v;
  }
  return null;
}
function ynOrNum(el: Element, tags: string[]): string | number | null {
  const s = anyTxt(el, tags);
  if (s) {
    const low = s.trim().toLowerCase();
    if (['y','yes','true','1'].includes(low)) return 'Y';
    if (['n','no','false','0'].includes(low)) return 'N';
    const n = Number(s);
    if (Number.isFinite(n)) return n;
  }
  const n2 = anyNum(el, tags);
  return Number.isFinite(n2 as number) ? (n2 as number) : null;
}

function flag10FromYnOrNum(v: string | number | null): 1 | 0 | null {
  if (v == null) return null;
  if (typeof v === 'number') return v > 0 ? 1 : 0;
  return v === 'Y' ? 1 : 0;
}

function round2(n: number): number { return Math.round(n * 100) / 100; }

// Эффективные часы/день и часы/неделя по доступным полям, без изменения исходной логики
function calcHoursPerDay(day: number | null, week: number | null, month: number | null, year: number | null): number | null {
  if (day != null && day > 0) return round2(day);
  if (week != null && week > 0) return round2(week / 5);                 // предположим 5 раб. дней
  if (month != null && month > 0) return round2(month / 21.667);         // ≈ 4.333 недели * 5 дней
  if (year != null && year > 0) return round2(year / 260);               // 52 недели * 5 дней
  return null;
}
function calcHoursPerWeek(day: number | null, week: number | null, month: number | null, year: number | null): number | null {
  if (week != null && week > 0) return round2(week);
  const hpday = calcHoursPerDay(day, null, null, null);
  if (hpday != null) return round2(hpday * 5);
  if (month != null && month > 0) return round2((month / 21.667) * 5);
  if (year != null && year > 0) return round2((year / 260) * 5);
  return null;
}

// Нормализованный «scope» календаря, полезно для DCMA-дашборда
function scopeNorm(proj_id: number | null, rsrc_private: string | number | null): 'GLOBAL' | 'PROJECT' | 'RESOURCE' | 'UNKNOWN' {
  if (proj_id != null && Number.isFinite(proj_id)) return 'PROJECT';
  if (rsrc_private != null) {
    const f = flag10FromYnOrNum(rsrc_private);
    if (f === 1) return 'RESOURCE';
    if (f === 0) return 'GLOBAL';
  }
  return 'UNKNOWN';
}

/* ===== mapper ===== */
export function mapCalendarToCalendarRow(
  c: Element,
  fallbackProjId: number | null = null
): Record<string, P6Scalar> | null {
  const clndr_id = anyNum(c, ['ObjectId','CalendarObjectId']);
  if (!Number.isFinite(clndr_id as number)) {
    console.warn('[P6-XML] CALENDAR пропущен (нет валидного ObjectId)');
    return null;
  }

  const base_clndr_id = anyNum(c, ['BaseCalendarObjectId','BaseClndrObjectId','BaseObjectId']);

  const clndr_name = anyTxt(c, ['Name','CalendarName']);
  const clndr_type_num = anyNum(c, ['CalendarType','Type']);
  const clndr_type_txt = anyTxt(c, ['CalendarType','Type']);
  const clndr_type: string | number | null =
    Number.isFinite(clndr_type_num as number) ? (clndr_type_num as number) : (clndr_type_txt ?? null);

  const day_hr_cnt   = anyNum(c, ['HoursPerDay','WorkHoursPerDay','DayHrCnt']);
  const week_hr_cnt  = anyNum(c, ['HoursPerWeek','WorkHoursPerWeek','WeekHrCnt']);
  const month_hr_cnt = anyNum(c, ['HoursPerMonth','WorkHoursPerMonth','MonthHrCnt']);
  const year_hr_cnt  = anyNum(c, ['HoursPerYear','WorkHoursPerYear','YearHrCnt']);

  const default_flag = ynOrNum(c, ['DefaultFlag','Default','IsDefault']);

  const last_chng_date = anyDt(c, ['DateLastChanged','LastChangedDate','LastChangeDate','LastChngDate','LastChng']);

  const clndr_data = anyTxt(c, ['Data','CalendarData']) ?? null;

  const proj_id_val = anyNum(c, ['ProjectObjectId','ProjObjectId']);
  const proj_id = Number.isFinite(proj_id_val as number)
    ? (proj_id_val as number)
    : (Number.isFinite(fallbackProjId as number) ? (fallbackProjId as number) : null);

  const rsrc_private = ynOrNum(c, ['ResourcePrivate','RsrcPrivate','Personal','IsPersonal']);

  const hours_per_day_eff = calcHoursPerDay(day_hr_cnt ?? null, week_hr_cnt ?? null, month_hr_cnt ?? null, year_hr_cnt ?? null);
  const hours_per_week_eff = calcHoursPerWeek(day_hr_cnt ?? null, week_hr_cnt ?? null, month_hr_cnt ?? null, year_hr_cnt ?? null);
  const hours_per_day_source = ((): string | null => {
    if (day_hr_cnt != null && day_hr_cnt > 0) return 'DAY';
    if (week_hr_cnt != null && week_hr_cnt > 0) return 'WEEK/5';
    if (month_hr_cnt != null && month_hr_cnt > 0) return 'MONTH/21.667';
    if (year_hr_cnt != null && year_hr_cnt > 0) return 'YEAR/260';
    return null;
  })();
  const default_flag10 = flag10FromYnOrNum(default_flag);
  const rsrc_private10 = flag10FromYnOrNum(rsrc_private);
  const scope_norm = scopeNorm(proj_id as number | null, rsrc_private);

  return {
    clndr_id: clndr_id as number,
    base_clndr_id: base_clndr_id ?? null,
    clndr_name: clndr_name ?? null,
    clndr_type,
    day_hr_cnt: day_hr_cnt ?? null,
    week_hr_cnt: week_hr_cnt ?? null,
    month_hr_cnt: month_hr_cnt ?? null,
    year_hr_cnt: year_hr_cnt ?? null,
    default_flag,
    last_chng_date,
    clndr_data,
    proj_id,
    rsrc_private,

    // === DCMA-friendly derived fields (добавочные, не меняют контракт) ===
    default_flag10,
    rsrc_private10,
    scope_norm,
    hours_per_day_eff: hours_per_day_eff ?? null,
    hours_per_week_eff: hours_per_week_eff ?? null,
    hours_per_day_source: hours_per_day_source,
  };
}