import { Injectable, signal } from '@angular/core';
import type { DcmaCheck3Advanced } from '../types/adv3-settings.types';
import type { DcmaCheck3Options } from '../../../../../p6/services/dcma';

@Injectable({ providedIn: 'root' })
export class DcmaAdv3SettingsService {
  private readonly adv3Key = 'dcma.adv.3';
  private readonly adv3Signal = signal<DcmaCheck3Advanced>(this.loadAdv3());

  adv3(): DcmaCheck3Advanced { return this.adv3Signal(); }

  ensureInitialized(): void {
    if (typeof window === 'undefined') return;
    if (!localStorage.getItem(this.adv3Key)) {
      const def = this.defaultAdv3();
      localStorage.setItem(this.adv3Key, JSON.stringify(def));
      this.adv3Signal.set(def);
    }
  }

  resetAdv3(): void {
    const def = this.defaultAdv3();
    this.adv3Signal.set(def);
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.adv3Key, JSON.stringify(def));
    }
  }

  patchAdv3(patch: Partial<DcmaCheck3Advanced>) {
    const cur = this.adv3Signal();
    const next: DcmaCheck3Advanced = {
      ...cur,
      ...patch,
      includeLinkTypes: patch.includeLinkTypes
        ? { ...cur.includeLinkTypes, ...patch.includeLinkTypes }
        : cur.includeLinkTypes,
      thresholds: patch.thresholds
        ? { ...cur.thresholds, ...patch.thresholds }
        : cur.thresholds,
      tolerance: patch.tolerance
        ? { ...cur.tolerance, ...patch.tolerance }
        : cur.tolerance,
    };
    this.adv3Signal.set(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.adv3Key, JSON.stringify(next));
    }
  }

  buildCheck3Options(): DcmaCheck3Options {
    const a = this.adv3();
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
        strictFivePct: a.tolerance.strictFivePct,
        percent: a.tolerance.percent,
        count: a.tolerance.count,
        totalLagHours: a.tolerance.totalLagHours,
      }
    };
  }

  evaluateCheck3Grade(lagPercent: number): 'great'|'average'|'poor' {
    const { greatPct, averagePct } = this.adv3().thresholds;
    if (lagPercent <= greatPct) return 'great';
    if (lagPercent <= averagePct) return 'average';
    return 'poor';
  }

  evaluateCheck3Pass(r: { lagCount: number; lagPercent: number; totalLagHours?: number }): boolean {
    const a = this.adv3();
    if (a.tolerance.strictFivePct) return r.lagPercent <= 5;
    const hrs = r.totalLagHours ?? 0;
    return r.lagPercent <= a.tolerance.percent
        && r.lagCount   <= a.tolerance.count
        && hrs          <= a.tolerance.totalLagHours;
  }

  // ==== I/O ====
  private loadAdv3(): DcmaCheck3Advanced {
    if (typeof window === 'undefined') return this.defaultAdv3();
    const raw = localStorage.getItem(this.adv3Key);
    if (raw) { try { return { ...this.defaultAdv3(), ...JSON.parse(raw) }; } catch {} }
    const def = this.defaultAdv3();
    localStorage.setItem(this.adv3Key, JSON.stringify(def));
    return def;
  }

  private defaultAdv3(): DcmaCheck3Advanced {
    return {
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
      thresholds: { greatPct: 2, averagePct: 5 },
      tolerance: { strictFivePct: true, percent: 5, count: Number.POSITIVE_INFINITY, totalLagHours: Number.POSITIVE_INFINITY },
    };
  }
}