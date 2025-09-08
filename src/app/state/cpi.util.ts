// src/app/utils/evm.util.ts
import { XerDexieService } from '../xer/xer-dexie.service';

export interface CPIvm {
  EV: number | null;   // Earned Value
  AC: number | null;   // Actual Cost
  CPI: number | null;  // EV / AC
  method: string;      // описание применённого метода/полей
  asOf: string | null; // дата отчётности (Data Date / Last Recalc)
}

export interface ComputeCPIOptions {
  /**
   * Ключи для бюджетной стоимости (BAC/target) на уровне назначений TASKRSRC.
   * Добавляйте ваши поля при необходимости.
   */
  targetCostKeys?: string[];
  /**
   * Ключи для фактической стоимости (AC) на уровне назначений TASKRSRC.
   */
  actualCostKeys?: string[];
  /**
   * Имя поля прогресса задачи в % (0..100) в таблице TASK.
   * По умолчанию: 'phys_complete_pct'.
   */
  taskProgressField?: string;
}

/* ----------------- ВНУТРЕННИЕ ХЕЛПЕРЫ ----------------- */

function toIsoDateOrNull(input: any): string | null {
  if (!input) return null;
  if (input instanceof Date) {
    if (isNaN(input.getTime())) return null;
    const y = input.getFullYear();
    const m = String(input.getMonth() + 1).padStart(2, '0');
    const d = String(input.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(input).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const dt = new Date(s.replace(' ', 'T'));
  if (isNaN(dt.getTime())) return null;
  const y = dt.getFullYear();
  const mo = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

function toNumberOrNull(v: any): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function pickNum(row: any, keys: string[]): number | null {
  for (const k of keys) {
    const v = row?.[k];
    if (v !== undefined && v !== null && v !== '') {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

/* ----------------- ЧИСТАЯ ФУНКЦИЯ ПО ДАННЫМ ----------------- */
/**
 * Вычисляет CPI по задачам и назначениям.
 * @param projectRow Строка PROJECT (для asOf).
 * @param taskRows Все строки TASK выбранного проекта.
 * @param taskRsrcRows Назначения TASKRSRC, относящиеся к проекту/задачам.
 * @param opts Кастомные поля-синонимы стоимостей/прогресса.
 */
export function computeCPI(
  projectRow: any | null,
  taskRows: any[],
  taskRsrcRows: any[],
  opts?: ComputeCPIOptions
): CPIvm {
  const targetCostKeys = opts?.targetCostKeys ?? [
    'target_cost', 'target_total_cost', 'target_cost_sum', 'at_completion_total_cost', 'cost_at_completion'
  ];
  const actualCostKeys = opts?.actualCostKeys ?? [
    'act_cost', 'actual_cost', 'act_total_cost'
  ];
  const taskProgressField = opts?.taskProgressField ?? 'phys_complete_pct';

  // Карта прогресса задач (0..1)
  const taskPct = new Map<number, number>();
  for (const t of taskRows) {
    const id = Number(t?.task_id);
    if (!Number.isFinite(id)) continue;
    const p = toNumberOrNull(t?.[taskProgressField]);
    const clamped = p != null ? Math.max(0, Math.min(100, p)) / 100 : 0;
    taskPct.set(id, clamped);
  }

  // Суммируем BAC (target) и AC (actual) по назначениям
  let BAC = 0;
  let AC  = 0;
  for (const r of taskRsrcRows) {
    BAC += pickNum(r, targetCostKeys) ?? 0;
    AC  += pickNum(r, actualCostKeys) ?? 0;
  }

  // EV = Σ (phys%_task * target_cost_назначения)
  let EV = 0;
  for (const r of taskRsrcRows) {
    const tid = Number(r?.task_id);
    if (!Number.isFinite(tid)) continue;
    const tc = pickNum(r, targetCostKeys) ?? 0;
    const p  = taskPct.get(tid) ?? 0;
    EV += tc * p;
  }

  let CPI: number | null = null;
  if (AC > 0 && EV >= 0) CPI = EV / AC;

  const asOf =
    toIsoDateOrNull(projectRow?.next_data_date) ??
    toIsoDateOrNull(projectRow?.last_recalc_date) ??
    toIsoDateOrNull(projectRow?.last_tasksum_date) ??
    toIsoDateOrNull(projectRow?.update_date) ??
    null;

  const method =
    (BAC > 0 || AC > 0)
      ? 'EV = Σ(phys% × target_cost by TASKRSRC); AC = Σ(act_cost by TASKRSRC)'
      : 'Not available: no cost fields in TASKRSRC';

  return {
    EV: BAC > 0 ? EV : null,
    AC: AC  > 0 ? AC : null,
    CPI,
    method,
    asOf,
  };
}

/* ----------------- ОБЁРТКА ДЛЯ DEXIE ----------------- */
/**
 * Удобная функция: читает из Dexie PROJECT/TASK/TASKRSRC и считает CPI.
 */
export async function computeCPIFromDexie(
  dexie: XerDexieService,
  projectId: number,
  opts?: ComputeCPIOptions
): Promise<CPIvm> {
  const pid = Number(projectId);

  const projectRows = await dexie.getRows('PROJECT');
  const project = (projectRows as any[]).find(r => Number(r?.proj_id) === pid) ?? null;

  const taskRowsAll = await dexie.getRows('TASK');
  const tasks = (taskRowsAll as any[]).filter(t => Number(t?.proj_id) === pid);

  const taskIdSet = new Set<number>(tasks.map((t: any) => Number(t?.task_id)));

  const trAll = await dexie.getRows('TASKRSRC');
  const taskRsrc = (trAll as any[]).filter(r => {
    const byProj = Number(r?.proj_id) === pid;
    const byTask = taskIdSet.has(Number(r?.task_id));
    return byProj || byTask;
  });

  return computeCPI(project, tasks, taskRsrc, opts);
}
