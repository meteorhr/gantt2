// src/app/state/float-summary.util.ts
import { P6DexieService } from '../p6/dexie.service';

export type FloatUnits = 'days' | 'hours';

export interface FloatThresholds {
  /** TF < criticalLt  → Critical */
  criticalLt: number;
  /** TF < nearCriticalLt (и ≥ criticalLt) → Near-critical */
  nearCriticalLt: number;
  /** TF > highFloatGt → High Float; между nearCriticalLt и highFloatGt → Normal */
  highFloatGt: number;
  /** В каких единицах заданы пороги: дни или часы. По умолчанию — 'days'. */
  units?: FloatUnits;
}

export interface FloatSummary {
  total: number;
  unknown: number;     // TF отсутствует/не число
  critical: number;    // TF < criticalLt
  nearCritical: number;// TF < nearCriticalLt (и ≥ criticalLt)
  normal: number;      // остальное между nearCriticalLt и highFloatGt
  high: number;        // TF > highFloatGt
  longestPath: number; // float_path == 1 или float_path_order == 1
}

/** Надёжное преобразование к числу. */
function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Часы в дне проекта: берём PROJECT.clndr_id → CALENDAR.day_hr_cnt, иначе 8. */
async function getHoursPerDay(dexie: P6DexieService, projId: number): Promise<number> {
  try {
    const projects = await dexie.getRows('PROJECT');
    const p = (projects as any[]).find(r => Number(r?.proj_id) === Number(projId));
    const clndrId = p?.clndr_id;
    if (clndrId == null) return 8;
    const calendars = await dexie.getRows('CALENDAR');
    const c = (calendars as any[]).find(r => Number(r?.clndr_id) === Number(clndrId));
    const dayHr = toNum(c?.day_hr_cnt);
    return dayHr ?? 8;
  } catch {
    return 8;
  }
}

/** Вернёт true, если задача относится к Longest Path (по данным XER). */
function isOnLongestPath(task: any): boolean {
  const fp  = toNum(task?.float_path);
  const fpo = toNum(task?.float_path_order);
  return fp === 1 || fpo === 1;
}

/**
 * Главная функция: считает распределение по Total Float.
 * Пороговые значения задаются вручную в thresholds (в днях или часах).
 */
export async function floatSummaryForProject(
  dexie: P6DexieService,
  projId: number,
  thresholds: FloatThresholds
): Promise<FloatSummary> {

  const units: FloatUnits = thresholds.units ?? 'days';
  const hpd = units === 'days' ? (await getHoursPerDay(dexie, projId)) : 1;

  // Читаем все TASK выбранного проекта
  const taskRows = await dexie.getRows('TASK');
  const tasks = (taskRows as any[]).filter(t => Number(t?.proj_id) === Number(projId));

  let critical = 0, near = 0, normal = 0, high = 0, unknown = 0, lp = 0;

  for (const t of tasks) {
    const tfHours = toNum(t?.total_float_hr_cnt);
    if (isOnLongestPath(t)) lp++;

    if (tfHours === null) { unknown++; continue; }

    // Переводим в "пороговые единицы"
    const tf = tfHours / hpd; // если пороги в днях — делим на hoursPerDay; если в часах, hpd=1

    if (tf < thresholds.criticalLt) {
      critical++;
    } else if (tf < thresholds.nearCriticalLt) {
      near++;
    } else if (tf > thresholds.highFloatGt) {
      high++;
    } else {
      normal++;
    }
  }

  return {
    total: tasks.length,
    unknown,
    critical,
    nearCritical: near,
    normal,
    high,
    longestPath: lp,
  };
}
