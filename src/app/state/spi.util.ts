import { P6DexieService } from '../p6/dexie.service';

export type SpiWeight = 'work' | 'equal';

export interface SpiResult {
  asOf: string | null;
  EV: number;
  PV: number;
  SPI: number | null;
  totalTasks: number;
  method: string;
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function toDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v;
  const s = String(v);
  const dt = new Date(s.replace(' ', 'T'));
  return isNaN(dt.getTime()) ? null : dt;
}

/** Плановая доля выполнения к asOf по интервалу [start,end]. */
function plannedFraction(asOf: Date, start: Date | null, end: Date | null): number {
  if (!start || !end) return 0;
  const t0 = start.getTime(), t1 = end.getTime(), t = asOf.getTime();
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 <= t0) {
    return (t >= t1) ? 1 : 0;
  }
  if (t <= t0) return 0;
  if (t >= t1) return 1;
  return (t - t0) / (t1 - t0);
}

/**
 * Рассчитать SPI для проекта.
 * weight='work': бюджет = Σ target_qty по ресурсам (если нет — target_work_qty по задаче, иначе 1).
 * weight='equal': у всех задач одинаковый вес = 1.
 * PV: взвешивание по ресурсам с их датами (если они есть).
 */
export async function computeSpiForProject(
  dexie: P6DexieService,
  projectId: number,
  opts?: { weight?: SpiWeight; asOf?: string | Date | null }
): Promise<SpiResult> {
  const pid = Number(projectId);
  const weightMode: SpiWeight = opts?.weight ?? 'work';

  // --- PROJECT: определяем asOf (Data Date) ---
  const projRows = await dexie.getRows('PROJECT');
  const p = (projRows as any[]).find(r => Number(r?.proj_id) === pid) ?? null;
  const asOfStr: string | null =
    (p?.next_data_date ?? p?.last_recalc_date ?? p?.last_tasksum_date ?? p?.update_date) ?? null;
  const asOfDate = opts?.asOf ? toDate(opts.asOf) : toDate(asOfStr);
  if (!asOfDate) {
    return {
      asOf: asOfStr ?? null,
      EV: 0,
      PV: 0,
      SPI: null,
      totalTasks: 0,
      method: 'no asOf date'
    };
  }

  // --- TASK: задачи проекта ---
  const taskRows = await dexie.getRows('TASK');
  const tasks = (taskRows as any[]).filter(t => Number(t?.proj_id) === pid);

  // --- TASKRSRC: ресурсы проекта (группировка по task_id) ---
  const trRows = await dexie.getRows('TASKRSRC');
  const taskRsrc = new Map<number, any[]>();
  for (const r of (trRows as any[])) {
    if (Number(r?.proj_id) !== pid) continue;
    const tid = Number(r?.task_id);
    if (!Number.isFinite(tid)) continue;
    const arr = taskRsrc.get(tid);
    if (arr) arr.push(r); else taskRsrc.set(tid, [r]);
  }

  let EV = 0, PV = 0;

  for (const t of tasks) {
    const tid = Number((t as any).task_id);
    const rsrcs = taskRsrc.get(tid) ?? [];

    // --- Бюджет задачи ---
    let budget = 1;
    if (weightMode === 'work') {
      if (rsrcs.length) {
        let sumQ = 0;
        for (const r of rsrcs) {
          const qTarget = toNum(r?.target_qty);
          const qActuals =
            (toNum(r?.remain_qty) ?? 0) + (toNum(r?.act_reg_qty) ?? 0) + (toNum(r?.act_ot_qty) ?? 0);
          const q = (qTarget ?? null) != null ? (qTarget as number) : qActuals;
          if ((q ?? 0) > 0) sumQ += q!;
        }
        if (sumQ > 0) {
          budget = sumQ;
        } else {
          const qTask = toNum((t as any).target_work_qty);
          budget = (qTask ?? 0) > 0 ? (qTask as number) : 1;
        }
      } else {
        const qTask = toNum((t as any).target_work_qty);
        budget = (qTask ?? 0) > 0 ? (qTask as number) : 1;
      }
    }

    // --- EV: физический % выполнения * бюджет ---
    const phys = Math.max(0, Math.min(100, toNum((t as any).phys_complete_pct) ?? 0)) / 100;

    // --- PV: плановая доля, взвешенная по ресурсам (если есть) ---
    const tsTask = toDate((t as any).target_start_date) ?? toDate((t as any).early_start_date);
    const teTask = toDate((t as any).target_end_date)   ?? toDate((t as any).early_end_date);

    let pvFrac = 0;
    if (rsrcs.length) {
      let wSum = 0;
      let wfSum = 0;
      for (const r of rsrcs) {
        const rBudget = (toNum(r?.target_qty) ??
          ((toNum(r?.remain_qty) ?? 0) + (toNum(r?.act_reg_qty) ?? 0) + (toNum(r?.act_ot_qty) ?? 0)));
        if ((rBudget ?? 0) <= 0) continue;

        const rs = toDate(r?.target_start_date) ?? toDate(r?.rem_late_start_date) ?? tsTask;
        const re = toDate(r?.target_end_date)   ?? toDate(r?.rem_late_end_date)   ?? teTask;
        const f = plannedFraction(asOfDate, rs, re);

        wSum += rBudget as number;
        wfSum += (rBudget as number) * f;
      }
      pvFrac = wSum > 0 ? (wfSum / wSum) : plannedFraction(asOfDate, tsTask, teTask);
    } else {
      pvFrac = plannedFraction(asOfDate, tsTask, teTask);
    }

    EV += budget * phys;
    PV += budget * pvFrac;
  }

  const SPI = PV > 0 ? (EV / PV) : null;

  return {
    asOf: asOfDate.toISOString().slice(0, 10),
    EV,
    PV,
    SPI,
    totalTasks: tasks.length,
    method: describeMethod(taskRsrc.size > 0, weightMode)
  };

  function describeMethod(hasRsrc: boolean, wm: SpiWeight): string {
    if (hasRsrc) {
      return wm === 'work'
        ? 'EV=phys% * ΣRSRC(target_qty|remain+actuals); PV=resource-weighted by target dates'
        : 'EV=phys% * 1; PV=resource-weighted by target dates';
    } else {
      return wm === 'work'
        ? 'EV=phys% * task.target_work_qty; PV=planned% * task.target_work_qty'
        : 'EV=phys% * 1; PV=planned% * 1';
    }
  }
}
