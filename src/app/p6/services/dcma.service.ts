import { Injectable, inject } from '@angular/core';
import { P6DexieService } from '../dexie.service';
import { CALENDARRow } from '../models';
import { DcmaCheck10Item, DcmaCheck10Result, DcmaCheck11Item, DcmaCheck11Result, DcmaCheck12Result, DcmaCheck13Result, DcmaCheck14Result, DcmaCheck1Item, DcmaCheck1Options, DcmaCheck1Result, DcmaCheck2LinkItem, DcmaCheck2Result, DcmaCheck3LinkItem, DcmaCheck3Result, DcmaCheck4NonFsItem, DcmaCheck4Result, DcmaCheck5Item, DcmaCheck5Result, DcmaCheck6Item, DcmaCheck6Result, DcmaCheck7Item, DcmaCheck7Result, DcmaCheck8Item, DcmaCheck8Result, DcmaCheck9ActualItem, DcmaCheck9ForecastItem, DcmaCheck9Result, TaskPredRow, TaskRow, TaskRsrcRow } from './dcma.model';
import { isCriticalTaskRow } from '../../state/p6-float.util';

/**
 * Нормализует тип зависимости P6/XER/XML к одному из: FS/SS/FF/SF.
 * Поддерживает коды из разных источников (включая PR_* из XER),
 * числовые коды (0/1/2/3), и текстовые формы.
 */
function normalizeLinkType(v: any): 'FS' | 'SS' | 'FF' | 'SF' | 'UNKNOWN' {
  if (v == null) return 'UNKNOWN';
  const s = String(v).trim().toUpperCase();
  if (!s) return 'UNKNOWN';

  const M: Record<string, 'FS' | 'SS' | 'FF' | 'SF'> = {
    // Finish-to-Start
    'FS': 'FS', 'PR_FS': 'FS', 'FS_REL': 'FS', '0': 'FS',
    'FINISH-TO-START': 'FS', 'FINISH TO START': 'FS', 'FINISHTOSTART': 'FS', 'FINISH START': 'FS',

    // Start-to-Start
    'SS': 'SS', 'PR_SS': 'SS', 'SS_REL': 'SS', '1': 'SS',
    'START-TO-START': 'SS', 'START TO START': 'SS', 'STARTTOSTART': 'SS', 'START START': 'SS',

    // Finish-to-Finish
    'FF': 'FF', 'PR_FF': 'FF', 'FF_REL': 'FF', '2': 'FF',
    'FINISH-TO-FINISH': 'FF', 'FINISH TO FINISH': 'FF', 'FINISHTOFINISH': 'FF', 'FINISH FINISH': 'FF',

    // Start-to-Finish
    'SF': 'SF', 'PR_SF': 'SF', 'SF_REL': 'SF', '3': 'SF',
    'START-TO-FINISH': 'SF', 'START TO FINISH': 'SF', 'STARTTOFINISH': 'SF', 'START FINISH': 'SF',
  };

  return M[s] ?? 'UNKNOWN';
}



@Injectable({ providedIn: 'root' })
export class DcmaCheck1Service {
  private dexie = inject(P6DexieService);



  /**
   * Анализ DCMA Check 1 (Logic) для заданного proj_id.
   * Берём TASK, TASKPRED, при необходимости — PROJECT (для валидации наличия проекта).
   */
  async analyzeCheck1(
    projId: number,
    opts: DcmaCheck1Options = {}
  ): Promise<DcmaCheck1Result> {
    // Defaults
    const excludeTypes = new Set(
      opts.excludeTypes ?? [
        'TT_WBS',       // WBS Summary — исключаем из "eligible"
      ]
    );
    const milestoneTypes = new Set(
      opts.milestoneTypes ?? [
        'TT_Mile',
        'TT_StartMile',
        'TT_FinMile',
      ]
    );
    const includeLists = opts.includeLists ?? true;
    const excludeCompleted = opts.excludeCompleted ?? false;
    const excludeLoEAndHammock = opts.excludeLoEAndHammock ?? true;
    const treatMilestonesAsExceptions = opts.treatMilestonesAsExceptions ?? true;
    const statusMap = opts.statusMap ?? {
      'NOT STARTED': 'NOT_STARTED',
      'IN PROGRESS': 'IN_PROGRESS',
      'COMPLETED': 'COMPLETED',
      'TK_COMPLETE': 'COMPLETED',
      'FINISHED': 'COMPLETED',
    };

    // Загружаем необходимые таблицы
    const [taskRows, predRows, projRows] = await Promise.all([
      this.dexie.getRows('TASK') as Promise<TaskRow[]>,
      this.dexie.getRows('TASKPRED') as Promise<TaskPredRow[]>,
      this.dexie.getRows('PROJECT') as Promise<Array<{ proj_id: number; proj_short_name?: string }>>,
    ]);

    // Быстрая проверка на существование проекта
    const hasProject = projRows.some(p => p.proj_id === projId);
    if (!hasProject) {
      throw new Error(`Проект с proj_id=${projId} не найден в таблице PROJECT.`);
    }

    // После загрузки таблиц: taskIdSet и фильтрация связей только внутри проекта
    const taskIdSet = new Set<number>((taskRows || []).filter(t => t.proj_id === projId).map(t => t.task_id));

    // DQ статистика и карты «всех» связей (до фильтра по проекту)
    const allTaskIdSet = new Set<number>((taskRows || []).map(t => t.task_id));
    let dqDuplicateLinks = 0;
    let dqSelfLoops = 0;
    let dqOrphans = 0;

    const allPredBySucc = new Map<number, TaskPredRow[]>();
    const allSuccByPred = new Map<number, TaskPredRow[]>();
    const seenAll = new Set<string>();

    for (const l of (predRows || [])) {
      if (!l || typeof l.task_id !== 'number' || typeof l.pred_task_id !== 'number') continue;
      const succId = l.task_id;
      const predId = l.pred_task_id;
      if (succId === predId) { dqSelfLoops++; continue; }
      const key = `${succId}|${predId}|${(l.pred_type ?? '').toString().trim()}|${String(l.lag_hr_cnt ?? '')}`;
      if (seenAll.has(key)) { dqDuplicateLinks++; continue; }
      seenAll.add(key);
      if (!allTaskIdSet.has(succId) || !allTaskIdSet.has(predId)) { dqOrphans++; }
      const ap = allPredBySucc.get(succId) ?? []; ap.push(l); allPredBySucc.set(succId, ap);
      const as = allSuccByPred.get(predId) ?? []; as.push(l); allSuccByPred.set(predId, as);
    }

    // Индексы связей: для быстрого поиска предшественников/преемников (только внутри проекта, с дедупликацией)
    const predBySuccessor = new Map<number, TaskPredRow[]>();
    const succByPredecessor = new Map<number, TaskPredRow[]>();
    const seenInternal = new Set<string>();

    for (const link of (predRows || [])) {
      if (!link || typeof link.task_id !== 'number' || typeof link.pred_task_id !== 'number') continue;
      const succId = link.task_id;
      const predId = link.pred_task_id;
      if (succId === predId) continue; // self-loop игнорируем
      if (!taskIdSet.has(succId) || !taskIdSet.has(predId)) continue; // только внутри проекта
      const key = `${succId}|${predId}|${(link.pred_type ?? '').toString().trim()}|${String(link.lag_hr_cnt ?? '')}`;
      if (seenInternal.has(key)) continue; // дедупликация
      seenInternal.add(key);
      const arrPred = predBySuccessor.get(succId) ?? []; arrPred.push(link); predBySuccessor.set(succId, arrPred);
      const arrSucc = succByPredecessor.get(predId) ?? []; arrSucc.push(link); succByPredecessor.set(predId, arrSucc);
    }

    const ignoreLoEAndHammockLinksInLogic = opts.ignoreLoEAndHammockLinksInLogic ?? false;
    const includeDQ = opts.includeDQ ?? true;

    // Helpers: статус, типы, milestone flags
    const normStatus = (s: unknown): 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'UNKNOWN' => {
      const key = (typeof s === 'string' ? s : String(s ?? '')).trim().toUpperCase();
      return statusMap[key] ?? 'UNKNOWN';
    };
    const isLoEOrHammock = (t: TaskRow): boolean => {
      const ty = (t.task_type ?? '').trim().toUpperCase();
      return ty === 'TT_LOE' || ty === 'TT_HAMMOCK' || ty === 'TT_SUMMARY';
    };
    const isStartMilestone = (t: TaskRow): boolean => (t.task_type ?? '').trim() === 'TT_StartMile';
    const isFinishMilestone = (t: TaskRow): boolean => (t.task_type ?? '').trim() === 'TT_FinMile';

    const taskById = new Map<number, TaskRow>();
    for (const t of (taskRows || [])) if (t && typeof t.task_id === 'number') taskById.set(t.task_id, t);

    const counterpartIsOnlyLoEOrHammock = (links: TaskPredRow[], getOtherId: (l: TaskPredRow)=>number): boolean => {
      if (!links || links.length === 0) return false;
      let anyReal = false;
      for (const l of links) {
        const other = taskById.get(getOtherId(l));
        if (!other) continue;
        if (!isLoEOrHammock(other)) { anyReal = true; break; }
      }
      return !anyReal; // true, если все противоположные — LOE/Hammock
    };

    // Eligible: two-phase, compute totalEligibleRaw before exclusions
    const tasksInProject = (taskRows || []).filter(t => t.proj_id === projId);

    // Сначала отсечём WBS
    let eligibleTasks = tasksInProject.filter(t => (t.task_type ?? '').trim() !== 'TT_WBS');
    const totalEligibleRaw = eligibleTasks.length;

    // Счётчики исключений
    let excludedWbs = tasksInProject.length - eligibleTasks.length;
    let excludedCompleted = 0;
    let excludedLoEOrHammock = 0;
    const excludedByType: Record<string, number> = {};

    // Правила исключений из знаменателя
    if (excludeCompleted) {
      const keep = eligibleTasks.filter(t => normStatus(t.status_code) !== 'COMPLETED');
      excludedCompleted = eligibleTasks.length - keep.length;
      eligibleTasks = keep;
    }
    if (excludeLoEAndHammock) {
      const keep = eligibleTasks.filter(t => !isLoEOrHammock(t));
      excludedLoEOrHammock = eligibleTasks.length - keep.length;
      eligibleTasks = keep;
    }
    if (excludeTypes.size) {
      const prevLen = eligibleTasks.length;
      eligibleTasks = eligibleTasks.filter(t => {
        const ty = (t.task_type ?? '').trim();
        if (excludeTypes.has(ty)) {
          excludedByType[ty] = (excludedByType[ty] ?? 0) + 1;
          return false;
        }
        return true;
      });
      // prevLen - eligibleTasks.length распределили по excludedByType
    }

    // Формируем detailItems с причинами/флагами
    const detailItems: DcmaCheck1Item[] = eligibleTasks.map(t => {
      const id = t.task_id;
      const predecessorsAll = allPredBySucc.get(id) ?? [];
      const successorsAll   = allSuccByPred.get(id) ?? [];

      const predecessors = predBySuccessor.get(id) ?? [];
      const successors   = succByPredecessor.get(id) ?? [];

      // Признак наличия внешних соседей (в полном наборе связей)
      const hasExternalPred = predecessorsAll.length > 0 && (predecessors.length === 0);
      const hasExternalSucc = successorsAll.length > 0 && (successors.length === 0);

      let hasPred = predecessors.length > 0;
      let hasSucc = successors.length > 0;

      if (ignoreLoEAndHammockLinksInLogic) {
        if (hasPred && counterpartIsOnlyLoEOrHammock(predecessors, l => l.pred_task_id)) hasPred = false;
        if (hasSucc && counterpartIsOnlyLoEOrHammock(successors, l => l.task_id)) hasSucc = false;
      }

      const isMile = milestoneTypes.has((t.task_type ?? '').trim());
      const st = normStatus(t.status_code);

      let reasonPred: DcmaCheck1Item['reasonMissingPred'] = 'None';
      let reasonSucc: DcmaCheck1Item['reasonMissingSucc'] = 'None';

      if (!hasPred) {
        if (isStartMilestone(t)) reasonPred = 'StartMilestone';
        else if (hasExternalPred) reasonPred = 'ExternalLink';
        else if (isMile) reasonPred = 'ExceptionByRule';
      }
      if (!hasSucc) {
        if (isFinishMilestone(t)) reasonSucc = 'FinishMilestone';
        else if (hasExternalSucc) reasonSucc = 'ExternalLink';
        else if (isMile) reasonSucc = 'ExceptionByRule';
      }

      // Исключён по правилам?
      const excludedFromEligible = false; // уже исключили выше на уровне списка

      return {
        task_id: id,
        task_code: t.task_code,
        task_name: t.task_name,
        wbs_id: t.wbs_id,
        task_type: t.task_type,
        status_code: t.status_code,
        status_norm: st,
        hasPredecessor: hasPred,
        hasSuccessor: hasSucc,
        isMilestone: isMile,
        reasonMissingPred: reasonPred,
        reasonMissingSucc: reasonSucc,
        excludedFromEligible,
      };
    });

    // Выделяем нарушения с учётом treatMilestonesAsExceptions
    const isPredViolation = (i: DcmaCheck1Item) => !i.hasPredecessor && !(treatMilestonesAsExceptions && (i.reasonMissingPred === 'StartMilestone' || i.reasonMissingPred === 'ExceptionByRule'));
    const isSuccViolation = (i: DcmaCheck1Item) => !i.hasSuccessor && !(treatMilestonesAsExceptions && (i.reasonMissingSucc === 'FinishMilestone' || i.reasonMissingSucc === 'ExceptionByRule'));

    const missingPredList = detailItems.filter(isPredViolation);
    const missingSuccList = detailItems.filter(isSuccViolation);
    const missingBothList = detailItems.filter(i => isPredViolation(i) && isSuccViolation(i));

    const totalEligible = detailItems.length; // после исключений
    const missingAnySet = new Set<number>();
    for (const i of missingPredList) missingAnySet.add(i.task_id);
    for (const i of missingSuccList) missingAnySet.add(i.task_id);

    const uniqueMissingAny = missingAnySet.size;
    const percentMissingAny = totalEligible > 0 ? (uniqueMissingAny / totalEligible) * 100 : 0;
    const threshold5PercentValue = Math.ceil(totalEligible * 0.05);
    const threshold5PercentExceeded = percentMissingAny > 5;

    const result: DcmaCheck1Result = {
      proj_id: projId,
      totalEligibleRaw,
      totalEligible,
      missingPredecessor: missingPredList.length,
      missingSuccessor: missingSuccList.length,
      missingBoth: missingBothList.length,
      uniqueMissingAny,
      percentMissingAny: round2(percentMissingAny),
      threshold5PercentValue,
      threshold5PercentExceeded,
      details: includeLists ? {
        items: detailItems,
        missingPredList,
        missingSuccList,
        missingBothList,
        exclusions: {
          excludedWbs,
          excludedCompleted,
          excludedLoEOrHammock,
          excludedByType,
        },
        dq: includeDQ ? {
          duplicateLinks: dqDuplicateLinks,
          selfLoops: dqSelfLoops,
          orphanLinks: dqOrphans,
        } : undefined,
      } : undefined,
    };

    return result;
  }

