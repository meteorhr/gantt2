import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';

import { XerLoaderService } from '../xer/xer-loader.service';
import { XerDexieService } from '../xer/xer-dexie.service';
import { buildWbsTaskByProjectTreeFromIndexedDb } from '../xer/task-to-node.adapter';
import { Node, ColumnDef } from '../gantt/models/gantt.model';
import { AnalyticsService } from '../firebase/analytics.service';
import { floatSummaryForProject } from './float-summary.util';
import { computeSpiForProject } from './spi.util';
import { computeCPIFromDexie } from './cpi.util';
/* ---------------------- ВМ для Dashboard ---------------------- */
export interface DashboardCount {
  value: string;   // код или rsrc_id как строка, '—' если пусто
  count: number;
}
export interface DashboardVm {
  projectId: number;
  planStart: string | null;     // 'YYYY-MM-DD' или null
  planEnd: string | null;
  lastRecalc: string | null;    // last_recalc_date || last_tasksum_date || update_date

  // ✨ Новые поля для таблицы Project Dates
  dataDate: string | null;           // PROJECT.next_data_date
  mustFinish: string | null;         // PROJECT.scd_end_date (или другой эквивалент)

  // ✨ Новые поля для таблицы Progress (%)
  progressSchedulePct: number;       // по статусам (Complete/act_end_date)
  progressPhysicalPct: number;       // среднее phys_complete_pct
  progressCostPct: number;           // sum(act_work_qty)/sum(target_work_qty)

  // ✨ Новые метрики стоимостей (итоги по проекту)
  costValue: number;          // EAC = Actual + Remaining (или at_completion_*)
  costActualToDate: number;   // Actual to date
  costRemaining: number;      // Remaining
  costBudgeted: number;       // Budgeted (BAC / target)
  costThisPeriod: number;     // This period

  rsrcQtyActualToDate: number;
  rsrcQtyRemaining: number;
  rsrcQtyBudgeted: number;
  rsrcQtyThisPeriod: number;

  baseCurrency: string | null;

  totalTasks: number;
  byStatus: DashboardCount[];
  byTaskType: DashboardCount[];
  byPriorityType: DashboardCount[];
  byDurationType: DashboardCount[];
  byRsrcId: DashboardCount[];
  floatSummary: import('./float-summary.util').FloatSummary;

  cpi: {
    EV: number | null;   // Earned Value
    AC: number | null;   // Actual Cost
    CPI: number | null;  // EV / AC
    method: string;      // описание использованных полей
    asOf: string | null; // дата Data Date / Last Recalc
  },

  spi: {
    asOf: string | null;
    EV: number;
    PV: number;
    SPI: number | null;
    method: string;
  };
}


@Injectable({ providedIn: 'root' })
export class AppStateService {
  // DI
  private readonly transloco = inject(TranslocoService);
  private readonly xer = inject(XerLoaderService);
  private readonly dexie = inject(XerDexieService);
  private readonly analytics = inject(AnalyticsService);

  // UI signals
  readonly isReady = signal(false);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  // Data
  readonly projects = signal<any[]>([]);
  readonly selectedProjectId = signal<number | null>(null);
  readonly activityData = signal<Node[]>([]);
  readonly xerSummaryArray = signal<any[]>([]);

  // Dashboard VM
  readonly dashboard = signal<DashboardVm | null>(null);
  readonly dashLoading = signal(false);   // индикатор расчёта дашборда

  // Gantt config
  readonly refLines = signal([
    { name: 'Current', date: new Date(), color: 'red' },
    { name: 'Baseline start', date: '2025-12-01', color: '#ff3b30', dash: [6, 4] },
    { name: 'Gate 2', date: new Date('2026-03-15'), color: 'teal' },
  ]);

  readonly columns = signal<ColumnDef[]>([
    { key: 'task_code', title: 'Task Code', width: 120, minWidth: 60 },
    { key: 'name', title: 'Task', width: 420, minWidth: 120 },
    { key: 'start', title: 'Act. Start', width: 120, minWidth: 80 },
    { key: 'finish', title: 'Act. Finish', width: 120, minWidth: 80 },
    { key: 'complete_pct_type_label', title: '%', width: 160, minWidth: 160, align: 'right' },
    { key: 'status_code_label', title: 'Status', width: 100, minWidth: 80 },
    { key: 'rsrc_names', title: 'Resources', width: 140, minWidth: 80 },
  ]);

