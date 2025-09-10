// src/app/state/float-summary.util.ts
import { P6DexieService } from '../p6/dexie.service';

export type FloatUnits = 'days' | 'hours';

export interface FloatThresholds {
  criticalLt: number;
  nearCriticalLt: number;
  highFloatGt: number;
  units?: FloatUnits;
}

export interface FloatSummary {
  total: number;
  unknown: number;
  critical: number;
  nearCritical: number;
  normal: number;
  high: number;
  longestPath: number;
}

/* ----------------------- helpers ----------------------- */
function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
function toBool(v: unknown): boolean {
  if (v === true) return true;
  if (v === false) return false;
  if (typeof v === 'number') return v !== 0;
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'y' || s === 'yes' || s === 'true' || s === '1';
}
function pickProp<T = unknown>(obj: any, keys: string[]): T | undefined {
  if (!obj) return undefined as any;
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) return obj[k] as T;
    const found = Object.keys(obj).find(ok => ok.toLowerCase() === k.toLowerCase());
    if (found) return obj[found] as T;
  }
  return undefined as any;
}
function toDate(v: unknown): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isFinite(d.valueOf()) ? d : null;
}
function diffHours(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / 3_600_000; // b - a, в часах (может быть отрицательным)
}
function getProjIdFromTaskRow(row: any): number | null {
  const candidates = [
    'proj_id','ProjectId','ProjectID','ProjectObjectId','ProjectObjectID','projObjectId',
    'ProjectUid','ProjectUID','ProjectUniqueId',
  ];
  for (const k of candidates) {
    const v = toNum(pickProp(row, [k]));
    if (v != null) return v;
  }
  return null;
}

/** Часы в дне проекта: PROJECT.clndr_id → CALENDAR.day_hr_cnt, иначе 8. */
async function getHoursPerDay(dexie: P6DexieService, projId: number): Promise<number> {
  try {
    const projects = await dexie.getRows('PROJECT');
    const p = (projects as any[]).find(r => {
      const pid = toNum(r?.proj_id) ?? toNum(pickProp(r, [
        'ProjectId','ProjectObjectId','ProjectUID','ProjectUniqueId'
      ]));
      return pid != null && pid === Number(projId);
    });

    const fallbackDayHrFromProject =
      toNum(p?.day_hr_cnt) ??
      toNum(pickProp(p, ['day_hr_cnt','DayHrCnt','WorkHoursPerDay','dayHours','DayHours']));

    const clndrId =
      toNum(p?.clndr_id) ??
      toNum(pickProp(p, ['clndr_id','CalendarId','CalendarObjectId','ProjectCalendarObjectId']));

    if (clndrId == null) return fallbackDayHrFromProject ?? 8;

    const calendars = await dexie.getRows('CALENDAR');
    const c = (calendars as any[]).find(row => {
      const id = toNum(row?.clndr_id) ?? toNum(pickProp(row, ['CalendarId','ObjectId','ObjectID']));
      return id != null && id === clndrId;
    });

    const dayHr =
      toNum(c?.day_hr_cnt) ??
      toNum(pickProp(c, ['day_hr_cnt','DayHrCnt','WorkHoursPerDay','dayHours','DayHours']));
    return dayHr ?? (fallbackDayHrFromProject ?? 8);
  } catch {
    return 8;
  }
}

/** Longest Path (XER + XML-варианты) */
function isOnLongestPath(task: any): boolean {
  const fp  = toNum(task?.float_path) ?? toNum(pickProp(task, ['FloatPath']));
  const fpo = toNum(task?.float_path_order) ?? toNum(pickProp(task, ['FloatPathOrder']));
  if (fp === 1 || fpo === 1) return true;
  const lp1 = pickProp(task, ['OnLongestPath','IsOnLongestPath','LongestPath','IsLongestPath']);
  if (lp1 !== undefined) return toBool(lp1);
  return false;
}

/**
 * Извлекает Total Float в ЧАСАХ:
 * 1) прямые поля TF (часы/дни),
 * 2) TotalFloat + Units,
 * 3) расчёт по датам (Late-Early), если ничего не нашли.
 */
// === DEBUG toggle ===
function isDebugOn(): boolean {
  return false
}

/** Куда писать события от getTotalFloatHours (заполняется в floatSummaryForProject) */
let __TF_DEBUG_COLLECTOR: ((evt: any) => void) | null = null;