  /**
   * DCMA Check 14 — Baseline Execution Index (BEI)
   * BEI = (фактически завершено к Data Date) / (по БП должно быть завершено к Data Date)
   * Устойчивый расчёт:
   *  - сравнение дат на уровне ДНЯ (UTC) — без дрейфа TZ/DST
   *  - многоисточниковый Data Date (PROJECT)
   *  - Baseline Finish ищем среди нескольких полей (как в Check 13)
   *  - исключаем WBS Summary из знаменателя
   */
  async analyzeCheck14(
    projId: number,
    includeDetails: boolean = true,
  ): Promise<DcmaCheck14Result> {
    const [taskRows, projRowsRaw] = await Promise.all([
      this.dexie.getRows('TASK') as Promise<TaskRow[]>,
      this.dexie.getRows('PROJECT') as Promise<Array<Record<string, any>>>,
    ]);

    const proj = (projRowsRaw || []).find(p => p['proj_id'] === projId);
    if (!proj) throw new Error(`Проект с proj_id=${projId} не найден в PROJECT.`);

    // Строгий парсер дат и сравнение по дню (UTC)
    const toDateStrict = (v: unknown): Date | null => {
      if (v == null) return null;
      if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
      const s = String(v).trim();
      if (!s) return null;
      const iso = s.includes('T') ? s : (s.length === 10 ? `${s}T00:00:00` : s.replace(' ', 'T'));
      const d = new Date(iso);
      return isNaN(d.getTime()) ? null : d;
    };
    const dayUTC = (d: Date): number => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

    // Data Date (PROJECT)
    const ddRaw = proj['data_date'] ?? proj['last_recalc_date'] ?? proj['last_sched_date'] ?? proj['cur_data_date'] ?? null;
    if (!ddRaw) throw new Error('Не найдена Data Date в PROJECT (ожидается data_date/last_recalc_date/last_sched_date/cur_data_date).');
    const dataDate = toDateStrict(ddRaw);
    if (!dataDate) throw new Error(`Невалидная Data Date: ${String(ddRaw)}`);
    const dataDay = dayUTC(dataDate);

    // Набор задач проекта
    const tasksInProject = (taskRows || []).filter(t => t.proj_id === projId);

    // Вспомогательные
    const isWbs = (t: TaskRow) => ((t.task_type ?? '').trim() === 'TT_WBS');
    const isCompleted = (v: unknown): boolean => {
      const s = (typeof v === 'string' ? v : String(v ?? '')).trim().toUpperCase();
      return s === 'COMPLETED' || s === 'TK_COMPLETE' || s === 'FINISHED';
    };

    const BL_FIELDS: (keyof TaskRow | string)[] = [
      'bl1_finish_date','bl_finish_date','baseline_finish_date','target_end_date','target_finish_date'
    ];
    const getBaselineFinish = (t: TaskRow): Date | null => {
      for (const k of BL_FIELDS) {
        const d = toDateStrict((t as any)[k]);
        if (d) return d;
      }
      return null;
    };

    // Eligible: исключаем WBS Summary
    const eligible = tasksInProject.filter(t => !isWbs(t));

    // По БП должны быть завершены к DD: BL Finish <= DD (сравнение по дню UTC)
    const plannedSet: TaskRow[] = [];
    for (const t of eligible) {
      const blf = getBaselineFinish(t);
      if (blf && dayUTC(blf) <= dataDay) plannedSet.push(t);
    }

    // Фактически завершены к DD: AF <= DD (UTC-день) ИЛИ статус Completed при отсутствии AF
    const actuallySet: TaskRow[] = [];
    for (const t of eligible) {
      const af = toDateStrict(t.act_end_date);
      if (af) {
        if (dayUTC(af) <= dataDay) actuallySet.push(t);
      } else if (isCompleted(t.status_code)) {
        // Статус говорит, что завершено, но AF не задан — считаем завершённой к DD
        actuallySet.push(t);
      }
    }

    const plannedToComplete = plannedSet.length;
    const actuallyCompleted = actuallySet.length;

    let bei: number | null = null;
    let within: boolean | null = null;
    if (plannedToComplete > 0) {
      bei = Math.round(((actuallyCompleted / plannedToComplete) * 10000)) / 10000; // 4 знака
      within = bei >= 0.95; // ниже 0.95 — провал
    }

    const details = includeDetails ? {
      plannedButNotCompleted: plannedSet
        .filter(t => !actuallySet.includes(t))
        .map(t => ({
          task_id: t.task_id,
          task_code: t.task_code,
          task_name: t.task_name,
          baseline_finish: (t as any).bl1_finish_date ?? (t as any).bl_finish_date ?? (t as any).baseline_finish_date ?? (t as any).target_end_date ?? (t as any).target_finish_date ?? null,
        })),
      completedAheadOfPlan: actuallySet
        .filter(t => {
          const blf = getBaselineFinish(t);
          const af = toDateStrict(t.act_end_date);
          return !!af && blf !== null && dayUTC(af) <= dataDay && dayUTC(blf) > dataDay; // завершили к DD, хотя по БП позже
        })
        .map(t => ({
          task_id: t.task_id,
          task_code: t.task_code,
          task_name: t.task_name,
          act_finish: t.act_end_date,
          baseline_finish: (t as any).bl1_finish_date ?? (t as any).bl_finish_date ?? (t as any).baseline_finish_date ?? (t as any).target_end_date ?? (t as any).target_finish_date ?? null,
        })),
    } : undefined;

    return {
      proj_id: projId,
      dataDateISO: dataDate.toISOString(),
      plannedToComplete,
      actuallyCompleted,
      bei,
      beiWithin95pct: within,
      details,
    };
  }