  // View models (совместим с вашим шаблоном)
  readonly currentProject = computed(() => {
    const pid = this.selectedProjectId();
    const list = this.projects();
    const p = list.find(x => Number(x?.proj_id) === Number(pid));
    const name = p?.proj_short_name ? String(p.proj_short_name) : (pid != null ? `#${pid}` : '—');
    return { id: pid, name };
  });
  readonly currentProject$ = toObservable(this.currentProject);
  readonly project$ = this.currentProject$;

  // Tabs VM
  readonly tabsVm = computed(() => ([
    { link: 'summary' as const,   i18n: 'xer_summary',        disabled: false },
    { link: 'dashboard' as const, i18n: 'dashboard.title',          disabled: !this.isReady() },
    { link: 'gantt' as const,     i18n: 'activities_gantt',   disabled: !this.isReady() },
  ]));
  readonly tabs$ = toObservable(this.tabsVm);

  constructor() {
    effect(() => { /* keep-alive */ });
  }

  async initI18n(): Promise<void> {
    try {
      const active = this.transloco.getActiveLang() || 'en';
      this.transloco.setActiveLang(active);
      await firstValueFrom(this.transloco.selectTranslation(active).pipe(take(1)));
    } catch (err) {
      console.error('[XER] i18n init failed:', err);
    }
  }

  async loadFromFile(file: File): Promise<void> {
    const hadData = this.isReady();
    this.loading.set(true);
    this.error.set(null);
    try {
      await this.dexie.clear();
      await this.xer.loadFromFile(file);

      const projects = await this.dexie.getRows('PROJECT');
      const list = (projects as any[]).filter(p => p?.proj_id != null);
      if (!list.length) throw new Error('Таблица PROJECT пуста или proj_id отсутствует.');
      this.projects.set(list);

      const pid = Number(list[0].proj_id);
      if (!Number.isFinite(pid)) throw new Error('Некорректный proj_id в таблице PROJECT.');
      this.selectedProjectId.set(pid);

      // Обновляем Gantt/Summary
      await this.rebuildForProject(pid);

      this.isReady.set(true);
      this.analytics.event('upload_xer', { file_name: file.name });
    } catch (e: any) {
      console.error('[XER] File load failed:', e);
      this.error.set(typeof e?.message === 'string' ? e.message : 'Не удалось загрузить файл.');
      if (!hadData) this.isReady.set(false);
    } finally {
      this.loading.set(false);
    }
  }

  async loadDemo(): Promise<void> {
    const hadData = this.isReady();
    this.loading.set(true);
    this.error.set(null);
    try {
      await this.dexie.clear();
      await this.xer.loadAndLogFromAssets();

      const projects = await this.dexie.getRows('PROJECT');
      const list = (projects as any[]).filter(p => p?.proj_id != null);
      if (!list.length) throw new Error('Таблица PROJECT пуста или proj_id отсутствует.');
      this.projects.set(list);

      const pid = Number(list[0].proj_id);
      if (!Number.isFinite(pid)) throw new Error('Некорректный proj_id в таблице PROJECT.');
      this.selectedProjectId.set(pid);

      // Обновляем Gantt/Summary
      await this.rebuildForProject(pid);

      this.isReady.set(true);
      this.analytics.event('load_demo', { source: 'assets/xer/project.xer' });
    } catch (e: any) {
      console.error('[XER] Demo load failed:', e);
      this.error.set(typeof e?.message === 'string' ? e.message : 'Не удалось загрузить демо-данные.');
      if (!hadData) this.isReady.set(false);
    } finally {
      this.loading.set(false);
    }
  }

  async changeProject(projId: number): Promise<void> {
    const pid = Number(projId);
    if (!Number.isFinite(pid)) return;
    this.loading.set(true);
    try {
      this.selectedProjectId.set(pid);

      // Обновляем Gantt/Summary при смене проекта
      await this.rebuildForProject(pid);

      this.analytics.event('select_project', { proj_id: pid });
    } finally {
      this.loading.set(false);
    }
  }

  /** ПУБЛИЧНЫЙ расчёт дашборда: вызываем в компоненте Dashboard при каждом входе */
  async computeDashboard(projectId?: number): Promise<void> {
    const pid = Number(projectId ?? this.selectedProjectId());
    if (!Number.isFinite(pid)) {
      this.dashboard.set(null);
      return;
    }
    this.dashLoading.set(true);
    try {
      const vm = await this.buildDashboard(pid);
      this.dashboard.set(vm);
    } catch (e) {
      console.error('[Dashboard] build failed:', e);
      this.dashboard.set(null);
    } finally {
      this.dashLoading.set(false);
    }
  }

