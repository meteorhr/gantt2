import { XerDexieService } from '../xer/xer-dexie.service';

export type SpiWeight = 'work' | 'equal'; // при желании добавите 'cost'
export interface SpiResult {
  asOf: string | null;   // Data Date
  EV: number;            // суммарная earned value в «единицах бюджета»
  PV: number;            // суммарная planned value
  SPI: number | null;    // EV/PV или null, если PV=0
  totalTasks: number;
  method: string;        // описание способа расчёта
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
  // поддержим 'YYYY-MM-DD' и 'YYYY-MM-DD HH:mm'
  const dt = new Date(s.replace(' ', 'T'));
  return isNaN(dt.getTime()) ? null : dt;
}
/** Плановая доля выполнения к asOf по интервалу [start,end]. */
function plannedFraction(asOf: Date, start: Date | null, end: Date | null): number {
  if (!start || !end) return 0;
  const t0 = start.getTime(), t1 = end.getTime(), t = asOf.getTime();
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 <= t0) {
    // нулевая длительность: считается 1, если asOf >= end, иначе 0
    return (t >= t1) ? 1 : 0;
  }
  if (t <= t0) return 0;
  if (t >= t1) return 1;
  return (t - t0) / (t1 - t0);
}

/**
 * Рассчитать SPI для проекта.
 * weight='work': бюджет = target_work_qty (если нет — 1).
 * weight='equal': у всех задач одинаковый вес = 1.
 * asOf: дата отсечения; если не задана — берём из PROJECT.
 */
export async function computeSpiForProject(
  dexie: XerDexieService,
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
    return { asOf: asOfStr ?? null, EV: 0, PV: 0, SPI: null, totalTasks: 0, method: `no asOf date` };
  }

  // --- TASK: выбираем задачи проекта ---
  const taskRows = await dexie.getRows('TASK');
  const tasks = (taskRows as any[]).filter(t => Number(t?.proj_id) === pid);

  let EV = 0, PV = 0;

  for (const t of tasks) {
    // вес/бюджет
    let budget = 1;
    if (weightMode === 'work') {
      const q = toNum((t as any).target_work_qty);
      budget = (q ?? 0) > 0 ? (q as number) : 1;
    }

    // EV: физический % выполнения * бюджет
    const phys = Math.max(0, Math.min(100, toNum((t as any).phys_complete_pct) ?? 0)) / 100;

    // PV: плановый % к asOf по базовым датам (target_*), при отсутствии — early_*
    const ts = toDate((t as any).target_start_date) ?? toDate((t as any).early_start_date);
    const te = toDate((t as any).target_end_date)   ?? toDate((t as any).early_end_date);
    const pvFrac = plannedFraction(asOfDate, ts, te);

    EV += budget * phys;
    PV += budget * pvFrac;
  }

  const SPI = PV > 0 ? (EV / PV) : null;

  return {
    asOf: asOfDate.toISOString().slice(0,10),
    EV, PV, SPI,
    totalTasks: tasks.length,
    method: weightMode === 'work'
      ? 'EV=phys% * target_work_qty; PV=planned% * target_work_qty'
      : 'EV=phys% * 1; PV=planned% * 1'
  };
}