  /**
   * DCMA Check 12 — Critical Path Test (усиленная эвристика без пересчёта расписания):
   * 1) Критические задачи: |TF| ≤ floatThresholdHours, где TF стабильно переводим в ЧАСЫ с учётом календаря задачи.
   * 2) Строим подграф только по задачам проекта (внутренние связи, без дублей/самосвязей).
   * 3) Считаем стартовые/конечные узлы, компоненты связности и проверяем совпадение финального узла с проектным финишем.
   */
  async analyzeCheck12(
    projId: number,
    includeDetails: boolean = true,
    options?: { hoursPerDay?: number; floatThresholdHours?: number; simulatedDelayDays?: number },
  ): Promise<DcmaCheck12Result> {
    const hoursPerDayFallback = options?.hoursPerDay ?? 8;
    const floatThresholdHoursOpt = options?.floatThresholdHours; // если не задано — определим от календарей
    const simulatedDelayDays = options?.simulatedDelayDays ?? 600;

    const [taskRows, predRows, projRows, calRows] = await Promise.all([
      this.dexie.getRows('TASK') as Promise<TaskRow[]>,
      this.dexie.getRows('TASKPRED') as Promise<TaskPredRow[]>,
      this.dexie.getRows('PROJECT') as Promise<Array<{ proj_id: number }>>,
      this.dexie.getRows('CALENDAR') as Promise<CALENDARRow[]>,
    ]);

    const hasProject = projRows.some(p => p.proj_id === projId);
    if (!hasProject) throw new Error(`Проект с proj_id=${projId} не найден в PROJECT.`);

    // Новый блок: фильтрация задач, исключение служебных типов, определение критических с помощью util
    const tasksInProject = (taskRows || []).filter(t => t.proj_id === projId);

    // Исключаем служебные типы из анализа КП
    const EXCLUDE_TYPES = new Set(['TT_WBS','TT_LOE','TT_HAMMOCK','TT_SUMMARY','TT_TMPL','TT_Tmpl']);
    const isExcludedType = (t: TaskRow) => EXCLUDE_TYPES.has(((t.task_type ?? '').trim().toUpperCase()));
    const baseTasks = tasksInProject.filter(t => !isExcludedType(t) && (t.status_code ?? '').toString().toUpperCase() !== 'TK_INACTIVE');

    const taskIdSet = new Set<number>(baseTasks.map(t => t.task_id));

    // Индекс календарей и HPD для задач
    const calById = new Map<string | number, CALENDARRow>();
    for (const c of (calRows || [])) if (c && c.clndr_id != null) calById.set(c.clndr_id, c);
    const getHpd = (t: TaskRow | undefined): number => {
      if (!t) return hoursPerDayFallback;
      const cal = t?.clndr_id != null ? calById.get(t.clndr_id) : undefined;
      const h =
        cal?.hours_per_day_eff ??
        cal?.day_hr_cnt ??
        (cal?.week_hr_cnt != null ? cal.week_hr_cnt / 5 : null) ??
        (cal?.month_hr_cnt != null ? cal.month_hr_cnt / 21.667 : null) ??
        (cal?.year_hr_cnt != null ? cal.year_hr_cnt / 260 : null);
      return (typeof h === 'number' && h > 0) ? h : hoursPerDayFallback;
    };

    // Если порог не задан — возьмём 0.5 * медианные HPD по проекту (надёжнее чем константа)
    const projectHpds = baseTasks.map(t => getHpd(t)).filter(h => typeof h === 'number' && h > 0).sort((a,b)=>a-b);
    const medianHpd = projectHpds.length ? projectHpds[Math.floor(projectHpds.length/2)] : hoursPerDayFallback;
    const floatThresholdHours = floatThresholdHoursOpt ?? Math.max(1, Math.round(0.5 * medianHpd));

    // Критические задачи определяем через общий util с допуском (epsilonHours)
    const criticalTasks = baseTasks.filter(t => {
      const hpd = getHpd(t);
      const eps = Math.max(1, Math.round(hpd * 0.05));
      return isCriticalTaskRow(t as any, { hoursPerDay: hpd, epsilonHours: eps });
    });
    const criticalIds = new Set<number>(criticalTasks.map(t => t.task_id));

    // Построение подграфа по связям внутри проекта (дедупликация и DQ)
    const seen = new Set<string>();
    let dqDuplicate = 0, dqSelf = 0, dqExternal = 0;
    const edges: Array<{ pred: number; succ: number }> = [];

    for (const l of (predRows || [])) {
      if (!l || typeof l.task_id !== 'number' || typeof l.pred_task_id !== 'number') continue;
      const succId = l.task_id;
      const predId = l.pred_task_id;
      if (!(taskIdSet.has(succId) && taskIdSet.has(predId))) { dqExternal++; continue; }
      if (succId === predId) { dqSelf++; continue; }
      const key = `${succId}|${predId}`;
      if (seen.has(key)) { dqDuplicate++; continue; }
      seen.add(key);
      if (criticalIds.has(succId) && criticalIds.has(predId)) {
        edges.push({ pred: predId, succ: succId });
      }
    }

    // Индексы входящих/исходящих внутри КП
    const inDeg = new Map<number, number>();
    const outDeg = new Map<number, number>();
    for (const id of criticalIds) { inDeg.set(id, 0); outDeg.set(id, 0); }
    for (const e of edges) {
      inDeg.set(e.succ, (inDeg.get(e.succ) ?? 0) + 1);
      outDeg.set(e.pred, (outDeg.get(e.pred) ?? 0) + 1);
    }

    const startNodes = [...criticalIds].filter(id => (inDeg.get(id) ?? 0) === 0);
    const endNodes   = [...criticalIds].filter(id => (outDeg.get(id) ?? 0) === 0);

    // Компоненты связности в подграфе КП
    const adj = new Map<number, number[]>();
    const rev = new Map<number, number[]>();
    for (const id of criticalIds) { adj.set(id, []); rev.set(id, []); }
    for (const e of edges) { adj.get(e.pred)!.push(e.succ); rev.get(e.succ)!.push(e.pred); }

    const seenC = new Set<number>();
    let components = 0;
    for (const id of criticalIds) {
      if (seenC.has(id)) continue;
      components++;
      // BFS по неориентированному эквиваленту (учитываем пред/след)
      const q: number[] = [id];
      seenC.add(id);
      while (q.length) {
        const v = q.shift()!;
        for (const w of (adj.get(v) ?? [])) if (!seenC.has(w)) { seenC.add(w); q.push(w); }
        for (const w of (rev.get(v) ?? [])) if (!seenC.has(w)) { seenC.add(w); q.push(w); }
      }
    }

    // Проектный финиш (forecast) — максимум EF (fallback LF/AF), сравнение на уровне дня
    const toDate = (v: unknown): Date | null => {
      if (!v) return null; const d = (v instanceof Date) ? v : new Date(String(v)); return isNaN(d.getTime()) ? null : d;
    };
    const dayUTC = (d: Date): number => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

    let projectForecastFinish: Date | null = null;
    for (const t of baseTasks) {
      const ef = toDate((t as any).early_end_date) || toDate((t as any).late_end_date) || toDate((t as any).act_end_date);
      if (ef && (!projectForecastFinish || ef > projectForecastFinish)) projectForecastFinish = ef;
    }

    let reachedProjectFinish = false;
    if (projectForecastFinish) {
      const finishDay = dayUTC(projectForecastFinish);
      for (const t of criticalTasks) {
        const ef = toDate((t as any).early_end_date) || toDate((t as any).late_end_date) || toDate((t as any).act_end_date);
        if (ef && dayUTC(ef) === finishDay) { reachedProjectFinish = true; break; }
      }
    }

    const isSingleChain = (startNodes.length === 1 && endNodes.length === 1 && components === 1);

    const result: DcmaCheck12Result = {
      proj_id: projId,
      simulatedDelayDays,
      criticalCount: criticalTasks.length,
      floatThresholdHours,
      startNodesOnCP: startNodes.length,
      endNodesOnCP: endNodes.length,
      isSingleChain,
      reachedProjectFinish,
      testPassLikely: isSingleChain && reachedProjectFinish && criticalTasks.length > 0,
      details: includeDetails ? {
        criticalTaskIds: [...criticalIds],
        dq: { duplicateLinks: dqDuplicate, selfLoops: dqSelf, externalLinks: dqExternal, components },
      } : undefined,
    };

    return result;
  }

  /**
   * DCMA Check 13 — Critical Path Length Index (CPLI)
   * CPLI = (CPL + PTF) / CPL, где:
   *  - CPL — (Forecast Project Finish − Data Date) в КАЛЕНДАРНЫХ днях (UTC‑дни; без TZ-дрейфа)
   *  - PTF — (Baseline Project Finish − Forecast Project Finish) в календарных днях
   * Политика устойчивости расчёта:
   *  - Data Date парсится строго из PROJECT (несколько кандидатов), форматоустойчиво.
   *  - Forecast Finish = максимум из EF (fallback LF, затем AF) по задачам проекта.
   *  - Baseline Finish = максимум среди наборов BL‑полей по задачам; если нет — CPLI не вычисляется (null).
   *  - Все сравнения и разности считаются на уровне ДНЯ (UTC) для исключения эффекта часовых поясов.
   */
  async analyzeCheck13(
    projId: number,
    options?: { hoursPerDay?: number },
  ): Promise<DcmaCheck13Result> {
    // helper: строгий парсер дат и срез до дня (UTC)
    const toDateStrict = (v: unknown): Date | null => {
      if (v == null) return null;
      if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
      const s = String(v).trim();
      if (!s) return null;
      const iso = s.includes('T') ? s : (s.length === 10 ? `${s}T00:00:00` : s.replace(' ', 'T'));
      const d = new Date(iso);
      return isNaN(d.getTime()) ? null : d;
    };
    const dayUTC = (d: Date): number => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    const daysDiffUTC = (a: Date, b: Date): number => {
      const A = dayUTC(a), B = dayUTC(b);
      const MS_IN_DAY = 24 * 3600 * 1000;
      return (A - B) / MS_IN_DAY;
    };
    // Новый helper для расчёта дат проекта — гарантирует non-null Baseline Finish (fallback к прогнозу)
    const resolveProjectDates = (proj: any, tasks: TaskRow[]) => {
      let forecastFinish: Date | null = null;
      for (const t of tasks) {
        const ef = toDateStrict((t as any).early_end_date);
        const lf = toDateStrict((t as any).late_end_date);
        const af = toDateStrict((t as any).act_end_date);
        const candidate = ef || lf || af || null;
        if (candidate && (!forecastFinish || candidate > forecastFinish)) forecastFinish = candidate;
      }

      const BL_FIELDS = ['bl1_finish_date','bl_finish_date','baseline_finish_date','target_end_date','target_finish_date'];
      let baselineFinish: Date | null = null;
      for (const t of tasks) {
        for (const k of BL_FIELDS) {
          const d = toDateStrict((t as any)[k]);
          if (d && (!baselineFinish || d > baselineFinish)) baselineFinish = d;
        }
      }

      // Fallback #1: если нет baselineFinish, но есть критические задачи по простому признаку TF<=0, приравниваем к прогнозу
      if (!baselineFinish) {
        const critTasks = tasks.filter(tt => {
          const tfh = (tt as any).total_float_hr_cnt; // часы
          const tfr = (tt as any).TotalFloat;         // сырое TF (часы/дни — знак важен)
          const tfv = (tfh != null ? Number(tfh) : (tfr != null ? Number(tfr) : null));
          return tfv != null && !Number.isNaN(tfv) && tfv <= 0;
        });
        if (critTasks.length && forecastFinish) baselineFinish = forecastFinish;
      }

      // Fallback #2: самый надёжный — если baseline не удалось определить вовсе, но прогноз есть —
      // считаем PTF==0 (baseline=forecast) для совместимости XER/XML.
      if (!baselineFinish && forecastFinish) baselineFinish = forecastFinish;

      return { forecastFinish, baselineFinish };
    };

    const [taskRows, projRowsRaw] = await Promise.all([
      this.dexie.getRows('TASK') as Promise<TaskRow[]>,
      this.dexie.getRows('PROJECT') as Promise<Array<Record<string, any>>>,
    ]);

    const proj = (projRowsRaw || []).find(p => p['proj_id'] === projId);
    if (!proj) throw new Error(`Проект с proj_id=${projId} не найден в PROJECT.`);

    // Data Date (обязательна)
    const ddRaw = proj['data_date'] ?? proj['last_recalc_date'] ?? proj['last_sched_date'] ?? proj['cur_data_date'] ?? null;
    if (!ddRaw) throw new Error('Не найдена Data Date в PROJECT (ожидается data_date/last_recalc_date/last_sched_date/cur_data_date).');
    const dataDate = toDateStrict(ddRaw);
    if (!dataDate) throw new Error(`Невалидная Data Date: ${String(ddRaw)}`);

    // Фильтруем задачи проекта
    const tasksInProject = (taskRows || []).filter(t => t.proj_id === projId);
    // Используем helper для дат проекта
    const { forecastFinish, baselineFinish } = resolveProjectDates(proj, tasksInProject);

    const base: DcmaCheck13Result = { proj_id: projId } as DcmaCheck13Result;

    if (!forecastFinish) {
      // Нет прогнозного финиша — CPLI не вычислить
      return {
        ...base,
        dataDateISO: dataDate.toISOString(),
        forecastFinishISO: undefined,
        baselineFinishISO: baselineFinish?.toISOString() ?? null,
        criticalPathLengthDays: null,
        projectTotalFloatDays: null,
        cpli: null,
        cpliWithin5pct: null,
      };
    }

    // CPL — разница Forecast − DataDate в календарных днях (UTC‑дни)
    const CPL = Math.max(0, Math.round(daysDiffUTC(forecastFinish, dataDate) * 100) / 100);

    // Если нет Baseline Finish — по DCMA CPLI корректно не вычислять
    if (!baselineFinish) {
      return {
        ...base,
        dataDateISO: dataDate.toISOString(),
        forecastFinishISO: forecastFinish.toISOString(),
        baselineFinishISO: null,
        criticalPathLengthDays: CPL,
        projectTotalFloatDays: null,
        cpli: null,
        cpliWithin5pct: null,
      };
    }

    // PTF — Baseline − Forecast (может быть отрицательным, если опережаем план)
    const PTF = Math.round(daysDiffUTC(baselineFinish, forecastFinish) * 100) / 100;

    if (CPL <= 0) {
      // Нулевая/отрицательная критическая длина — CPLI бессмысленно
      return {
        ...base,
        dataDateISO: dataDate.toISOString(),
        forecastFinishISO: forecastFinish.toISOString(),
        baselineFinishISO: baselineFinish.toISOString(),
        criticalPathLengthDays: CPL,
        projectTotalFloatDays: PTF,
        cpli: null,
        cpliWithin5pct: null,
      };
    }

    const cpli = Math.round((((CPL + PTF) / CPL) * 10000)) / 10000; // 4 знака
    const cpliWithin5pct = (cpli >= 0.95 && cpli <= 1.05);

    return {
      ...base,
      dataDateISO: dataDate.toISOString(),
      forecastFinishISO: forecastFinish.toISOString(),
      baselineFinishISO: baselineFinish.toISOString(),
      criticalPathLengthDays: CPL,
      projectTotalFloatDays: PTF,
      cpli,
      cpliWithin5pct,
    };
  }

