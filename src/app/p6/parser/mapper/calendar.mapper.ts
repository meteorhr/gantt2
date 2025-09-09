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
  };
}