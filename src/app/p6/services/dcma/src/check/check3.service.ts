// src/app/p6/services/dcma/src/check/check3.service.ts
import { Injectable, inject } from '@angular/core';
import { P6DexieService } from '../../../../dexie.service';
import { CALENDARRow } from '../../../../models';
import { DcmaCheck3LinkItem, DcmaCheck3Result, TaskPredRow, TaskRow } from '../../models/dcma.model';
import { normalizeLinkType } from '../utils/link-type.util';
import { parseNum } from '../utils/num.util';

@Injectable({ providedIn: 'root' })
export class DcmaCheck3Service {
  private readonly dexie = inject(P6DexieService);

  /** DCMA Check 3 — Lags: допускается не более 5% связей с положительным лагом. */
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
    if (!hasProject) throw new Error(`Проект с proj_id=${projId} не найден в таблице PROJECT.`);

    const tasksInProject = (taskRows || []).filter(t => t.proj_id === projId);
    const taskIdSet = new Set<number>(tasksInProject.map(t => t.task_id));

    const taskById = new Map<number, TaskRow>();
    for (const t of tasksInProject) taskById.set(t.task_id, t);

    const calById = new Map<string | number, CALENDARRow>();
    for (const c of (calRows || [])) if (c && c.clndr_id != null) calById.set(c.clndr_id, c);
    const getHpd = (t: TaskRow | undefined): number => {
      if (!t) return 8;
      const cal = t?.clndr_id != null ? calById.get(t.clndr_id) : undefined;
      const h =
        (cal as any)?.hours_per_day_eff ??
        (cal as any)?.day_hr_cnt ??
        ((cal as any)?.week_hr_cnt != null ? (cal as any).week_hr_cnt / 5 : null) ??
        ((cal as any)?.month_hr_cnt != null ? (cal as any).month_hr_cnt / 21.667 : null) ??
        ((cal as any)?.year_hr_cnt != null ? (cal as any).year_hr_cnt / 260 : null);
      return (typeof h === 'number' && h > 0) ? h : 8;
    };

    const seen = new Set<string>();
    let duplicateCount = 0, selfLoopCount = 0, externalCount = 0;
    const linksInProject: TaskPredRow[] = [];
    for (const l of (predRows || [])) {
      if (!l || typeof l.task_id !== 'number' || typeof l.pred_task_id !== 'number') continue;
      const succId = l.task_id;
      const predId = l.pred_task_id;
      if (!(taskIdSet.has(succId) && taskIdSet.has(predId))) { externalCount++; continue; }
      if (succId === predId) { selfLoopCount++; continue; }
      const key = `${succId}|${predId}|${normalizeLinkType(l.pred_type)}|${String(l.lag_hr_cnt ?? '')}|${String(l.lag_units ?? '')}|${String(l.lag_raw ?? '')}`;
      if (seen.has(key)) { duplicateCount++; continue; }
      seen.add(key);
      linksInProject.push(l);
    }

    const totalRelationships = linksInProject.length;

    const toHours = (l: TaskPredRow): { hrs: number; hpd: number } => {
      const succ = taskById.get(l.task_id);
      const hpd = getHpd(succ);
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

    const lags: DcmaCheck3LinkItem[] = includeDetails
      ? lagLinks.map(l => {
          const pred = taskById.get(l.pred_task_id);
          const succ = taskById.get(l.task_id);
          const conv = toHours(l);
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

    return {
      proj_id: projId,
      totalRelationships,
      lagCount,
      lagPercent: Math.round(lagPercent * 100) / 100,
      threshold5PercentExceeded: lagPercent > 5,
      details: includeDetails ? {
        lags,
        dq: { duplicateLinks: duplicateCount, selfLoops: selfLoopCount, externalLinks: externalCount },
      } : undefined,
    };
  }
}