  /**
   * DCMA Check 2 — Leads: связи с отрицательным лагом должны отсутствовать.
   * Считаем % lead-связей (lag_hr_cnt < 0) от всех связей внутри проекта.
   */
  async analyzeCheck2(
    projId: number,
    includeDetails: boolean = true,
    options?: { hoursPerDay?: number },
  ): Promise<DcmaCheck2Result> {
    // Загружаем необходимые таблицы
    const [taskRows, predRows, projRows, calRows] = await Promise.all([
      this.dexie.getRows('TASK') as Promise<TaskRow[]>,
      this.dexie.getRows('TASKPRED') as Promise<TaskPredRow[]>,
      this.dexie.getRows('PROJECT') as Promise<Array<{ proj_id: number; proj_short_name?: string }>>,
      this.dexie.getRows('CALENDAR') as Promise<CALENDARRow[]>,
    ]);

    // Проверяем проект
    const hoursPerDay = options?.hoursPerDay ?? 8;
    const hasProject = projRows.some(p => p.proj_id === projId);
    if (!hasProject) {
      throw new Error(`Проект с proj_id=${projId} не найден в таблице PROJECT.`);
    }

    // Множество task_id проекта (берём все типы — для Check 2 учитываются все связи внутри плана)
    const tasksInProject = (taskRows || []).filter(t => t.proj_id === projId);
    const taskIdSet = new Set<number>(tasksInProject.map(t => t.task_id));

    // Индекс для быстрых подписей код/имя
    const taskById = new Map<number, TaskRow>();
    for (const t of tasksInProject) taskById.set(t.task_id, t);

    // Календарь: часы/день по clndr_id преемника
    const calById2 = new Map<string | number, CALENDARRow>();
    for (const c of (calRows || [])) if (c && c.clndr_id != null) calById2.set(c.clndr_id, c);
    const getHpd2 = (t: TaskRow | undefined): number => {
      if (!t) return hoursPerDay; // фолбэк к аргументу
      const cal = t?.clndr_id != null ? calById2.get(t.clndr_id) : undefined;
      const h =
        cal?.hours_per_day_eff ??
        cal?.day_hr_cnt ??
        (cal?.week_hr_cnt != null ? cal.week_hr_cnt / 5 : null) ??
        (cal?.month_hr_cnt != null ? cal.month_hr_cnt / 21.667 : null) ??
        (cal?.year_hr_cnt != null ? cal.year_hr_cnt / 260 : null);
      return (typeof h === 'number' && h > 0) ? h : hoursPerDay;
    };

    // Связи внутри проекта с дедупликацией и фильтрами качества
    const seen = new Set<string>();
    let dqDuplicateLinks = 0, dqSelfLoops = 0, dqExternal = 0;
    const linksInProject: TaskPredRow[] = [];

    for (const l of (predRows || [])) {
      if (!l || typeof l.task_id !== 'number' || typeof l.pred_task_id !== 'number') continue;
      const succId = l.task_id;
      const predId = l.pred_task_id;
      if (succId === predId) { dqSelfLoops++; continue; }
      const internal = taskIdSet.has(succId) && taskIdSet.has(predId);
      if (!internal) { dqExternal++; continue; }
     const key = `${succId}|${predId}|${normalizeLinkType(l.pred_type)}|${String(l.lag_hr_cnt ?? '')}|${String(l.lag_units ?? '')}|${String(l.lag_raw ?? '')}`;
      seen.add(key);
      linksInProject.push(l);
    }

    const totalRelationships = linksInProject.length;

    // Определяем lead (отрицательный лаг), учитывая юниты/сырые значения
    const parseNum = (s: unknown): number | null => {
      if (s == null) return null;
      const n = typeof s === 'number' ? s : Number(String(s).replace(/[,\s]+/g, ''));
      return Number.isFinite(n) ? n : null;
    };
    const toHours = (l: TaskPredRow): { hrs: number; hpd: number } => {
      const succ = taskById.get(l.task_id);
      const hpd = getHpd2(succ);
      // 1) если lag_hr_cnt задан и конечен — используем его
      const direct = parseNum(l.lag_hr_cnt);
      if (direct != null) return { hrs: direct, hpd };
      // 2) пробуем из lag_raw + lag_units
      const raw = parseNum(l.lag_raw);
      const u = String(l.lag_units ?? '').trim().toUpperCase();
      if (raw == null) return { hrs: 0, hpd };
      if (u === 'H' || u === 'HR' || u === 'HRS' || u === 'HOUR' || u === 'HOURS') return { hrs: raw, hpd };
      if (u === 'D' || u === 'DAY' || u === 'DAYS') return { hrs: raw * hpd, hpd };
      if (u === 'W' || u === 'WK' || u === 'WKS' || u === 'WEEK' || u === 'WEEKS') return { hrs: raw * hpd * 5, hpd };
      if (u === 'MO' || u === 'MON' || u === 'MONS' || u === 'MONTH' || u === 'MONTHS') return { hrs: raw * hpd * 21.667, hpd };
      // неизвестные юниты — считаем 0, чтобы не вносить шум
      return { hrs: 0, hpd };
    };

    const leadLinks = linksInProject.filter(l => toHours(l).hrs < 0);

    // Детализация
    const leads: DcmaCheck2LinkItem[] = includeDetails
      ? leadLinks.map(l => {
          const pred = taskById.get(l.pred_task_id);
          const succ = taskById.get(l.task_id);
          const conv = toHours(l);
          const lagHrs = conv.hrs;
          const hpd = conv.hpd;
          return {
            predecessor_task_id: l.pred_task_id,
            successor_task_id: l.task_id,
            predecessor_code: pred?.task_code ?? l.predecessor_code,
            predecessor_name: pred?.task_name,
            successor_code: succ?.task_code ?? l.successor_code,
            successor_name: succ?.task_name,
            link_type: normalizeLinkType(l.pred_type),
            lag_hr_cnt: lagHrs,
            lag_days_8h: Math.round((lagHrs / hpd) * 100) / 100,
            lag_units: l.lag_units ?? null,
            lag_raw: l.lag_raw ?? null,
            hours_per_day_used: hpd,
          };
        })
      : [];

    const leadCount = leadLinks.length;
    const leadPercent = totalRelationships > 0 ? (leadCount / totalRelationships) * 100 : 0;

    const result: DcmaCheck2Result = {
      proj_id: projId,
      totalRelationships,
      leadCount: leadLinks.length,
      leadPercent: Math.round(((totalRelationships > 0 ? (leadLinks.length / totalRelationships) * 100 : 0)) * 100) / 100,
      thresholdZeroViolated: leadLinks.length > 0,
      details: includeDetails ? {
        leads,
        dq: { duplicateLinks: dqDuplicateLinks, selfLoops: dqSelfLoops, externalLinks: dqExternal },
      } : undefined,
    };

    return result;
  }

  /**
   * DCMA Check 3 — Lags: допускается не более 5% связей с положительным лагом.
   * Считаем % lag-связей (lag_hr_cnt > 0) от всех связей внутри проекта.
   */
  async analyzeCheck3(
    projId: number,
    includeDetails: boolean = true,
  ): Promise<DcmaCheck3Result> {
    const [taskRows, predRows, projRows, calRows] = await Promise.all([
      this.dexie.getRows('TASK') as Promise<TaskRow[]>,
      this.dexie.getRows('TASKPRED') as Promise<TaskPredRow[]>,
      this.dexie.getRows('PROJECT') as Promise<Array<{ proj_id: number; proj_short_name?: string }>>,
      this.dexie.getRows('CALENDAR') as Promise<CALENDARRow[]>,
    ]);

    const hasProject = projRows.some(p => p.proj_id === projId);
    if (!hasProject) {
      throw new Error(`Проект с proj_id=${projId} не найден в таблице PROJECT.`);
    }

    const tasksInProject = (taskRows || []).filter(t => t.proj_id === projId);
    const taskIdSet = new Set<number>(tasksInProject.map(t => t.task_id));

    const taskById = new Map<number, TaskRow>();
    for (const t of tasksInProject) taskById.set(t.task_id, t);

    // Календарь: часы/день по clndr_id
    const calById3 = new Map<string | number, CALENDARRow>();
    for (const c of (calRows || [])) if (c && c.clndr_id != null) calById3.set(c.clndr_id, c);
    const getHpd3 = (t: TaskRow | undefined): number => {
      if (!t) return 8; // жёсткий фолбэк на случай отсутствия календаря
      const cal = t?.clndr_id != null ? calById3.get(t.clndr_id) : undefined;
      const h =
        cal?.hours_per_day_eff ??
        cal?.day_hr_cnt ??
        (cal?.week_hr_cnt != null ? cal.week_hr_cnt / 5 : null) ??
        (cal?.month_hr_cnt != null ? cal.month_hr_cnt / 21.667 : null) ??
        (cal?.year_hr_cnt != null ? cal.year_hr_cnt / 260 : null);
      return (typeof h === 'number' && h > 0) ? h : 8;
    };

    // Связи внутри проекта с дедупликацией и подсчётом DQ
    const seen = new Set<string>();
    let duplicateCount = 0;
    let selfLoopCount = 0;
    let externalCount = 0;
    const linksInProject: TaskPredRow[] = [];
    for (const l of (predRows || [])) {
      if (!l || typeof l.task_id !== 'number' || typeof l.pred_task_id !== 'number') continue;
      const succId = l.task_id;
      const predId = l.pred_task_id;
      if (!(taskIdSet.has(succId) && taskIdSet.has(predId))) {
        externalCount++;
        continue;
      }
      if (succId === predId) {
        selfLoopCount++;
        continue; // self-loop игнорируем
      }
      const key = `${succId}|${predId}|${normalizeLinkType(l.pred_type)}|${String(l.lag_hr_cnt ?? '')}|${String(l.lag_units ?? '')}|${String(l.lag_raw ?? '')}`;
      if (seen.has(key)) {
        duplicateCount++;
        continue; // дедупликация
      }
      seen.add(key);
      linksInProject.push(l);
    }

    const totalRelationships = linksInProject.length;

    const parseNum3 = (s: unknown): number | null => {
      if (s == null) return null;
      const n = typeof s === 'number' ? s : Number(String(s).replace(/[\,\s]+/g, ''));
      return Number.isFinite(n) ? n : null;
    };
    const toHours3 = (l: TaskPredRow): { hrs: number; hpd: number } => {
      const succ = taskById.get(l.task_id);
      const hpd = getHpd3(succ);
      const direct = parseNum3(l.lag_hr_cnt);
      if (direct != null) return { hrs: direct, hpd };
      const raw = parseNum3(l.lag_raw);
      const u = String(l.lag_units ?? '').trim().toUpperCase();
      if (raw == null) return { hrs: 0, hpd };
      if (u === 'H' || u === 'HR' || u === 'HRS' || u === 'HOUR' || u === 'HOURS') return { hrs: raw, hpd };
      if (u === 'D' || u === 'DAY' || u === 'DAYS') return { hrs: raw * hpd, hpd };
      if (u === 'W' || u === 'WK' || u === 'WKS' || u === 'WEEK' || u === 'WEEKS') return { hrs: raw * hpd * 5, hpd };
      if (u === 'MO' || u === 'MON' || u === 'MONS' || u === 'MONTH' || u === 'MONTHS') return { hrs: raw * hpd * 21.667, hpd };
      return { hrs: 0, hpd };
    };

    const lagLinks = linksInProject.filter(l => toHours3(l).hrs > 0);

    const lags: DcmaCheck3LinkItem[] = includeDetails
      ? lagLinks.map(l => {
          const pred = taskById.get(l.pred_task_id);
          const succ = taskById.get(l.task_id);
          const conv = toHours3(l);
          const lagHrs = conv.hrs;
          const hpd = conv.hpd;
          return {
            predecessor_task_id: l.pred_task_id,
            successor_task_id: l.task_id,
            predecessor_code: pred?.task_code,
            predecessor_name: pred?.task_name,
            successor_code: succ?.task_code,
            successor_name: succ?.task_name,
            link_type: normalizeLinkType(l.pred_type),
            lag_hr_cnt: lagHrs,
            lag_days_8h: Math.round((lagHrs / hpd) * 100) / 100,
            lag_units: l.lag_units ?? null,
            lag_raw: l.lag_raw ?? null,
            hours_per_day_used: hpd,
          };
        })
      : [];

    const lagCount = lagLinks.length;
    const lagPercent = totalRelationships > 0 ? (lagCount / totalRelationships) * 100 : 0;

    const result: DcmaCheck3Result = {
      proj_id: projId,
      totalRelationships,
      lagCount,
      lagPercent: Math.round(lagPercent * 100) / 100,
      threshold5PercentExceeded: lagPercent > 5,
      details: includeDetails
        ? {
            lags,
            dq: {
              duplicateLinks: duplicateCount,
              selfLoops: selfLoopCount,
              externalLinks: externalCount,
            },
          }
        : undefined,
    };

    return result;
  }

