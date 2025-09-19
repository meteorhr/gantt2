// src/app/p6/services/dcma/src/check/check2.service.ts
import { Injectable, inject } from '@angular/core';
import { P6DexieService } from '../../../../dexie.service';
import { CALENDARRow } from '../../../../models';
import {
  DcmaCheck2LinkItem,
  DcmaCheck2Result,
  TaskPredRow,
  TaskRow
} from '../../models/dcma.model';
import { normalizeLinkType } from '../utils/link-type.util';
import { parseNum } from '../utils/num.util';

export type CalendarSource = 'successor' | 'predecessor' | 'fixed';

export interface DcmaCheck2Options {
  /** Часы в дне по умолчанию (если календарь пуст) */
  hoursPerDay?: number;

  /** Источник часов/день для конвертации лагов */
  calendarSource?: CalendarSource;

  /** Фиксированное значение HPD, если выбран calendarSource='fixed' */
  fixedHoursPerDay?: number;

  /** Какие типы связей учитывать в проверке (по умолчанию все) */
  includeLinkTypes?: Array<'FS' | 'SS' | 'FF' | 'SF'>;

  /** Игнорировать связи, где предшественник/преемник — веха */
  ignoreMilestoneRelations?: boolean;

  /** ДОБАВЛЕНО: игнорировать связи c LoE / WBS Summary / Completed активностями */
  ignoreLoERelations?: boolean;
  ignoreWbsSummaryRelations?: boolean;
  ignoreCompletedRelations?: boolean;

  /** Управление деталями */
  includeDetails?: boolean;
  detailsLimit?: number;

  /** Порог/толеранс: допускаемое кол-во leads */
  tolerance?: {
    /** Допустимый % ссылок с лидами от общего числа, по умолчанию 0 */
    percent?: number;
    /** Допустимое абсолютное кол-во ссылок с лидами, по умолчанию 0 */
    count?: number;
    /** Допустимая сумма лид-часов (по модулю), по умолчанию 0 */
    totalLeadHours?: number;
    /** Строгий режим DCMA (лиды запрещены) — имеет приоритет */
    strictZero?: boolean;
  };
}

@Injectable({ providedIn: 'root' })
export class DcmaCheck2Service {
  private readonly dexie = inject(P6DexieService);

  /** DCMA Check 2 — Leads: связи с отрицательным лагом должны отсутствовать. */
  async analyzeCheck2(
    projId: number,
    /** @deprecated — используйте options.includeDetails */
    includeDetails: boolean = true,
    options?: DcmaCheck2Options,
  ): Promise<DcmaCheck2Result & { passByTolerance?: boolean; totalLeadHours?: number }> {
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
      : (['FS', 'SS', 'FF', 'SF'] as const)
    ).map(t => t.toUpperCase());

    const tol = options?.tolerance ?? {};
    const strictZero = !!tol.strictZero;
    const tolPercent = Math.max(0, Number.isFinite(tol.percent ?? 0) ? (tol.percent as number) : 0);
    const tolCount = Math.max(0, Number.isFinite(tol.count ?? 0) ? (tol.count as number) : 0);
    const tolHours = Math.max(0, Number.isFinite(tol.totalLeadHours ?? 0) ? (tol.totalLeadHours as number) : 0);

    const hasProject = projRows.some(p => p.proj_id === projId);
    if (!hasProject) throw new Error(`Проект с proj_id=${projId} не найден в таблице PROJECT.`);

    const tasksInProject = (taskRows || []).filter(t => t.proj_id === projId);
    const taskIdSet = new Set<number>(tasksInProject.map(t => t.task_id));

    const taskById = new Map<number, TaskRow>();
    for (const t of tasksInProject) taskById.set(t.task_id, t);

