// src/app/utils/evm.util.ts
import { XerDexieService } from '../p6/dexie.service';

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

function toPosNumberOrNull(v: any): number | null {
  const n = toNumberOrNull(v);
  if (n == null) return null;
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

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function isYes(flag: any): boolean {
  const s = String(flag ?? '').trim().toUpperCase();
  return s === 'Y' || s === 'YES' || s === '1' || s === 'TRUE';
}

/**
 * Возвращает фактическое количество (actual_qty) = act_reg_qty + act_ot_qty.
 */
function actualQtyOf(r: any): number {
  const reg = toNumberOrNull(r?.act_reg_qty) ?? 0;
  const ot  = toNumberOrNull(r?.act_ot_qty) ?? 0;
  const q = reg + ot;
  return Number.isFinite(q) ? q : 0;
}

/**
 * Рассчитать AC по назначению с приоритетами:
 * 1) act_reg_cost + act_ot_cost
 * 2) act_total_cost / act_cost / actual_cost (если присутствуют единым полем)
 * 3) (act_reg_qty + act_ot_qty) * cost_per_qty (если cost_qty_link_flag='Y' или rate известен)
 */
function computeAssignmentAC(r: any, actualCostKeysFallback: string[]): number {
  const actReg = toNumberOrNull(r?.act_reg_cost);
  const actOt  = toNumberOrNull(r?.act_ot_cost);
  const sumCosts = (actReg ?? 0) + (actOt ?? 0);

  let ac = 0;

  if ((actReg != null || actOt != null) && Number.isFinite(sumCosts) && sumCosts !== 0) {
    ac = sumCosts;
  } else {
    const single = pickNum(r, actualCostKeysFallback);
    if (single != null) {
      ac = single;
    } else {
      const cpq = toNumberOrNull(r?.cost_per_qty);
      const aq  = actualQtyOf(r);
      if (cpq != null && aq > 0) ac = cpq * aq;
    }
  }

  return Number.isFinite(ac) ? ac : 0;
}

/**
 * Рассчитать BAC по назначению с приоритетами:
 * 1) target_cost (или его синонимы)
 * 2) при связке стоимости с объёмом (cost_qty_link_flag='Y'):
 *    - target_qty * cost_per_qty
 *    - иначе (remain_qty + actual_qty) * cost_per_qty
 * 3) если есть remain_cost и есть фактические затраты => remain_cost + actual_cost (приближение BAC)
 */
function computeAssignmentBAC(r: any, targetCostKeys: string[], actualCostKeysFallback: string[]): number | null {
  // 1) Прямые target-поля:
  const directTarget = pickNum(r, targetCostKeys);
  if (directTarget != null) return directTarget;

  const cpq = toNumberOrNull(r?.cost_per_qty);
  const link = isYes(r?.cost_qty_link_flag);

  // 2) Производные из qty*rate
  if (link && cpq != null) {
    const tQty = toNumberOrNull(r?.target_qty);
    if (tQty != null) return tQty * cpq;

    const rQty = toNumberOrNull(r?.remain_qty);
    const aQty = actualQtyOf(r);
    if (rQty != null) return (rQty + aQty) * cpq;
  }

  // 3) Приближение: remain_cost + AC
  const rem = toNumberOrNull(r?.remain_cost);
  if (rem != null) {
    const ac = computeAssignmentAC(r, actualCostKeysFallback);
    if (Number.isFinite(ac)) return rem + ac;
  }

  // 4) Последняя попытка qty*rate даже без 'Y'
  if (cpq != null) {
    const tQty = toNumberOrNull(r?.target_qty);
    if (tQty != null) return tQty * cpq;

    const rQty = toNumberOrNull(r?.remain_qty);
    if (rQty != null) return (rQty + actualQtyOf(r)) * cpq;
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

  // Эти ключи используются как единое поле AC, если нет раздельных reg/ot:
  const actualCostKeysFallback = opts?.actualCostKeys ?? [
    'act_total_cost', 'act_cost', 'actual_cost'
  ];

  const taskProgressField = opts?.taskProgressField ?? 'phys_complete_pct';

  // Карта прогресса задач (0..1)
  const taskPct = new Map<number, number>();
  for (const t of taskRows) {
    const id = Number(t?.task_id);
    if (!Number.isFinite(id)) continue;
    const p = toNumberOrNull(t?.[taskProgressField]);
    const clamped = p != null ? clamp01(p / 100) : 0;
    taskPct.set(id, clamped);
  }

  // Суммы по назначениям
  let BAC = 0;
  let AC  = 0;

  // Для EV нам нужен BAC по каждому назначению
  let EV = 0;

  for (const r of taskRsrcRows) {
    const tid = Number(r?.task_id);
    if (!Number.isFinite(tid)) continue;

    const bac_i = computeAssignmentBAC(r, targetCostKeys, actualCostKeysFallback);
    const ac_i  = computeAssignmentAC(r, actualCostKeysFallback);

    if (bac_i != null && Number.isFinite(bac_i) && bac_i > 0) {
      BAC += bac_i;
      const p = taskPct.get(tid) ?? 0;
      EV += bac_i * p;
    }

    if (Number.isFinite(ac_i) && ac_i > 0) {
      AC += ac_i;
    }
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
      ? [
          'EV = Σ(phys%_TASK × BAC_TASKRSRC)',
          'BAC per TASKRSRC: target_cost; otherwise qty×rate (target_qty or remain_qty+actual_qty if cost_qty_link_flag=Y); otherwise remain_cost + AC',
          'AC per TASKRSRC: act_reg_cost + act_ot_cost; otherwise (act_total_cost / act_cost / actual_cost); otherwise qty×rate from actuals',
        ].join(' | ')
      : 'Not available: no cost data in TASKRSRC';

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