  /**
   * DCMA Check 4 — Relationship Types: FS должно быть ≥ 90%.
   */
  async analyzeCheck4(
    projId: number,
    includeDetails: boolean = true,
  ): Promise<DcmaCheck4Result> {
    const [taskRows, predRows, projRows] = await Promise.all([
      this.dexie.getRows('TASK') as Promise<TaskRow[]>,
      this.dexie.getRows('TASKPRED') as Promise<TaskPredRow[]>,
      this.dexie.getRows('PROJECT') as Promise<Array<{ proj_id: number; proj_short_name?: string }>>,
    ]);

    const hasProject = projRows.some(p => p.proj_id === projId);
    if (!hasProject) {
      throw new Error(`Проект с proj_id=${projId} не найден в таблице PROJECT.`);
    }

    const tasksInProject = (taskRows || []).filter(t => t.proj_id === projId);
    const taskIdSet = new Set<number>(tasksInProject.map(t => t.task_id));
    const taskById = new Map<number, TaskRow>();
    for (const t of tasksInProject) taskById.set(t.task_id, t);

    // Связи внутри проекта с дедупликацией и DQ-счётчиками
    const seen = new Set<string>();
    let dqDuplicate = 0, dqSelf = 0, dqExternal = 0, dqUnknownType = 0;
    const linksInProject: TaskPredRow[] = [];
    const rawLinks = (predRows || []);

    // Нормализация типа связи (расширенная)


    for (const l of rawLinks) {
      if (!l || typeof l.task_id !== 'number' || typeof l.pred_task_id !== 'number') continue;
      const succId = l.task_id;
      const predId = l.pred_task_id;
      const t = normalizeLinkType(l.pred_type);

      // внешние
      if (!(taskIdSet.has(succId) && taskIdSet.has(predId))) { dqExternal++; continue; }
      // самосвязи
      if (succId === predId) { dqSelf++; continue; }

      // ключ для дедупликации: тип связи влияет на Check 4, лаг — не должен влиять на долю FS, поэтому не включаем lag в ключ
      const key = `${succId}|${predId}|${t}`;
      if (seen.has(key)) { dqDuplicate++; continue; }
      seen.add(key);

      // копию связи с нормализованным типом пробрасываем далее
      linksInProject.push({ ...l, pred_type: t });

      if (t === 'UNKNOWN') dqUnknownType++;
    }

    const totalRelationships = linksInProject.length;

    let countFS = 0, countSS = 0, countFF = 0, countSF = 0;
    for (const l of linksInProject) {
      const t = (l.pred_type as any) as 'FS' | 'SS' | 'FF' | 'SF' | 'UNKNOWN';
      if (t === 'FS') countFS++;
      else if (t === 'SS') countSS++;
      else if (t === 'FF') countFF++;
      else if (t === 'SF') countSF++;
    }

    const nonFsList: DcmaCheck4NonFsItem[] = includeDetails
      ? linksInProject
          .filter(l => (l.pred_type as any) !== 'FS')
          .map(l => ({
            predecessor_task_id: l.pred_task_id,
            successor_task_id: l.task_id,
            predecessor_code: taskById.get(l.pred_task_id)?.task_code,
            successor_code: taskById.get(l.task_id)?.task_code,
            link_type: (l.pred_type as any) ?? 'UNKNOWN',
          }))
      : [];

    return {
      proj_id: projId,
      totalRelationships,
      countFS,
      countSS,
      countFF,
      countSF,
      percentFS: Math.round(((totalRelationships > 0 ? (countFS / totalRelationships) * 100 : 0) * 100)) / 100,
      fsThreshold90Failed: (totalRelationships > 0 ? (countFS / totalRelationships) * 100 : 0) < 90,
      details: includeDetails ? { 
        nonFsList,
        dq: {
          duplicateLinks: dqDuplicate,
          selfLoops: dqSelf,
          externalLinks: dqExternal,
          unknownType: dqUnknownType,
        },
      } : undefined,
    };
  }
  /** DCMA Check 5 — Hard Constraints (MS/MF) ≤ 5% среди всех ограничений */
async analyzeCheck5(
  projId: number,
  includeDetails: boolean = true,
): Promise<DcmaCheck5Result> {
  const [taskRows, projRows] = await Promise.all([
    this.dexie.getRows('TASK') as Promise<TaskRow[]>,
    this.dexie.getRows('PROJECT') as Promise<Array<{ proj_id: number }>>,
  ]);

  const hasProject = projRows.some(p => p.proj_id === projId);
  if (!hasProject) throw new Error(`Проект с proj_id=${projId} не найден в PROJECT.`);

  const tasksInProject = (taskRows || []).filter(t => t.proj_id === projId);

  const isWbs = (t: TaskRow) => ((t.task_type ?? '').trim() === 'TT_WBS');
  const notWbs = tasksInProject.filter(t => !isWbs(t));
  const excludedWbs = tasksInProject.length - notWbs.length;

  // распределение по нормализованным типам
  const byType: Record<ConstraintNorm, number> = {
    HARD_MS: 0, HARD_MF: 0,
    SOFT_ALAP: 0, SOFT_ASAP: 0,
    SOFT_START_ON: 0, SOFT_START_ON_OR_BEFORE: 0, SOFT_START_ON_OR_AFTER: 0,
    SOFT_FINISH_ON: 0, SOFT_FINISH_ON_OR_BEFORE: 0, SOFT_FINISH_ON_OR_AFTER: 0,
    UNKNOWN: 0,
  };

  const itemsHard: DcmaCheck5Item[] = [];
  const itemsSoft: DcmaCheck5Item[] = [];

  let unknownType = 0;
  let missingDateForHard = 0;
  let missingDateForSoft = 0;

  for (const t of notWbs) {
    const norm = normalizeConstraintType(t.cstr_type);
    byType[norm] = (byType[norm] ?? 0) + 1;

    if (norm === 'UNKNOWN') { unknownType++; continue; }

    const hasDate = !!(t.cstr_date ?? null);
    const base: DcmaCheck5Item = {
      task_id: t.task_id,
      task_code: t.task_code,
      task_name: t.task_name,
      cstr_type: t.cstr_type,
      cstr_date: t.cstr_date,
      isHard: isHardConstraint(norm),
      normType: norm,
      hasDate,
    };

    if (isHardConstraint(norm)) {
      if (!hasDate) missingDateForHard++;
      itemsHard.push(base);
    } else {
      if (!hasDate) missingDateForSoft++;
      itemsSoft.push(base);
    }
  }

  // Знаменатель DCMA: только распознанные (не UNKNOWN) ограничения
  const totalWithConstraints = itemsHard.length + itemsSoft.length;
  const hardCount = itemsHard.length;
  const softCount = itemsSoft.length;
  const hardPercent = totalWithConstraints > 0
    ? Math.round((hardCount / totalWithConstraints) * 10000) / 100
    : 0;

  return {
    proj_id: projId,
    totalWithConstraints,
    hardCount,
    softCount,
    hardPercent,
    threshold5PercentExceeded: hardPercent > 5,
    details: includeDetails ? {
      hardList: itemsHard,
      softList: itemsSoft,
      byType,
      dq: { unknownType, missingDateForHard, missingDateForSoft, excludedWbs },
    } : undefined,
  };
}
  /** DCMA Check 6 — High Float (> 44 дней) ≤ 5% */
/** DCMA Check 6 — High Float (> 44 дней) ≤ 5% */
async analyzeCheck6(
  projId: number,
  includeDetails: boolean = true,
  hoursPerDay: number = 8,
): Promise<DcmaCheck6Result> {
  const [taskRows, projRows, calRows] = await Promise.all([
    this.dexie.getRows('TASK') as Promise<TaskRow[]>,
    this.dexie.getRows('PROJECT') as Promise<Array<{ proj_id: number }>>, 
    this.dexie.getRows('CALENDAR') as Promise<CALENDARRow[]>,
  ]);

  const hasProject = projRows.some(p => p.proj_id === projId);
  if (!hasProject) throw new Error(`Проект с proj_id=${projId} не найден в PROJECT.`);

  const tasksInProject = (taskRows || []).filter(t => t.proj_id === projId);

  // eligible: исключаем WBS Summary
  const isWbs = (t: TaskRow) => ((t.task_type ?? '').trim() === 'TT_WBS');
  const eligible = tasksInProject.filter(t => !isWbs(t));
  const excludedWbs = tasksInProject.length - eligible.length;

  // Календарь: часы/день для каждой задачи
  const calById6 = new Map<string | number, CALENDARRow>();
  for (const c of (calRows || [])) if (c && c.clndr_id != null) calById6.set(c.clndr_id, c);
  const getHpd6 = (t: TaskRow): number => {
    const cal = t?.clndr_id != null ? calById6.get(t.clndr_id) : undefined;
    const h =
      cal?.hours_per_day_eff ??
      cal?.day_hr_cnt ??
      (cal?.week_hr_cnt != null ? cal.week_hr_cnt / 5 : null) ??
      (cal?.month_hr_cnt != null ? cal.month_hr_cnt / 21.667 : null) ??
      (cal?.year_hr_cnt != null ? cal.year_hr_cnt / 260 : null);
    return (typeof h === 'number' && h > 0) ? h : hoursPerDay; // fallback к аргументу
  };

  const toNum = (v: unknown): number | null => {
    if (v == null) return null;
    const n = (typeof v === 'number') ? v : Number(String(v).replace(/[\\s,]+/g, ''));
    return Number.isFinite(n) ? n : null;
  };

  // Преобразование TF в часы с учётом TotalFloat/TotalFloatUnits (если total_float_hr_cnt отсутствует)
  let dqUnknownUnits = 0;
  let dqMissingTf = 0;

  const tfHours = (t: TaskRow, hpd: number): number => {
    const tfHrsField = toNum((t as any).total_float_hr_cnt);
    if (tfHrsField != null) return tfHrsField;

    const tfRaw = toNum((t as any).TotalFloat);
    if (tfRaw == null) { dqMissingTf++; return 0; }

    const u0 = String((t as any).TotalFloatUnits ?? '').trim().toUpperCase();
    if (!u0 || u0 === 'H' || u0 === 'HR' || u0 === 'HRS' || u0 === 'HOUR' || u0 === 'HOURS') return tfRaw;       // часы
    if (u0 === 'D' || u0 === 'DAY' || u0 === 'DAYS') return tfRaw * hpd;                                          // дни → часы
    if (u0 === 'W' || u0 === 'WK' || u0 === 'WKS' || u0 === 'WEEK' || u0 === 'WEEKS') return tfRaw * hpd * 5;     // недели → часы
    if (u0 === 'MO' || u0 === 'MON' || u0 === 'MONS' || u0 === 'MONTH' || u0 === 'MONTHS') return tfRaw * hpd * 21.667;
    if (u0 === 'Y' || u0 === 'YR' || u0 === 'YRS' || u0 === 'YEAR' || u0 === 'YEARS') return tfRaw * hpd * 260;
    dqUnknownUnits++; return 0; // неизвестные юниты не учитываем
  };

  const hi = eligible.filter(t => {
    const hpd = getHpd6(t);
    const tfHrs = tfHours(t, hpd);
    return tfHrs > (44 * hpd);
  });

  const items: DcmaCheck6Item[] = includeDetails
    ? hi.map(t => {
        const hpd = getHpd6(t);
        const tfHrs = tfHours(t, hpd);
        return {
          task_id: t.task_id,
          task_code: t.task_code,
          task_name: t.task_name,
          total_float_hr_cnt: tfHrs ?? 0,
          total_float_days_8h: Math.round((tfHrs / hpd) * 100) / 100,
          hours_per_day_used: hpd,
        };
      })
    : [];

  const totalEligible = eligible.length;
  const highFloatCount = hi.length;
  const highFloatPercent = totalEligible > 0 ? Math.round((highFloatCount / totalEligible) * 10000) / 100 : 0;

  return {
    proj_id: projId,
    totalEligible,
    highFloatCount,
    highFloatPercent,
    threshold5PercentExceeded: highFloatPercent > 5,
    details: includeDetails ? { 
      items,
      dq: { unknownUnits: dqUnknownUnits, missingTf: dqMissingTf, excludedWbs },
    } : undefined,
  };
}

