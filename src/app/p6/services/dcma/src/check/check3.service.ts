import { Injectable, inject } from '@angular/core';
import { P6DexieService } from '../../../../dexie.service';
import { CALENDARRow } from '../../../../models';
import { CalendarSource, DcmaCheck3LinkItem, DcmaCheck3Result, TaskPredRow, TaskRow } from '../../models/dcma.model';
import { normalizeLinkType } from '../utils/link-type.util';
import { parseNum } from '../utils/num.util';


export interface DcmaCheck3Options {
  /** Часы в дне по умолчанию (если календарь пуст) */
  hoursPerDay?: number;
  /** Источник часов/день для конвертации лагов */
  calendarSource?: CalendarSource;
  /** Фиксированное значение HPD, если выбран calendarSource='fixed' */
  fixedHoursPerDay?: number;

  /** Какие типы связей учитывать (по умолчанию все) */
  includeLinkTypes?: Array<'FS' | 'SS' | 'FF' | 'SF'>;

  /** Игнорировать связи по типам активностей */
  ignoreMilestoneRelations?: boolean;
  ignoreLoERelations?: boolean;
  ignoreWbsSummaryRelations?: boolean;
  ignoreCompletedRelations?: boolean;

  /** Управление деталями */
  includeDetails?: boolean;
  detailsLimit?: number;

  /** Порог/толеранс: допускаемое кол-во lags */
  tolerance?: {
    /** Строгое правило DCMA: не более 5% */
    strictFivePct?: boolean;
    /** Допустимый процент lag-связей (по умолчанию 5) */
    percent?: number;
    /** Допустимое Абс. количество lag-связей (опц.) */
    count?: number;
    /** Допустимая суммарная величина лагов в часах (опц.) */
    totalLagHours?: number;
  };
}

@Injectable({ providedIn: 'root' })
export class DcmaCheck3Service {
  private readonly dexie = inject(P6DexieService);