  /* ---------------------- приватные методы ---------------------- */

  /** Пересобирает данные для Gantt и Summary под выбранный проект */
  private async rebuildForProject(project_id: number): Promise<void> {
    const tree = await buildWbsTaskByProjectTreeFromIndexedDb(this.dexie, project_id, {
      baselineSource: 'none',
      translate: (key) => this.transloco.translate(key),
      debug: false,
    });
    this.activityData.set(tree);

    const sumRows = await this.dexie.getRows('SUMMARIZE');
    const array = (sumRows as any[]).map(r => ({
      ...r,
      params: r && r.params ? JSON.parse(String(r.params)) : {},
    }));
    this.xerSummaryArray.set(array);
  }

  private toIsoDateOrNull(input: any): string | null {
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

  private countBy<T>(rows: T[], getKey: (r: T) => unknown): DashboardCount[] {
    const map = new Map<string, number>();
    for (const r of rows) {
      const raw = getKey(r);
      const val = (raw === null || raw === undefined || raw === '') ? '—' : String(raw);
      map.set(val, (map.get(val) ?? 0) + 1);
    }
    // стабильная сортировка: по убыванию count, затем по value (натурально)
    return Array.from(map.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => (b.count - a.count) || a.value.localeCompare(b.value, undefined, { numeric: true, sensitivity: 'base' }));
  }

  private sumBy<T>(rows: T[], sel: (r: T) => number | null): number {
    let s = 0;
    for (const r of rows) {
      const n = sel(r);
      if (n !== null) s += n;
    }
    return s;
  }
  private avgBy<T>(rows: T[], sel: (r: T) => number | null): number {
    let s = 0, k = 0;
    for (const r of rows) {
      const n = sel(r);
      if (n !== null) { s += n; k++; }
    }
    return k ? (s / k) : 0;
  }
  private clampPct(n: number): number {
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, n));
  }

  private toNumberOrNull(v: any): number | null {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  }

  private async buildDashboard(project_id: number): Promise<DashboardVm> {
    const pid = Number(project_id);
  
    // --- PROJECT ---
    const projectRows = await this.dexie.getRows('PROJECT');
    const p = (projectRows as any[]).find(r => Number(r?.proj_id) === pid) ?? null;
  
    const planStart  = this.toIsoDateOrNull(p?.plan_start_date ?? p?.fcst_start_date);
    const planEnd    = this.toIsoDateOrNull(p?.plan_end_date   ?? p?.scd_end_date);
    const dataDate   = this.toIsoDateOrNull(p?.next_data_date);
    const mustFinish = this.toIsoDateOrNull(p?.scd_end_date ?? p?.plan_end_date);
  
    const lastRecalc =
      this.toIsoDateOrNull(p?.last_recalc_date) ??
      this.toIsoDateOrNull(p?.last_tasksum_date) ??
      this.toIsoDateOrNull(p?.update_date) ?? null;
  
    // --- TASK (все задачи проекта) ---
    const taskRows = await this.dexie.getRows('TASK');
    const tasks = (taskRows as any[]).filter(t => Number(t?.proj_id) === pid);
    const totalTasks = tasks.length;
    const taskIdSet = new Set<number>(tasks.map(t => Number(t?.task_id)).filter(n => Number.isFinite(n)));
  
    const floatSummary = await floatSummaryForProject(
      this.dexie, pid,
      { criticalLt: 1, nearCriticalLt: 21, highFloatGt: 49, units: 'days' }
    );
    

    // --- RSRC (имена ресурсов для группировок) ---
    const rsrcRows = await this.dexie.getRows('RSRC');
    const rsrcMap = new Map<number, string>();
    for (const r of (rsrcRows as any[])) {
      const id = Number(r?.rsrc_id);
      if (!Number.isFinite(id)) continue;
      const name = String(r?.rsrc_name ?? r?.rsrc_short_name ?? '').trim();
      rsrcMap.set(id, name || `#${id}`);
    }
  
    // --- Группировки по TASK ---
    const byStatus       = this.countBy(tasks, t => (t as any).status_code);
    const byTaskType     = this.countBy(tasks, t => (t as any).task_type);
    const byPriorityType = this.countBy(tasks, t => (t as any).priority_type);
    const byDurationType = this.countBy(tasks, t => (t as any).duration_type);
    const byRsrcId       = this.countBy(tasks, t => {
      const raw = (t as any).rsrc_id;
      if (raw === null || raw === undefined || raw === '') return '—';
      const id = Number(raw);
      if (!Number.isFinite(id)) return '—';
      return rsrcMap.get(id) ?? `#${id}`;
    });
  
    // --- Прогрессы (как было) ---
    const completeCount = tasks.filter(t =>
      (t as any).status_code === 'TK_Complete' || !!(t as any).act_end_date
    ).length;
    const progressSchedulePct = this.clampPct(totalTasks ? (completeCount / totalTasks) * 100 : 0);
    const progressPhysicalPct = this.clampPct(
      this.avgBy(tasks, t => this.toNumberOrNull((t as any).phys_complete_pct)) ?? 0
    );
    const actWorkSum    = this.sumBy(tasks, t => this.toNumberOrNull((t as any).act_work_qty));
    const targetWorkSum = this.sumBy(tasks, t => this.toNumberOrNull((t as any).target_work_qty));
    const progressCostPct = this.clampPct(targetWorkSum > 0 ? (actWorkSum / targetWorkSum) * 100 : 0);
  
    // ================== COST LOADING ==================
    // 1) Пытаемся взять из TASKRSRC (надежнее, если таблица заполнена).
    const trsAll = await this.dexie.getRows('TASKRSRC');
    const trs = (trsAll as any[]).filter(r =>
      Number(r?.proj_id) === pid || taskIdSet.has(Number(r?.task_id))
    );
  
    const num = (v: any) => this.toNumberOrNull(v) ?? 0;
    const firstNum = (r: any, keys: string[]) => {
      for (const k of keys) {
        const v = num(r?.[k]);
        if (v) return v;
      }
      return 0;
    };
    const sumKeys = (rows: any[], keys: string[]) =>
      rows.reduce((s, r) => s + firstNum(r, keys), 0);
  
    // частые имена полей в XER для стоимостей в TASKRSRC
    const K = {
      budget: ['target_cost', 'budg_cost', 'target_total_cost', 'at_completion_total_cost'],
      actual: ['act_cost', 'actual_cost', 'act_total_cost', 'act_this_cost_to_date'],
      remain: ['remain_cost', 'remaining_cost', 'remain_total_cost'],
      period: ['act_this_per_cost', 'this_per_cost'],
      atComp: ['at_completion_cost', 'at_completion_total_cost'],
    };

    const baseCurrency = await this.getBaseCurrencyFromDb(p);
  
    let costBudgeted     = sumKeys(trs, K.budget);
    let costActualToDate = sumKeys(trs, K.actual);
    let costRemaining    = sumKeys(trs, K.remain);
    let costThisPeriod   = sumKeys(trs, K.period);
    let costValue        = sumKeys(trs, K.atComp);
  
    // 2) Если TASKRSRC пуст/нули — fallback: считаем от TASK * qty * def_cost_per_qty (PROJECT)
    const isAllZero = (vals: number[]) => vals.every(v => v === 0);
    if (trs.length === 0 || isAllZero([costBudgeted, costActualToDate, costRemaining, costThisPeriod, costValue])) {
      const defCostPerQty = this.toNumberOrNull(p?.def_cost_per_qty) ?? 0;
  
      const get = (t: any, k: string) => this.toNumberOrNull(t?.[k]) ?? 0;
      const fallbackBudgeted     = tasks.reduce((s, t) => s + get(t, 'target_work_qty') * defCostPerQty, 0);
      const fallbackActual       = tasks.reduce((s, t) => s + get(t, 'act_work_qty')    * defCostPerQty, 0);
      const fallbackRemainQty    = tasks.reduce((s, t) => {
        const rem = this.toNumberOrNull(t?.remain_work_qty);
        if (rem !== null) return s + rem;
        const tgt = get(t, 'target_work_qty');
        const act = get(t, 'act_work_qty');
        return s + Math.max(0, tgt - act);
      }, 0);
      const fallbackThisPeriod   = tasks.reduce((s, t) => s + get(t, 'act_this_per_work_qty') * defCostPerQty, 0);
  
      costBudgeted     = fallbackBudgeted;
      costActualToDate = fallbackActual;
      costRemaining    = fallbackRemainQty * defCostPerQty;
      costThisPeriod   = fallbackThisPeriod;
      costValue        = costActualToDate + costRemaining; // EAC

      
    }

    // --- RESOURCE LOADING (qty) ---
const KQ = {
  budget: ['target_qty', 'budg_qty', 'target_total_qty'],
  actual: ['act_qty', 'actual_qty', 'act_total_qty', 'act_this_qty_to_date'],
  remain: ['remain_qty', 'remaining_qty', 'remain_total_qty'],
  period: ['act_this_per_qty', 'this_per_qty'],
};

let rsrcQtyBudgeted     = sumKeys(trs, KQ.budget);
let rsrcQtyActualToDate = sumKeys(trs, KQ.actual);
let rsrcQtyRemaining    = sumKeys(trs, KQ.remain);
let rsrcQtyThisPeriod   = sumKeys(trs, KQ.period);

// Фоллбэк на TASK.*_work_qty, если в TASKRSRC всё пусто / отсутствует
if (trs.length === 0 || (rsrcQtyBudgeted + rsrcQtyActualToDate + rsrcQtyRemaining + rsrcQtyThisPeriod) === 0) {
  const getN = (t: any, k: string) => this.toNumberOrNull(t?.[k]) ?? 0;

  const sumTargetWork  = tasks.reduce((s, t) => s + getN(t, 'target_work_qty'), 0);
  const sumActWork     = tasks.reduce((s, t) => s + getN(t, 'act_work_qty'), 0);
  const sumRemainWork  = tasks.reduce((s, t) => {
    const rem = this.toNumberOrNull(t?.remain_work_qty);
    if (rem !== null) return s + rem;
    const tgt = getN(t, 'target_work_qty');
    const act = getN(t, 'act_work_qty');
    return s + Math.max(0, tgt - act);
  }, 0);
  const sumThisPerWork = tasks.reduce((s, t) => s + getN(t, 'act_this_per_work_qty'), 0);

  rsrcQtyBudgeted     = sumTargetWork;
  rsrcQtyActualToDate = sumActWork;
  rsrcQtyRemaining    = sumRemainWork;
  rsrcQtyThisPeriod   = sumThisPerWork;
}

const cpi = await computeCPIFromDexie(this.dexie, pid);

const spiRes = await computeSpiForProject(this.dexie, pid, {
  weight: 'work',            // можно переключить на 'equal'
  asOf:  dataDate ?? lastRecalc
});
  
    // Если at-completion исчезающе мал — тоже EAC
    if (!costValue) costValue = costActualToDate + costRemaining || costBudgeted;
  
    return {
      projectId: pid,
      planStart,
      planEnd,
      lastRecalc,
  
      dataDate,
      mustFinish,
  
      // ✨ Cost loading
      costValue,
      costActualToDate,
      costRemaining,
      costBudgeted,
      costThisPeriod,

      baseCurrency,
  
      // Прогрессы
      progressSchedulePct,
      progressPhysicalPct,
      progressCostPct,

      rsrcQtyActualToDate,
      rsrcQtyRemaining,
      rsrcQtyBudgeted,
      rsrcQtyThisPeriod,

      floatSummary,

      spi: {
        asOf: spiRes.asOf,
        EV: spiRes.EV,
        PV: spiRes.PV,
        SPI: spiRes.SPI,
        method: spiRes.method
      },

      cpi: cpi,
  
      // Группировки
      totalTasks,
      byStatus,
      byTaskType,
      byPriorityType,
      byDurationType,
      byRsrcId,
    };
  }

  private async getBaseCurrencyFromDb(projectRow?: any): Promise<string | null> {
    // 1) SUMMARIZE
    try {
      const sum = await this.dexie.getRows('SUMMARIZE');
      const hit = (sum as any[]).find(r =>
        String(r?.name).toLowerCase() === 'basecurrency' ||
        String(r?.i18n).toLowerCase() === 'summarize.basecurrency'
      );
      const val = (hit?.value ?? '').toString().trim();
      if (/^[A-Za-z]{3}$/.test(val)) return val.toUpperCase();
    } catch {}
  
    // 2) PROJECT (возможные варианты)
    const p = projectRow ?? {};
    const candidates = [
      p?.base_currency, p?.base_curr, p?.currency, p?.curr_code,
      p?.base_currency_code, p?.base_curr_code
    ];
    for (const c of candidates) {
      const s = (c ?? '').toString().trim();
      if (/^[A-Za-z]{3}$/.test(s)) return s.toUpperCase();
    }
  
    return null;
  }
}  