  /** DCMA Check 7 — Negative Float: не должно быть TF < 0 */
/** DCMA Check 7 — Negative Float: не должно быть TF < 0 */
async analyzeCheck7(
  projId: number,
  includeDetails: boolean = true,
): Promise<DcmaCheck7Result> {
  const [taskRows, projRows, calRows] = await Promise.all([
    this.dexie.getRows('TASK') as Promise<TaskRow[]>,
    this.dexie.getRows('PROJECT') as Promise<Array<{ proj_id: number }>>,
    this.dexie.getRows('CALENDAR') as Promise<CALENDARRow[]>,
  ]);

  const hasProject = projRows.some(p => p.proj_id === projId);
  if (!hasProject) throw new Error(`Проект с proj_id=${projId} не найден в PROJECT.`);

  const tasksInProject = (taskRows || []).filter(t => t.proj_id === projId);

  // eligible: исключаем WBS Summary
  const isWbs = (t: TaskRow) => ((t.task_type ?? '').trim() === 'TT_WBS');
  const eligible = tasksInProject.filter(t => !isWbs(t));
  const excludedWbs = tasksInProject.length - eligible.length;

  // Индекс календарей: часы/день
  const calById7 = new Map<string | number, CALENDARRow>();
  for (const c of (calRows || [])) if (c && c.clndr_id != null) calById7.set(c.clndr_id, c);
  const getHpd7 = (t: TaskRow): number => {
    const cal = t?.clndr_id != null ? calById7.get(t.clndr_id) : undefined;
    const h =
      cal?.hours_per_day_eff ??
      cal?.day_hr_cnt ??
      (cal?.week_hr_cnt != null ? cal.week_hr_cnt / 5 : null) ??
      (cal?.month_hr_cnt != null ? cal.month_hr_cnt / 21.667 : null) ??
      (cal?.year_hr_cnt != null ? cal.year_hr_cnt / 260 : null);
    return (typeof h === 'number' && h > 0) ? h : 8; // фолбэк 8 ч/д
  };

  const toNum = (v: unknown): number | null => {
    if (v == null) return null;
    const n = (typeof v === 'number') ? v : Number(String(v).replace(/[\\s,]+/g, ''));
    return Number.isFinite(n) ? n : null;
  };

  // Преобразование TF в часы (если total_float_hr_cnt отсутствует — используем TotalFloat/TotalFloatUnits)
  let dqUnknownUnits = 0;
  let dqMissingTf = 0;

  const tfHours = (t: TaskRow, hpd: number): number => {
    const tfHrsField = toNum((t as any).total_float_hr_cnt);
    if (tfHrsField != null) return tfHrsField;

    const tfRaw = toNum((t as any).TotalFloat);
    if (tfRaw == null) { dqMissingTf++; return 0; }

    const u0 = String((t as any).TotalFloatUnits ?? '').trim().toUpperCase();
    if (!u0 || u0 === 'H' || u0 === 'HR' || u0 === 'HRS' || u0 === 'HOUR' || u0 === 'HOURS') return tfRaw; // часы
    if (u0 === 'D' || u0 === 'DAY' || u0 === 'DAYS') return tfRaw * hpd;                                  // дни → часы
    if (u0 === 'W' || u0 === 'WK' || u0 === 'WKS' || u0 === 'WEEK' || u0 === 'WEEKS') return tfRaw * hpd * 5;
    if (u0 === 'MO' || u0 === 'MON' || u0 === 'MONS' || u0 === 'MONTH' || u0 === 'MONTHS') return tfRaw * hpd * 21.667;
    if (u0 === 'Y' || u0 === 'YR' || u0 === 'YRS' || u0 === 'YEAR' || u0 === 'YEARS') return tfRaw * hpd * 260;
    dqUnknownUnits++; return 0; // неизвестные юниты — не учитываем
  };

  const neg = eligible.filter(t => tfHours(t, getHpd7(t)) < 0);

  const items: DcmaCheck7Item[] = includeDetails
    ? neg.map(t => {
        const hpd = getHpd7(t);
        const tfHrs = tfHours(t, hpd);
        return {
          task_id: t.task_id,
          task_code: t.task_code,
          task_name: t.task_name,
          total_float_hr_cnt: tfHrs,
          total_float_days_8h: Math.round((tfHrs / hpd) * 100) / 100,
          hours_per_day_used: hpd,
        };
      })
    : [];

  return {
    proj_id: projId,
    totalEligible: eligible.length,
    negativeFloatCount: neg.length,
    hasNegativeFloat: neg.length > 0,
    details: includeDetails
      ? { items, dq: { unknownUnits: dqUnknownUnits, missingTf: dqMissingTf, excludedWbs } }
      : undefined,
  };
}

  /** DCMA Check 8 — High Duration: незавершённые, Remaining Duration > 44 дней (≤5%) */
  async analyzeCheck8(
    projId: number,
    includeDetails: boolean = true,
    hoursPerDay: number = 8,
  ): Promise<DcmaCheck8Result> {
    const [taskRows, projRows, calRows] = await Promise.all([
      this.dexie.getRows('TASK') as Promise<TaskRow[]>,
      this.dexie.getRows('PROJECT') as Promise<Array<{ proj_id: number }>>, 
      this.dexie.getRows('CALENDAR') as Promise<CALENDARRow[]>,
    ]);

    const hasProject = projRows.some(p => p.proj_id === projId);
    if (!hasProject) throw new Error(`Проект с proj_id=${projId} не найден в PROJECT.`);

    const tasksInProject = (taskRows || []).filter(t => t.proj_id === projId);

    // Исключаем WBS Summary из рассмотрения
    const isWbs = (t: TaskRow) => ((t.task_type ?? '').trim() === 'TT_WBS');
    const excludeLoEAndHammock = true; // часто исключают из знаменателя как обслуживающие
    const isLoEOrHammock = (t: TaskRow) => {
      const ty = (t.task_type ?? '').trim().toUpperCase();
      return ty === 'TT_LOE' || ty === 'TT_HAMMOCK' || ty === 'TT_SUMMARY';
    };

    // Нормализация статуса Completed
    const isCompleted = (v: unknown): boolean => {
      const s = (typeof v === 'string' ? v : String(v ?? '')).trim().toUpperCase();
      return s === 'COMPLETED' || s === 'TK_COMPLETE' || s === 'FINISHED';
    };

    // Календарь: часы/день для каждой задачи
    const calById8 = new Map<string | number, CALENDARRow>();
    for (const c of (calRows || [])) if (c && c.clndr_id != null) calById8.set(c.clndr_id, c);
    const getHpd8 = (t: TaskRow): number => {
      const cal = t?.clndr_id != null ? calById8.get(t.clndr_id) : undefined;
      const h =
        cal?.hours_per_day_eff ??
        cal?.day_hr_cnt ??
        (cal?.week_hr_cnt != null ? cal.week_hr_cnt / 5 : null) ??
        (cal?.month_hr_cnt != null ? cal.month_hr_cnt / 21.667 : null) ??
        (cal?.year_hr_cnt != null ? cal.year_hr_cnt / 260 : null);
      return (typeof h === 'number' && h > 0) ? h : hoursPerDay; // fallback к аргументу
    };

    const toNum = (v: unknown): number | null => {
      if (v == null) return null; const n = typeof v === 'number' ? v : Number(String(v).replace(/[\s,]+/g, ''));
      return Number.isFinite(n) ? n : null;
    };

    // Извлечение Remaining Duration (в часах) из разных возможных полей
    let dqMissingRemain = 0;
    let dqNegativeRemain = 0;
    let dqUsedAltField = 0;

    const getRemainHrs = (t: TaskRow): number | null => {
      // 1) основное поле
      const p1 = toNum((t as any).remain_dur_hr_cnt);
      if (p1 != null) return p1;
      // 2) альтернативы из разных схем
      const altKeys = ['rem_drtn_hr_cnt', 'RemainingDurationHours', 'RemainingDuration'];
      for (const k of altKeys) {
        const v = toNum((t as any)[k]);
        if (v != null) { dqUsedAltField++; return v; }
      }
      // 3) как эвристика: AtCompletion - Actual (если есть поля в часах)
      const ac = toNum((t as any).at_complete_drtn_hr_cnt);
      const act = toNum((t as any).act_total_drtn_hr_cnt);
      if (ac != null && act != null && ac >= act) { dqUsedAltField++; return ac - act; }
      dqMissingRemain++;
      return null;
    };

    // Фильтрация базового набора
    const notWbs = tasksInProject.filter(t => !isWbs(t));
    let excludedWbs = tasksInProject.length - notWbs.length;

    const nonCompleted = notWbs.filter(t => !isCompleted(t.status_code));
    let excludedCompleted = notWbs.length - nonCompleted.length;

    const baseSet = excludeLoEAndHammock ? nonCompleted.filter(t => !isLoEOrHammock(t)) : nonCompleted;
    let excludedLoEOrHammock = nonCompleted.length - baseSet.length;

    // Реальные кандидаты с валидной (>=0) Remaining Duration
    const candidates: Array<{ t: TaskRow; remHrs: number; hpd: number }> = [];
    for (const t of baseSet) {
      const rem = getRemainHrs(t);
      if (rem == null) continue; // нет данных — не включаем в знаменатель
      if (rem < 0) { dqNegativeRemain++; continue; }
      const hpd = getHpd8(t);
      candidates.push({ t, remHrs: rem, hpd });
    }

    // High Duration: Remaining > 44 * HPD (дней по календарю задачи)
    const hi = candidates.filter(c => c.remHrs > (44 * c.hpd));

    const items: DcmaCheck8Item[] = includeDetails
      ? hi.map(c => ({
          task_id: c.t.task_id,
          task_code: c.t.task_code,
          task_name: c.t.task_name,
          remain_dur_hr_cnt: c.remHrs,
          remain_dur_days_8h: Math.round((c.remHrs / c.hpd) * 100) / 100,
          hours_per_day_used: c.hpd,
        }))
      : [];

    const totalEligible = candidates.length; // знаменатель = незавершённые с валидным Remaining
    const highDurationCount = hi.length;
    const highDurationPercent = totalEligible > 0 ? Math.round((highDurationCount / totalEligible) * 10000) / 100 : 0;

    return {
      proj_id: projId,
      totalEligible,
      highDurationCount,
      highDurationPercent,
      threshold5PercentExceeded: highDurationPercent > 5,
      details: includeDetails ? { 
        items,
        dq: {
          excludedWbs,
          excludedCompleted,
          excludedLoEOrHammock,
          missingRemainDur: dqMissingRemain,
          negativeRemainDur: dqNegativeRemain,
          usedAltRemainField: dqUsedAltField,
        },
      } : undefined,
    };
  }