/* ===== working time helpers (approx) ===== */
function startOfDay(d: Date): Date {
  const x = new Date(d); x.setHours(0,0,0,0); return x;
}
function addDays(d: Date, days: number): Date {
  const x = new Date(d); x.setDate(x.getDate() + days); return x;
}
function setHM(d: Date, h: number, m = 0): Date {
  const x = new Date(d); x.setHours(h, m, 0, 0); return x;
}
function overlapHours(a1: Date, a2: Date, b1: Date, b2: Date): number {
  const s = Math.max(a1.getTime(), b1.getTime());
  const e = Math.min(a2.getTime(), b2.getTime());
  return e > s ? (e - s) / 3_600_000 : 0;
}
function isWeekend(d: Date): boolean {
  const wd = d.getDay(); // 0=Sun .. 6=Sat
  return wd === 0 || wd === 6;
}

/**
 * Рабочие часы между датами по упрощённому календарю:
 * - Пн-Пт — рабочие, Сб/Вс — нет
 * - рабочий день: [08:00 .. 08:00 + hpd]
 * Возвращает ЗНАК сохраняется: если b < a → отрицательное значение.
 */
function workingHoursBetween(a: Date, b: Date, hpd: number, dayStartHour = 8): number {
  if (!Number.isFinite(hpd) || hpd <= 0) return 0;

  let sign = 1;
  let from = a, to = b;
  if (to.getTime() < from.getTime()) { sign = -1; from = b; to = a; }

  let total = 0;
  let cur = startOfDay(from);
  const endDay = startOfDay(to);

  while (cur.getTime() <= endDay.getTime()) {
    if (!isWeekend(cur)) {
      const ws = setHM(cur, dayStartHour, 0);
      const we = setHM(cur, dayStartHour + hpd, 0);
      total += overlapHours(from, to, ws, we);
    }
    cur = addDays(cur, 1);
  }
  return sign * total;
}
/**
 * Извлекает Total Float в ЧАСАХ (приоритет: явные часы → явные дни → TotalFloat+Units → по датам).
 * Пишет debug-событие, если включён режим.
 */
/** БЫЛО: function getTotalFloatHours(task, hoursPerDay: number) */
function getTotalFloatHours(task: any, hpdForDates: number): number | null {
  const dbg = (patch: any) => { if (__TF_DEBUG_COLLECTOR) __TF_DEBUG_COLLECTOR(patch); };

  // 1) Прямые часы TF
  const tfh = toNum(pickProp(task, ['total_float_hr_cnt','TotalFloatHours','TF_Hours','tf_hours']));
  if (tfh != null) { dbg({src:'fieldHours', tfh}); return tfh; }

  // 2) Прямые дни TF → переводим в часы через hpd активности
  const tfd = toNum(pickProp(task, ['total_float_day_cnt','TotalFloatDays','TF_Days','tf_days']));
  if (tfd != null) { const v = tfd * hpdForDates; dbg({src:'fieldDays', tfd, hpdForDates, tfh:v}); return v; }

  // 3) TotalFloat + Units
  const tfRaw = toNum(pickProp(task, ['TotalFloat','total_float','TF','Float']));
  const unitsRaw = pickProp<string>(task, ['TotalFloatUnits','FloatUnits','Units','DurationUnits']);
  if (tfRaw != null) {
    const u = String(unitsRaw ?? '').trim().toLowerCase();
    if (u.includes('day'))  { const v = tfRaw * hpdForDates; dbg({src:'totalFloat+units(day)', tfRaw, units:unitsRaw, hpdForDates, tfh:v}); return v; }
    if (u.includes('hour') || u === 'h' || u === 'hr' || u === 'hrs' || u === '') {
      dbg({src: u ? 'totalFloat+units(hour)' : 'totalFloat(no-units→hour)', tfRaw, units:unitsRaw, tfh:tfRaw});
      return tfRaw;
    }
    // непонятные units — примем как часы (так делает P6 чаще всего)
    dbg({src:'totalFloat(unknown-units→hour)', tfRaw, units:unitsRaw, tfh:tfRaw});
    return tfRaw;
  }

  // 4) ФОЛБЭК ПО ДАТАМ → УЧИТЫВАЕМ ТОЛЬКО РАБОЧИЕ ЧАСЫ (КАЛЕНДАРЬ АКТИВНОСТИ)
  const ES = toDate(pickProp(task, ['early_start_date','EarlyStart']));
  const EF = toDate(pickProp(task, ['early_end_date','EarlyFinish']));
  const LS = toDate(pickProp(task, ['late_start_date','LateStart']));
  const LF = toDate(pickProp(task, ['late_end_date','LateFinish']));
  const PS = toDate(pickProp(task, ['plan_start_date','PlannedStart','TargetStart']));
  const PF = toDate(pickProp(task, ['plan_end_date','PlannedFinish','TargetFinish']));
  const SS = toDate(pickProp(task, ['sched_start_date','ScheduleStart','ScheduledStart']));
  const SF = toDate(pickProp(task, ['scd_end_date','ScheduleFinish','ScheduledFinish','sched_end_date']));

  const alt: number[] = [];
  if (EF && LF) alt.push(workingHoursBetween(EF, LF, hpdForDates));
  if (ES && LS) alt.push(workingHoursBetween(ES, LS, hpdForDates));
  if (PF && LF) alt.push(workingHoursBetween(PF, LF, hpdForDates));
  if (PS && LS) alt.push(workingHoursBetween(PS, LS, hpdForDates));
  if (SF && LF) alt.push(workingHoursBetween(SF, LF, hpdForDates));
  if (SS && LS) alt.push(workingHoursBetween(SS, LS, hpdForDates));

  if (!alt.length) { dbg({src:'datesFallback:none'}); return null; }

  const tfCalHrs = alt.reduce((m, v) => (v < m ? v : m), alt[0]); // берём наименьший запас
  dbg({src:'datesFallback(workingHours)', hpdForDates, tfh:tfCalHrs, alternatives: alt});
  return tfCalHrs;
}