    // ========================= helpers =========================
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
      // predecessor
      const cal = pred?.clndr_id != null ? calById.get(pred!.clndr_id) : undefined;
      return extractHPDFromCal(cal) ?? hoursPerDayDefault;
    };

    // Определение типа активности (грубые, но безопасные эвристики под разные схемы БД P6)
    const getTaskTypeCode = (t?: TaskRow): string => {
      const a = t as any;
      const tt = String(a?.task_type ?? a?.tsk_type ?? a?.tasktype ?? '').toUpperCase();
      return tt;
    };

    const isMilestone = (t?: TaskRow): boolean => {
      const a = t as any;
      if (!a) return false;
      // По типу
      const tt = getTaskTypeCode(t);
      if (tt.includes('MILESTONE')) return true;
      // По длительности (многие экспорты 0 = веха)
      if (a?.remain_drtn_hr_cnt === 0 || a?.orig_drtn_hr_cnt === 0) return true;
      if (a?.orig_dur_hr_cnt === 0 || a?.remain_dur_hr_cnt === 0) return true;
      return false;
    };

    const isLoE = (t?: TaskRow): boolean => {
      const tt = getTaskTypeCode(t);
      return tt.includes('LEVEL') || tt.includes('EFFORT') || tt.includes('LOE');
    };

    const isWbsSummary = (t?: TaskRow): boolean => {
      const tt = getTaskTypeCode(t);
      return tt.includes('WBS') || tt.includes('SUMMARY') || tt.includes('WBS_SUMMARY');
    };

    const isCompleted = (t?: TaskRow): boolean => {
      const a = t as any;
      if (!a) return false;
      const st = String(a?.status ?? a?.task_status ?? a?.tsk_status ?? '').toUpperCase();
      if (st.includes('COMPLETE') || st === 'TK_COMPLETE' || st === 'COMPLETED') return true;
      if (typeof a?.pct_complete === 'number' && a.pct_complete >= 100) return true;
      if (a?.act_end_date || a?.actv_end_date || a?.act_finish_date) return true;
      return false;
    };

    // ========================= фильтрация связей =========================
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

      const linkType = normalizeLinkType(l.pred_type).toUpperCase();
      if (!allowedTypes.includes(linkType as any)) continue;

      const pred = taskById.get(predId);
      const succ = taskById.get(succId);

      // Учитываем флаги игнорирования типов активностей
      if (options?.ignoreMilestoneRelations && (isMilestone(pred) || isMilestone(succ))) {
        continue;
      }
      if (options?.ignoreLoERelations && (isLoE(pred) || isLoE(succ))) {
        continue;
      }
      if (options?.ignoreWbsSummaryRelations && (isWbsSummary(pred) || isWbsSummary(succ))) {
        continue;
      }
      if (options?.ignoreCompletedRelations && (isCompleted(pred) || isCompleted(succ))) {
        continue;
      }

      const key = `${succId}|${predId}|${linkType}|${String(l.lag_hr_cnt ?? '')}|${String(l.lag_units ?? '')}|${String(l.lag_raw ?? '')}`;
      if (seen.has(key)) { dqDuplicateLinks++; continue; }
      seen.add(key);
      linksInProject.push(l);
    }

    const totalRelationships = linksInProject.length;

    // Конвертация лагов к часам
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

    const leadLinks = linksInProject.filter(l => toHours(l).hrs < 0);

    const leads: DcmaCheck2LinkItem[] = includeDetailsEff
      ? leadLinks
          .slice(0, Math.max(0, options?.detailsLimit ?? Number.POSITIVE_INFINITY))
          .map(l => {
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
              // На самом деле тут «в днях календаря связи», не обязательно 8h:
              lag_days_8h: Math.round((lagHrs / hpd) * 100) / 100,
              lag_units: l.lag_units ?? null,
              lag_raw: l.lag_raw ?? null,
              hours_per_day_used: hpd,
            };
          })
      : [];

    const leadCount = leadLinks.length;
    const leadPercent = totalRelationships > 0 ? (leadCount / totalRelationships) * 100 : 0;

    const totalLeadHoursAbs = leadLinks.reduce((acc, l) => {
      const v = toHours(l).hrs;
      return acc + Math.abs(v < 0 ? v : 0);
    }, 0);

    // DCMA: zero is required. Но поддержим гибкую оценку по толерансам
    let passByTolerance = false;
    if (!strictZero) {
      const pctOk = (leadPercent <= tolPercent);
      const cntOk = (leadCount <= tolCount);
      const hrsOk = (totalLeadHoursAbs <= tolHours);
      passByTolerance = pctOk && cntOk && hrsOk;
    }

    return {
      proj_id: projId,
      totalRelationships,
      leadCount,
      leadPercent: Math.round(leadPercent * 100) / 100,
      thresholdZeroViolated: leadLinks.length > 0,
      details: includeDetailsEff ? {
        leads,
        dq: { duplicateLinks: dqDuplicateLinks, selfLoops: dqSelfLoops, externalLinks: dqExternal },
      } : undefined,
      passByTolerance,
      totalLeadHours: Math.round(totalLeadHoursAbs * 100) / 100,
    };
  }
}