  /** DCMA Check 9 — Invalid Dates: 9a (Forecast < DD), 9b (Actual > DD) */
  async analyzeCheck9(
    projId: number,
    includeDetails: boolean = true,
  ): Promise<DcmaCheck9Result> {
    const [taskRows, projRowsRaw] = await Promise.all([
      this.dexie.getRows('TASK') as Promise<TaskRow[]>,
      this.dexie.getRows('PROJECT') as Promise<Array<Record<string, any>>>,
    ]);

    const proj = (projRowsRaw || []).find(p => p['proj_id'] === projId);
    if (!proj) throw new Error(`Проект с proj_id=${projId} не найден в PROJECT.`);

    // --- Парсинг дат: устойчивый к форматам "YYYY-MM-DD", "YYYY-MM-DDTHH:mm:ss", "YYYY-MM-DD HH:mm:ss" ---
    const toDateStrict = (v: unknown): Date | null => {
      if (v == null) return null;
      if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
      const s = String(v).trim();
      if (!s) return null;
      // нормализуем: если дата без времени — добавим T00:00:00
      let iso = s.includes('T') ? s : (s.length === 10 ? `${s}T00:00:00` : s.replace(' ', 'T'));
      const d = new Date(iso);
      return isNaN(d.getTime()) ? null : d;
    };

    // Сравнение на уровне дней: обрезаем время до 00:00 UTC, чтобы избежать дрейфа TZ
    const dayStartUTC = (d: Date): number => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

    // Data Date (PROJECT)
    const ddRaw = proj['data_date'] ?? proj['last_recalc_date'] ?? proj['last_sched_date'] ?? proj['cur_data_date'] ?? null;
    if (!ddRaw) throw new Error('Не найдена Data Date в PROJECT (ожидается одно из полей: data_date/last_recalc_date/last_sched_date/cur_data_date).');
    const dataDate = toDateStrict(ddRaw);
    if (!dataDate) throw new Error(`Невалидная Data Date: ${String(ddRaw)}`);
    const dataDay = dayStartUTC(dataDate);

    const tasksInProject = (taskRows || []).filter(t => t.proj_id === projId);

    // Помощники
    const isCompleted = (v: unknown): boolean => {
      const s = (typeof v === 'string' ? v : String(v ?? '')).trim().toUpperCase();
      return s === 'COMPLETED' || s === 'TK_COMPLETE' || s === 'FINISHED';
    };

    const toD = (v: unknown): Date | null => toDateStrict(v);
    const toDay = (v: unknown): number | null => { const d = toD(v); return d ? dayStartUTC(d) : null; };

    // --- 9a: invalid forecast для незавершённых (ES/EF/LS/LF < Data Date) ---
    const forecastBad: DcmaCheck9ForecastItem[] = [];
    let tasksCheckedForecast = 0;
    let missingForecastFields = 0;
    let parseErrors = 0; // считаем случаи, когда строка была, но в дату не распарсилась

    for (const t of tasksInProject) {
      if (isCompleted(t.status_code)) continue; // только незавершённые

      const esDay = toDay(t.early_start_date);
      const efDay = toDay(t.early_end_date);
      const lsDay = toDay(t.late_start_date);
      const lfDay = toDay(t.late_end_date);

      const hadAnyField = (t.early_start_date != null) || (t.early_end_date != null) || (t.late_start_date != null) || (t.late_end_date != null);
      const allNull = esDay == null && efDay == null && lsDay == null && lfDay == null;

      if (hadAnyField && allNull) missingForecastFields++;
      if (!hadAnyField) { continue; } // совсем нет прогноза — пропускаем из проверки 9a

      tasksCheckedForecast++;

      // invalid, если хоть одна прогнозная дата в прошлом относительно DD
      const anyInPast = (esDay != null && esDay < dataDay) || (efDay != null && efDay < dataDay) || (lsDay != null && lsDay < dataDay) || (lfDay != null && lfDay < dataDay);
      if (anyInPast) {
        forecastBad.push({
          task_id: t.task_id,
          task_code: t.task_code,
          task_name: t.task_name,
          early_start_date: t.early_start_date,
          early_end_date: t.early_end_date,
          late_start_date: t.late_start_date,
          late_end_date: t.late_end_date,
        });
      }
    }

    // --- 9b: invalid actual (AS/AF > Data Date) ---
    const actualBad: DcmaCheck9ActualItem[] = [];
    let tasksCheckedActual = 0;
    let missingActualFields = 0;

    for (const t of tasksInProject) {
      const asDay = toDay(t.act_start_date);
      const afDay = toDay(t.act_end_date);
      const hadAnyFact = (t.act_start_date != null) || (t.act_end_date != null);
      const bothNull = asDay == null && afDay == null;
      if (hadAnyFact && bothNull) missingActualFields++;
      if (!hadAnyFact) { continue; } // нет фактов — пропускаем из проверки 9b

      tasksCheckedActual++;

      const anyInFuture = (asDay != null && asDay > dataDay) || (afDay != null && afDay > dataDay);
      if (anyInFuture) {
        actualBad.push({
          task_id: t.task_id,
          task_code: t.task_code,
          task_name: t.task_name,
          act_start_date: t.act_start_date,
          act_end_date: t.act_end_date,
        });
      }
    }

    return {
      proj_id: projId,
      dataDateISO: new Date(dataDay).toISOString(),
      invalidForecastCount: forecastBad.length,
      invalidActualCount: actualBad.length,
      hasInvalidDates: forecastBad.length > 0 || actualBad.length > 0,
      details: includeDetails ? {
        forecast: forecastBad,
        actual: actualBad,
        dq: {
          tasksCheckedForecast,
          tasksCheckedActual,
          missingForecastFields,
          missingActualFields,
          parseErrors,
        },
      } : undefined,
    };
  }