/* ----------------------- main ----------------------- */
let _diagPrinted = false;
function printDiagnosticsOnce(src: { allRows: any[]; filteredRows: any[]; projId: number; hoursPerDay: number; }) {
  if (_diagPrinted) return;
  _diagPrinted = true;
  const first = src.allRows[0] ?? {};
  const keys = Object.keys(first);
  const sample = Object.fromEntries(keys.slice(0, 20).map(k => [k, (first as any)[k]]));
  const uniqueProjIds = new Set<number | 'null'>();
  for (const r of src.allRows) uniqueProjIds.add(getProjIdFromTaskRow(r) ?? 'null');
  // eslint-disable-next-line no-console
  console.info('[float-summary] DIAG:', {
    projId: src.projId, totalRows: src.allRows.length, filteredRows: src.filteredRows.length,
    hoursPerDay: src.hoursPerDay, keysCount: keys.length, sampleFirstRow: sample,
    uniqueProjIds: Array.from(uniqueProjIds).slice(0, 10)
  });
}

export async function floatSummaryForProject(
  dexie: P6DexieService,
  projId: number,
  thresholds: FloatThresholds
): Promise<FloatSummary> {
  const units: FloatUnits = thresholds.units ?? 'days';
  const DEBUG_FLOAT = isDebugOn();

  // --- подгружаем таблицы один раз ---
  const [taskRows, projects, calendars] = await Promise.all([
    dexie.getRows('TASK'),
    dexie.getRows('PROJECT'),
    dexie.getRows('CALENDAR'),
  ]);
  const allTasks = (taskRows as any[]) ?? [];

  // --- определим проектные часы/день как фолбэк ---
  const projectRow = (projects as any[]).find(r => {
    const pid =
      toNum(r?.proj_id) ??
      toNum(pickProp(r, ['ProjectId','ProjectObjectId','ProjectUID','ProjectUniqueId']));
    return pid != null && pid === Number(projId);
  }) ?? {};

  const fallbackDayHrFromProject =
    toNum(projectRow?.day_hr_cnt) ??
    toNum(pickProp(projectRow, ['day_hr_cnt','DayHrCnt','WorkHoursPerDay','dayHours','DayHours']));

  const projectClndrId =
    toNum(projectRow?.clndr_id) ??
    toNum(pickProp(projectRow, ['clndr_id','CalendarId','CalendarObjectId','ProjectCalendarObjectId']));

  // --- построим map календарь -> hours/day ---
  const calHoursById = new Map<number, number>();
  for (const c of (calendars as any[])) {
    const cid =
      toNum(c?.clndr_id) ??
      toNum(pickProp(c, ['CalendarId','ObjectId','ObjectID']));
    if (cid == null) continue;

    let dayHr =
      toNum(c?.day_hr_cnt) ??
      toNum(pickProp(c, ['day_hr_cnt','DayHrCnt','WorkHoursPerDay','dayHours','DayHours']));

    if (dayHr == null) {
      const week =
        toNum(c?.week_hr_cnt) ??
        toNum(pickProp(c, ['week_hr_cnt','WeekHrCnt','HoursPerWeek','WorkHoursPerWeek']));
      if (week != null) dayHr = week / 5;
    }
    if (dayHr != null && dayHr > 0) calHoursById.set(cid, dayHr);
  }

  const projectHoursPerDay =
    (projectClndrId != null ? calHoursById.get(projectClndrId) : null) ??
    fallbackDayHrFromProject ?? 8;

  // --- фильтруем задачи проекта ---
  let tasks = allTasks.filter(t => {
    const pid = getProjIdFromTaskRow(t);
    return pid != null && pid === Number(projId);
  });

  if (tasks.length === 0 && allTasks.length > 0) {
    const uniq = new Set<number>();
    for (const r of allTasks) {
      const pid = getProjIdFromTaskRow(r);
      if (pid != null) uniq.add(pid);
    }
    if (uniq.size === 1) tasks = allTasks;
  }

  printDiagnosticsOnce({ allRows: allTasks, filteredRows: tasks, projId, hoursPerDay: projectHoursPerDay });

  // ==== DEBUG init ====
  const debugEvents: any[] = [];
  __TF_DEBUG_COLLECTOR = (evt) => { debugEvents.push(evt); };

  const hoursPerDayForTask = (t: any): {hpd:number, src:'activity'|'project'|'default', calId?:number} => {
    const tid =
      toNum(t?.clndr_id) ??
      toNum(pickProp(t, [
        'clndr_id','CalendarId','CalendarObjectId','ActivityCalendarObjectId','TaskCalendarObjectId'
      ]));
    if (tid != null && calHoursById.has(tid)) return { hpd: calHoursById.get(tid)!, src:'activity', calId:tid };
    if (projectClndrId != null && calHoursById.has(projectClndrId)) return { hpd: calHoursById.get(projectClndrId)!, src:'project', calId:projectClndrId };
    return { hpd: projectHoursPerDay, src:'default' };
  };

  // helpers для debug
  const bucketOf = (tfDays:number): 'critical'|'near'|'normal'|'high' => {
    if (tfDays < thresholds.criticalLt) return 'critical';
    if (tfDays < thresholds.nearCriticalLt) return 'near';
    if (tfDays > thresholds.highFloatGt) return 'high';
    return 'normal';
  };
  const taskCodeOf = (t:any) =>
    pickProp(t, ['task_code','Id','ActivityId','ActivityID','Code']) ?? t?.task_id ?? '?';

  let critical = 0, near = 0, normal = 0, high = 0, unknown = 0, lp = 0;

  // Для сравнения: параллельно считаем TF по датам (только для debug), чтобы видеть расхождения
  function tfByDatesOnly(task:any): number | null {
    const ES = toDate(pickProp(task, ['early_start_date','EarlyStart']));
    const EF = toDate(pickProp(task, ['early_end_date','EarlyFinish']));
    const LS = toDate(pickProp(task, ['late_start_date','LateStart']));
    const LF = toDate(pickProp(task, ['late_end_date','LateFinish']));
    const PS = toDate(pickProp(task, ['plan_start_date','PlannedStart','TargetStart']));
    const PF = toDate(pickProp(task, ['plan_end_date','PlannedFinish','TargetFinish']));
    const SS = toDate(pickProp(task, ['sched_start_date','ScheduleStart','ScheduledStart']));
    const SF = toDate(pickProp(task, ['scd_end_date','ScheduleFinish','ScheduledFinish','sched_end_date']));
    const diffs: number[] = [];
    if (EF && LF) diffs.push(diffHours(EF, LF));
    if (ES && LS) diffs.push(diffHours(ES, LS));
    if (PF && LF) diffs.push(diffHours(PF, LF));
    if (PS && LS) diffs.push(diffHours(PS, LS));
    if (SF && LF) diffs.push(diffHours(SF, LF));
    if (SS && LS) diffs.push(diffHours(SS, LS));
    if (!diffs.length) return null;
    return diffs.reduce((m, v) => (v < m ? v : m), diffs[0]);
  }

  // основной цикл
  for (const t of tasks) {
    const {hpd, src:hpSrc, calId} = (units === 'days') ? hoursPerDayForTask(t) : { hpd:1, src:'default' as const };

    // возьмём финальный TF (часы) из функции с приоритетами
    const tfHoursFinal = getTotalFloatHours(t, projectHoursPerDay);

    if (isOnLongestPath(t)) lp++;

    if (tfHoursFinal === null) {
      unknown++;
      if (DEBUG_FLOAT) {
        debugEvents.push({
          code: taskCodeOf(t), task_id: t?.task_id,
          tfFinal: null, hpdUsed: hpd, hpSrc,
          note: 'Unknown TF (no fields, no dates fallback)'
        });
      }
      continue;
    }

    // TF в «днях» по выбранным часам-в-дне
    const tfDays = tfHoursFinal / (units === 'days' ? hpd : 1);
    const bucket = bucketOf(tfDays);

    if (bucket === 'critical') critical++;
    else if (bucket === 'near') near++;
    else if (bucket === 'high') high++;
    else normal++;

    if (DEBUG_FLOAT) {
      // параллельно вычислим чисто-по-датам для сравнения (диагностика)
      const tfH_byDates = tfByDatesOnly(t);
      const tfD_byDates = tfH_byDates == null ? null : tfH_byDates / (units === 'days' ? hpd : 1);

      // источники полей на всякий
      const tfhField = toNum(pickProp(t, ['total_float_hr_cnt','TotalFloatHours','TF_Hours','tf_hours']));
      const tfdField = toNum(pickProp(t, ['total_float_day_cnt','TotalFloatDays','TF_Days','tf_days']));
      const tfRaw    = toNum(pickProp(t, ['TotalFloat','total_float','TF','Float']));
      const unitsRaw = pickProp<string>(t, ['TotalFloatUnits','FloatUnits','Units','DurationUnits']);

      debugEvents.push({
        code: taskCodeOf(t),
        task_id: t?.task_id,
        calId, hpSrc, hpDay:hpd,
        tfFinalHours: tfHoursFinal,
        tfFinalDays: tfDays,
        bucket,
        sources: { tfhField, tfdField, tfRaw, unitsRaw },
        datesProbe: { tfH_byDates, tfD_byDates }
      });
    }
  }

  // === выводим DEBUG ===
  if (DEBUG_FLOAT) {
    try {
      const bySrc = { fieldHours:0, fieldDays:0, totalFloatUnits:0, datesFallback:0, other:0 };
      const byBucket = { critical, near, normal, high, unknown };
      for (const e of debugEvents) {
        // события от getTotalFloatHours
        if (e?.src === 'fieldHours') bySrc.fieldHours++;
        else if (e?.src === 'fieldDays') bySrc.fieldDays++;
        else if (String(e?.src || '').startsWith('totalFloat')) bySrc.totalFloatUnits++;
        else if (e?.src === 'datesFallback') bySrc.datesFallback++;
      }

      console.groupCollapsed(`[float-summary][proj ${projId}] DEBUG`);
      console.info('PROJECT hours/day:', projectHoursPerDay, 'projectClndrId:', projectClndrId);
      console.info('CAL hours map (id → hours/day):', Array.from(calHoursById.entries()).slice(0, 50));
      console.info('TF sources (how chosen inside getTotalFloatHours):', bySrc);
      console.info('Buckets:', byBucket);
      // отобразим первую сотню детальных событий для задач
      const taskRowsForTable = debugEvents
        .filter(e => e?.code !== undefined && e?.tfFinalDays !== undefined)
        .slice(0, 100);
      console.table(taskRowsForTable);

      // подсветим «подозрительные» — сильное расхождение датного vs финального
      const OUTLIERS = debugEvents.filter(e => {
        if (!e?.datesProbe || e?.datesProbe?.tfH_byDates == null || e?.tfFinalHours == null) return false;
        const a = Math.abs(e.datesProbe.tfh_byDates ?? e.datesProbe.tfH_byDates);
        const b = Math.abs(e.tfFinalHours);
        if (a === 0 || b === 0) return false;
        const r = Math.max(a,b)/Math.min(a,b);
        return r > 5 && r < 12; // классическая «дни vs часы» ловушка
      }).slice(0, 50);
      if (OUTLIERS.length) {
        console.warn('[TF suspicious: hours vs days mismatch]', OUTLIERS);
      }

      console.groupEnd();
    } catch (err) {
      console.warn('DEBUG dump failed:', err);
    } finally {
      __TF_DEBUG_COLLECTOR = null;
    }
  } else {
    __TF_DEBUG_COLLECTOR = null;
  }

  return { total: tasks.length, unknown, critical, nearCritical: near, normal, high, longestPath: lp };
}