  /** DCMA Check 3 — Lags: допускается не более 5% связей с положительным лагом. */
  async analyzeCheck3(
    projId: number,
    /** @deprecated — используйте options.includeDetails */
    includeDetails: boolean = true,
    options?: DcmaCheck3Options,
  ): Promise<DcmaCheck3Result & { passByTolerance?: boolean; totalLagHours?: number }> {
    const [taskRows, predRows, projRows, calRows] = await Promise.all([
      this.dexie.getRows('TASK') as Promise<TaskRow[]>,
      this.dexie.getRows('TASKPRED') as Promise<TaskPredRow[]>,
      this.dexie.getRows('PROJECT') as Promise<Array<{ proj_id: number; proj_short_name?: string }>>,
      this.dexie.getRows('CALENDAR') as Promise<CALENDARRow[]>,
    ]);

    const includeDetailsEff = options?.includeDetails ?? includeDetails;
    const hoursPerDayDefault = options?.hoursPerDay ?? 8;
    const calendarSource = options?.calendarSource ?? 'successor';
    const fixedHPD = options?.fixedHoursPerDay ?? hoursPerDayDefault;

    const allowedTypes = (options?.includeLinkTypes?.length
      ? options.includeLinkTypes
      : (['FS','SS','FF','SF'] as const)
    ).map(t => t.toUpperCase());

    const tol = options?.tolerance ?? {};
    const strictFive = !!tol.strictFivePct;
    const tolPercent = Number.isFinite(tol.percent) ? Math.max(0, tol.percent as number) : 5;
    const tolCount   = Number.isFinite(tol.count) ? Math.max(0, tol.count as number) : Number.POSITIVE_INFINITY;
    const tolHours   = Number.isFinite(tol.totalLagHours) ? Math.max(0, tol.totalLagHours as number) : Number.POSITIVE_INFINITY;

    const hasProject = projRows.some(p => p.proj_id === projId);
    if (!hasProject) throw new Error(`Проект с proj_id=${projId} не найден в таблице PROJECT.`);

    const tasksInProject = (taskRows || []).filter(t => t.proj_id === projId);
    const taskIdSet = new Set<number>(tasksInProject.map(t => t.task_id));
    const taskById = new Map<number, TaskRow>(); for (const t of tasksInProject) taskById.set(t.task_id, t);

    // Календарь
    const calById = new Map<string | number, CALENDARRow>();
    for (const c of (calRows || [])) if (c && c.clndr_id != null) calById.set(c.clndr_id, c);

    const extractHPDFromCal = (cal?: CALENDARRow | undefined): number | null => {
      const anyCal = cal as any;
      const h =
        anyCal?.hours_per_day_eff ??
        anyCal?.day_hr_cnt ??
        (anyCal?.week_hr_cnt != null ? anyCal.week_hr_cnt / 5 : null) ??
        (anyCal?.month_hr_cnt != null ? anyCal.month_hr_cnt / 21.667 : null) ??
        (anyCal?.year_hr_cnt != null ? anyCal.year_hr_cnt / 260 : null);
      return (typeof h === 'number' && h > 0) ? h : null;
    };

    const getHpd = (succ?: TaskRow, pred?: TaskRow): number => {
      if (calendarSource === 'fixed') return fixedHPD;
      if (calendarSource === 'successor') {
        const cal = succ?.clndr_id != null ? calById.get(succ.clndr_id) : undefined;
        return extractHPDFromCal(cal) ?? hoursPerDayDefault;
      }
      const cal = pred?.clndr_id != null ? calById.get(pred!.clndr_id) : undefined;
      return extractHPDFromCal(cal) ?? hoursPerDayDefault;
    };

    // Типы активностей для фильтров
    const isMilestone = (t?: TaskRow): boolean => {
      const a = t as any;
      if (!a) return false;
      if (a?.remain_drtn_hr_cnt === 0 || a?.orig_drtn_hr_cnt === 0) return true;
      if (a?.orig_dur_hr_cnt === 0 || a?.remain_dur_hr_cnt === 0) return true;
      if (a?.task_type === 'MILESTONE' || a?.task_type === 1) return true;
      return false;
    };
    const isLoE = (t?: TaskRow): boolean => {
      const a = t as any;
      return a?.task_type === 'LEVEL_OF_EFFORT' || a?.task_type === 3 /* пример enum */;
    };
    const isWbsSummary = (t?: TaskRow): boolean => {
      const a = t as any;
      return a?.task_type === 'WBS_SUMMARY' || a?.task_type === 4 /* пример enum */;
    };
    const isCompleted = (t?: TaskRow): boolean => {
      const a = t as any;
      return a?.status === 'COMPLETED' || a?.complete_pct === 100;
    };

    // Связи внутри проекта + фильтры
    const seen = new Set<string>();
    let dqDuplicateLinks = 0, dqSelfLoops = 0, dqExternal = 0;
    const linksInProject: TaskPredRow[] = [];

    for (const l of (predRows || [])) {
      if (!l || typeof l.task_id !== 'number' || typeof l.pred_task_id !== 'number') continue;
      const succId = l.task_id; const predId = l.pred_task_id;
      if (!(taskIdSet.has(succId) && taskIdSet.has(predId))) { dqExternal++; continue; }
      if (succId === predId) { dqSelfLoops++; continue; }

      const linkType = normalizeLinkType(l.pred_type).toUpperCase();
      if (!allowedTypes.includes(linkType as any)) continue;

      const pred = taskById.get(predId);
      const succ = taskById.get(succId);

      if (options?.ignoreMilestoneRelations && (isMilestone(pred) || isMilestone(succ))) continue;
      if (options?.ignoreLoERelations       && (isLoE(pred)       || isLoE(succ)))       continue;
      if (options?.ignoreWbsSummaryRelations&& (isWbsSummary(pred)|| isWbsSummary(succ)))continue;
      if (options?.ignoreCompletedRelations && (isCompleted(pred) || isCompleted(succ))) continue;

      const key = `${succId}|${predId}|${linkType}|${String(l.lag_hr_cnt ?? '')}|${String(l.lag_units ?? '')}|${String(l.lag_raw ?? '')}`;
      if (seen.has(key)) { dqDuplicateLinks++; continue; }
      seen.add(key);
      linksInProject.push(l);
    }

    const totalRelationships = linksInProject.length;

    // Конвертация лагов в часы
    const toHours = (l: TaskPredRow): { hrs: number; hpd: number } => {
      const pred = taskById.get(l.pred_task_id);
      const succ = taskById.get(l.task_id);
      const hpd = getHpd(succ, pred);
      const direct = parseNum(l.lag_hr_cnt);
      if (direct != null) return { hrs: direct, hpd };
      const raw = parseNum(l.lag_raw);
      const u = String(l.lag_units ?? '').trim().toUpperCase();
      if (raw == null) return { hrs: 0, hpd };
      if (u === 'H' || u === 'HR' || u === 'HRS' || u === 'HOUR' || u === 'HOURS') return { hrs: raw, hpd };
      if (u === 'D' || u === 'DAY' || u === 'DAYS') return { hrs: raw * hpd, hpd };
      if (u === 'W' || u === 'WK' || u === 'WKS' || u === 'WEEK' || u === 'WEEKS') return { hrs: raw * hpd * 5, hpd };
      if (u === 'MO' || u === 'MON' || u === 'MONS' || u === 'MONTH' || u === 'MONTHS') return { hrs: raw * hpd * 21.667, hpd };
      return { hrs: 0, hpd };
    };

    const lagLinks = linksInProject.filter(l => toHours(l).hrs > 0);

    const lags: DcmaCheck3LinkItem[] = includeDetailsEff
      ? lagLinks
          .slice(0, Math.max(0, options?.detailsLimit ?? Number.POSITIVE_INFINITY))
          .map(l => {
            const pred = taskById.get(l.pred_task_id);
            const succ = taskById.get(l.task_id);
            const { hrs: lagHrs, hpd } = toHours(l);
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

    const lagCount = lagLinks.length;
    const lagPercent = totalRelationships > 0 ? (lagCount / totalRelationships) * 100 : 0;
    const totalLagHours = lagLinks.reduce((acc, l) => {
      const v = toHours(l).hrs;
      return acc + (v > 0 ? v : 0);
    }, 0);

    let passByTolerance = false;
    if (strictFive) {
      passByTolerance = lagPercent <= 5;
    } else {
      const pctOk = (lagPercent <= tolPercent);
      const cntOk = (lagCount <= tolCount);
      const hrsOk = (totalLagHours <= tolHours);
      passByTolerance = pctOk && cntOk && hrsOk;
    }

    return {
      proj_id: projId,
      totalRelationships,
      lagCount,
      lagPercent: Math.round(lagPercent * 100) / 100,
      threshold5PercentExceeded: lagPercent > 5,
      details: includeDetailsEff ? {
        lags,
        dq: { duplicateLinks: dqDuplicateLinks, selfLoops: dqSelfLoops, externalLinks: dqExternal },
      } : undefined,
      passByTolerance,
      totalLagHours: Math.round(totalLagHours * 100) / 100,
    };
  }
}