  /** DCMA Check 10 — Resources: все задачи с длительностью ≥ 1 дня должны иметь ресурс(ы) */
 /** DCMA Check 10 — Resources: все задачи с длительностью ≥ 1 дня должны иметь ресурс(ы) */
async analyzeCheck10(
  projId: number,
  includeDetails: boolean = true,
  hoursPerDay: number = 8,
): Promise<DcmaCheck10Result> {
  const [taskRows, trRows, projRows, calRows] = await Promise.all([
    this.dexie.getRows('TASK') as Promise<TaskRow[]>,
    this.dexie.getRows('TASKRSRC') as Promise<TaskRsrcRow[]>,
    this.dexie.getRows('PROJECT') as Promise<Array<{ proj_id: number }>>,
    this.dexie.getRows('CALENDAR') as Promise<CALENDARRow[]>,
  ]);

  const hasProject = projRows.some(p => p.proj_id === projId);
  if (!hasProject) throw new Error(`Проект с proj_id=${projId} не найден в PROJECT.`);

  const tasksInProject = (taskRows || []).filter(t => t.proj_id === projId);

  // Помощники
  const normType = (t: TaskRow): string => (t.task_type ?? '').trim().toUpperCase();
  const isWbs = (t: TaskRow) => normType(t) === 'TT_WBS';
  const isMile = (t: TaskRow) => {
    const ty = normType(t);
    return ty === 'TT_MILE' || ty === 'TT_STARTMILE' || ty === 'TT_FINMILE';
  };
  const isLoEOrHammock = (t: TaskRow) => {
    const ty = normType(t);
    return ty === 'TT_LOE' || ty === 'TT_HAMMOCK' || ty === 'TT_SUMMARY';
  };
  const isCompleted = (v: unknown): boolean => {
    const s = (typeof v === 'string' ? v : String(v ?? '')).trim().toUpperCase();
    return s === 'COMPLETED' || s === 'TK_COMPLETE' || s === 'FINISHED';
  };

  // Индекс календарей (часы/день)
  const calById10 = new Map<string | number, CALENDARRow>();
  for (const c of (calRows || [])) if (c && c.clndr_id != null) calById10.set(c.clndr_id, c);
  let calendarFallbackCount = 0;
  const getHpd10 = (t: TaskRow): number => {
    const cal = t?.clndr_id != null ? calById10.get(t.clndr_id) : undefined;
    const h =
      cal?.hours_per_day_eff ??
      cal?.day_hr_cnt ??
      (cal?.week_hr_cnt != null ? cal.week_hr_cnt / 5 : null) ??
      (cal?.month_hr_cnt != null ? cal.month_hr_cnt / 21.667 : null) ??
      (cal?.year_hr_cnt != null ? cal.year_hr_cnt / 260 : null);
    const v = (typeof h === 'number' && h > 0) ? h : hoursPerDay;
    if (!(typeof h === 'number' && h > 0)) calendarFallbackCount++;
    return v;
  };

  const toNum = (v: unknown): number | null => {
    if (v == null) return null;
    const n = typeof v === 'number' ? v : Number(String(v).replace(/[\\s,]+/g, ''));
    return Number.isFinite(n) ? n : null;
  };

  // Эффективная длительность (часы)
  let dqMissingDuration = 0;
  let dqNegativeDuration = 0;
  let dqUsedAltDurField = 0;

  const effDurHrs = (t: TaskRow): number | null => {
    const rem = toNum((t as any).remain_dur_hr_cnt) ?? toNum((t as any).rem_drtn_hr_cnt) ?? toNum((t as any).RemainingDurationHours) ?? toNum((t as any).RemainingDuration);
    const orig = toNum((t as any).orig_dur_hr_cnt) ?? toNum((t as any).OriginalDurationHours) ?? null;
    const atc  = toNum((t as any).at_complete_drtn_hr_cnt) ?? toNum((t as any).AtCompletionDurationHours) ?? null;
    const act  = toNum((t as any).act_total_drtn_hr_cnt) ?? toNum((t as any).ActualDurationHours) ?? null;

    if (!isCompleted(t.status_code)) {
      if (rem != null) return rem;
      if (atc != null && act != null && atc >= act) { dqUsedAltDurField++; return atc - act; }
      if (orig != null) { dqUsedAltDurField++; return orig; }
      dqMissingDuration++; return null;
    }

    if (atc != null) return atc;
    if (orig != null) return orig;
    if (rem != null) { dqUsedAltDurField++; return rem; }
    if (atc != null && act != null && atc >= act) { dqUsedAltDurField++; return atc - act; }
    dqMissingDuration++; return null;
  };

  // Индекс назначений по task_id
  const rsrcByTask = new Map<number, number>();
  for (const r of (trRows || [])) {
    if (typeof r?.task_id === 'number') {
      rsrcByTask.set(r.task_id, (rsrcByTask.get(r.task_id) ?? 0) + 1);
    }
  }

  // Исключения из знаменателя
  const notWbs = tasksInProject.filter(t => !isWbs(t));
  const excludedWbs = tasksInProject.length - notWbs.length;

  const excludeLoEAndHammock = true;
  const baseSet0 = notWbs.filter(t => !isMile(t));
  const excludedMilestones = notWbs.length - baseSet0.length;
  const baseSet = excludeLoEAndHammock ? baseSet0.filter(t => !isLoEOrHammock(t)) : baseSet0;
  const excludedLoEOrHammock = baseSet0.length - baseSet.length;

  // Кандидаты с валидной длительностью ≥ 1 день по своему календарю
  const candidates: Array<{ t: TaskRow; effHrs: number; hpd: number }> = [];
  for (const t of baseSet) {
    const d = effDurHrs(t);
    if (d == null) continue;
    if (d < 0) { dqNegativeDuration++; continue; }
    const hpd = getHpd10(t);
    if (d >= hpd) candidates.push({ t, effHrs: d, hpd });
  }

  const without = candidates.filter(c => (rsrcByTask.get(c.t.task_id) ?? 0) <= 0);

  const items: DcmaCheck10Item[] = includeDetails
    ? without.map(c => ({
        task_id: c.t.task_id,
        task_code: c.t.task_code,
        task_name: c.t.task_name,
        eff_dur_hr_cnt: c.effHrs,
        eff_dur_days: Math.round((c.effHrs / c.hpd) * 100) / 100,
        hours_per_day_used: c.hpd,
      }))
    : [];

  const totalEligible = candidates.length;
  const withoutResourceCount = without.length;
  const percentWithoutResource = totalEligible > 0 ? Math.round((withoutResourceCount / totalEligible) * 10000) / 100 : 0;

  return {
    proj_id: projId,
    hoursPerDay,
    totalEligible,
    withoutResourceCount,
    percentWithoutResource,
    details: includeDetails ? {
      items,
      dq: {
        excludedWbs,
        excludedMilestones,
        excludedLoEOrHammock,
        missingDuration: dqMissingDuration,
        negativeDuration: dqNegativeDuration,
        usedAltDurationField: dqUsedAltDurField,
        calendarFallbackCount,
      },
    } : undefined,
  };
}

    /**
   * DCMA Check 11 — Missed Tasks: среди завершённых задач доля AF > Baseline Finish должна быть ≤ 5%.
   * Правила устойчивости:
   *  - Исключаем WBS Summary.
   *  - В расчёт (знаменатель) берём только завершённые задачи, у которых есть и BL Finish, и AF.
   *  - Зачёты по дням (UTC) — сравнение на уровне даты, чтобы исключить TZ‑дрейф.
   *  - Прозрачные DQ‑счётчики: где отсутствует BL/AF у завершённых.
   */
  async analyzeCheck11(
    projId: number,
    includeDetails: boolean = true,
  ): Promise<DcmaCheck11Result> {
    const [taskRows, projRows] = await Promise.all([
      this.dexie.getRows('TASK') as Promise<TaskRow[]>,
      this.dexie.getRows('PROJECT') as Promise<Array<{ proj_id: number }>>,
    ]);

    const hasProject = projRows.some(p => p.proj_id === projId);
    if (!hasProject) throw new Error(`Проект с proj_id=${projId} не найден в PROJECT.`);

    const tasksInProject = (taskRows || []).filter(t => t.proj_id === projId);

    const isWbs = (t: TaskRow) => ((t.task_type ?? '').trim() === 'TT_WBS');
    const isCompleted = (v: unknown): boolean => {
      const s = (typeof v === 'string' ? v : String(v ?? '')).trim().toUpperCase();
      return s === 'COMPLETED' || s === 'TK_COMPLETE' || s === 'FINISHED';
    };

    // Надёжный парсер дат и сравнение на уровне дня (UTC)
    const toDateStrict = (v: unknown): Date | null => {
      if (v == null) return null;
      if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
      const s = String(v).trim();
      if (!s) return null;
      const iso = s.includes('T') ? s : (s.length === 10 ? `${s}T00:00:00` : s.replace(' ', 'T'));
      const d = new Date(iso);
      return isNaN(d.getTime()) ? null : d;
    };
    const dayUTC = (d: Date): number => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

    // Кандидаты полей базового плана (как в Check 14)
    const BL_FIELDS: (keyof TaskRow | string)[] = [
      'bl1_finish_date','bl_finish_date','baseline_finish_date','target_end_date','target_finish_date'
    ];

    const getBaselineFinish = (t: TaskRow, usage?: Record<string, number>): Date | null => {
      for (const k of BL_FIELDS) {
        const d = toDateStrict((t as any)[k]);
        if (d) { if (usage) usage[String(k)] = (usage[String(k)] ?? 0) + 1; return d; }
      }
      return null;
    };

    // 1) База: исключаем WBS
    const notWbs = tasksInProject.filter(t => !isWbs(t));
    const excludedWbs = tasksInProject.length - notWbs.length;

    // 2) Завершённые
    const completed = notWbs.filter(t => isCompleted(t.status_code));
    const totalCompleted = completed.length;

    // 3) Оценка нарушений среди завершённых с валидными BL и AF
    const baselineUsage: Record<string, number> = {};
    let missingBaselineFinish = 0;
    let missingActualFinish = 0;
    const evaluated: TaskRow[] = [];

    for (const t of completed) {
      const bl = getBaselineFinish(t, baselineUsage);
      if (!bl) { missingBaselineFinish++; continue; }
      const af = toDateStrict(t.act_end_date);
      if (!af) { missingActualFinish++; continue; }
      evaluated.push(t);
    }

    const items: DcmaCheck11Item[] = [];
    let missedCount = 0;

    for (const t of evaluated) {
      const bl = getBaselineFinish(t); // повторно, без инкремента usage
      const af = toDateStrict(t.act_end_date)!;
      const blDay = dayUTC(bl!);
      const afDay = dayUTC(af);
      if (afDay > blDay) {
        missedCount++;
        if (includeDetails) {
          items.push({
            task_id: t.task_id,
            task_code: t.task_code,
            task_name: t.task_name,
            act_finish: t.act_end_date,
            baseline_finish: (t as any).bl1_finish_date ?? (t as any).bl_finish_date ?? (t as any).baseline_finish_date ?? (t as any).target_end_date ?? (t as any).target_finish_date ?? null,
          });
        }
      }
    }

    const evaluatedCompleted = evaluated.length;
    const missedPercent = evaluatedCompleted > 0 ? Math.round((missedCount / evaluatedCompleted) * 10000) / 100 : 0;

    return {
      proj_id: projId,
      totalCompleted,
      evaluatedCompleted,
      missedCount,
      missedPercent,
      threshold5PercentExceeded: missedPercent > 5,
      details: includeDetails ? {
        items,
        dq: {
          excludedWbs,
          missingBaselineFinish,
          missingActualFinish,
          baselineFieldUsage: baselineUsage,
        },
      } : undefined,
    };
  }
}

  /** Нормализация типа ограничения активности к канону для Check 5 */
export type ConstraintNorm =
  | 'HARD_MS' | 'HARD_MF'
  | 'SOFT_ALAP' | 'SOFT_ASAP'
  | 'SOFT_START_ON' | 'SOFT_START_ON_OR_BEFORE' | 'SOFT_START_ON_OR_AFTER'
  | 'SOFT_FINISH_ON' | 'SOFT_FINISH_ON_OR_BEFORE' | 'SOFT_FINISH_ON_OR_AFTER'
  | 'UNKNOWN';

export function normalizeConstraintType(v: unknown): ConstraintNorm {
  const s0 = (typeof v === 'string' ? v : String(v ?? '')).trim().toUpperCase();
  if (!s0) return 'UNKNOWN';
  // HARD (жёсткие)
  if (s0 === 'MANDATORY START' || s0 === 'MS' || s0 === 'HARD MS' || s0 === 'MANDATORY_START') return 'HARD_MS';
  if (s0 === 'MANDATORY FINISH' || s0 === 'MF' || s0 === 'HARD MF' || s0 === 'MANDATORY_FINISH') return 'HARD_MF';
  // SOFT (мягкие)
  if (s0 === 'ALAP' || s0 === 'AS LATE AS POSSIBLE') return 'SOFT_ALAP';
  if (s0 === 'ASAP' || s0 === 'AS SOON AS POSSIBLE') return 'SOFT_ASAP';
  if (s0 === 'START ON' || s0 === 'SO' || s0 === 'START_ON') return 'SOFT_START_ON';
  if (s0 === 'START ON OR BEFORE' || s0 === 'SOB' || s0 === 'START_ON_OR_BEFORE') return 'SOFT_START_ON_OR_BEFORE';
  if (s0 === 'START ON OR AFTER' || s0 === 'SOA' || s0 === 'START_ON_OR_AFTER') return 'SOFT_START_ON_OR_AFTER';
  if (s0 === 'FINISH ON' || s0 === 'FO' || s0 === 'FINISH_ON') return 'SOFT_FINISH_ON';
  if (s0 === 'FINISH ON OR BEFORE' || s0 === 'FOB' || s0 === 'FINISH_ON_OR_BEFORE') return 'SOFT_FINISH_ON_OR_BEFORE';
  if (s0 === 'FINISH ON OR AFTER' || s0 === 'FOA' || s0 === 'FINISH_ON_OR_AFTER') return 'SOFT_FINISH_ON_OR_AFTER';
  return 'UNKNOWN';
}

export function isHardConstraint(norm: ConstraintNorm): boolean {
  return norm === 'HARD_MS' || norm === 'HARD_MF';
}
  export type LinkType = 'FS' | 'SS' | 'FF' | 'SF' | 'UNKNOWN';

/** Вспомогательная: округление до 2 знаков (для процента) */
function round2(n: number): number {
  return Math.round(n * 100) / 100; 
}
