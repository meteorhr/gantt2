import { Injectable, signal } from '@angular/core';
import type { DcmaCheck2Advanced } from '../types/adv2-settings.types';
import type { DcmaCheck2Options } from '../../../../../p6/services/dcma';

@Injectable({ providedIn: 'root' })
export class DcmaAdv2SettingsService {
  private readonly adv2Key = 'dcma.adv.2';
  private readonly adv2Signal = signal<DcmaCheck2Advanced>(this.loadAdv2());

  adv2(): DcmaCheck2Advanced { return this.adv2Signal(); }

  ensureInitialized(): void {
    if (typeof window === 'undefined') return;
    if (!localStorage.getItem(this.adv2Key)) {
      const def = this.defaultAdv2();
      localStorage.setItem(this.adv2Key, JSON.stringify(def));
      this.adv2Signal.set(def);
    }
  }

  resetAdv2(): void {
    const def = this.defaultAdv2();
    this.adv2Signal.set(def);
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.adv2Key, JSON.stringify(def));
    }
  }

  patchAdv2(patch: Partial<DcmaCheck2Advanced>) {
    const cur = this.adv2Signal();
    const next: DcmaCheck2Advanced = {
      ...cur,
      ...patch,
      includeLinkTypes: patch.includeLinkTypes
        ? { ...cur.includeLinkTypes, ...patch.includeLinkTypes }
        : cur.includeLinkTypes,
      tolerance: patch.tolerance
        ? { ...cur.tolerance, ...patch.tolerance }
        : cur.tolerance,
      thresholds: patch.thresholds
        ? { ...cur.thresholds, ...patch.thresholds }
        : cur.thresholds,
    };
    this.adv2Signal.set(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.adv2Key, JSON.stringify(next));
    }
  }

  buildCheck2Options(): DcmaCheck2Options {
    const a = this.adv2();
    return {
      hoursPerDay: a.hoursPerDay,
      calendarSource: a.calendarSource,
      fixedHoursPerDay: a.fixedHoursPerDay,
      includeLinkTypes: (['FS','SS','FF','SF'] as const).filter(k => a.includeLinkTypes[k]),
      ignoreMilestoneRelations: a.ignoreMilestoneRelations,
      ignoreLoERelations: a.ignoreLoERelations,
      ignoreWbsSummaryRelations: a.ignoreWbsSummaryRelations,
      ignoreCompletedRelations: a.ignoreCompletedRelations,
      includeDetails: a.includeDetails,
      detailsLimit: a.detailsLimit,
      tolerance: {
        strictZero: a.strictZero,
        percent: a.tolerance.percent,
        count: a.tolerance.count,
        totalLeadHours: a.tolerance.totalLeadHours
      }
    };
  }

  evaluateCheck2Grade(leadPercent: number): 'great'|'average'|'poor' {
    const { greatPct, averagePct } = this.adv2().thresholds;
    if (leadPercent <= greatPct) return 'great';
    if (leadPercent <= averagePct) return 'average';
    return 'poor';
  }

  evaluateCheck2Pass(r: { leadCount: number; leadPercent: number; totalLeadHours?: number }): boolean {
    const a = this.adv2();
    if (a.strictZero) return r.leadCount === 0;
    const hrs = r.totalLeadHours ?? 0;
    return r.leadPercent <= a.tolerance.percent
        && r.leadCount   <= a.tolerance.count
        && hrs           <= a.tolerance.totalLeadHours;
  }

  // ==== I/O ====
  private loadAdv2(): DcmaCheck2Advanced {
    if (typeof window === 'undefined') return this.defaultAdv2();
    const raw = localStorage.getItem(this.adv2Key);
    if (raw) { try { return { ...this.defaultAdv2(), ...JSON.parse(raw) }; } catch {} }
    const def = this.defaultAdv2();
    localStorage.setItem(this.adv2Key, JSON.stringify(def));
    return def;
  }

  private defaultAdv2(): DcmaCheck2Advanced {
    return {
      strictZero: true,
      includeDetails: true,
      detailsLimit: 500,
      hoursPerDay: 8,
      calendarSource: 'successor',
      fixedHoursPerDay: 8,
      includeLinkTypes: { FS: true, SS: true, FF: true, SF: true },
      ignoreMilestoneRelations: false,
      ignoreLoERelations: false,
      ignoreWbsSummaryRelations: false,
      ignoreCompletedRelations: false,
      thresholds: { greatPct: 0, averagePct: 2 },
      tolerance: { percent: 0, count: 0, totalLeadHours: 0 }
    };
  }
}