import { Injectable, signal } from '@angular/core';
import type { DcmaCheck5Advanced } from '../types/adv5-settings.types';
import type { DcmaCheck5Options } from '../../../../../p6/services/dcma';

@Injectable({ providedIn: 'root' })
export class DcmaAdv5SettingsService {
  private readonly adv5Key = 'dcma.adv.5';
  private readonly adv5Signal = signal<DcmaCheck5Advanced>(this.loadAdv5());

  adv5(): DcmaCheck5Advanced { return this.adv5Signal(); }

  ensureInitialized(): void {
    if (typeof window === 'undefined') return;
    if (!localStorage.getItem(this.adv5Key)) {
      const def = this.defaultAdv5();
      localStorage.setItem(this.adv5Key, JSON.stringify(def));
      this.adv5Signal.set(def);
    }
  }

  resetAdv5(): void {
    const def = this.defaultAdv5();
    this.adv5Signal.set(def);
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.adv5Key, JSON.stringify(def));
    }
  }

  patchAdv5(patch: Partial<DcmaCheck5Advanced>): void {
    const cur = this.adv5Signal();
    const next: DcmaCheck5Advanced = {
      ...cur,
      ...patch,
      thresholds: patch.thresholds
        ? { ...cur.thresholds, ...patch.thresholds }
        : cur.thresholds,
    };
    this.adv5Signal.set(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.adv5Key, JSON.stringify(next));
    }
  }

  buildCheck5Options(): DcmaCheck5Options {
    const a = this.adv5();
    return {
      includeDetails: a.includeDetails,
      detailsLimit: a.detailsLimit,
      ignoreMilestoneActivities: a.ignoreMilestoneActivities,
      ignoreLoEActivities: a.ignoreLoEActivities,
      ignoreWbsSummaryActivities: a.ignoreWbsSummaryActivities,
      ignoreCompletedActivities: a.ignoreCompletedActivities,
    };
  }

  evaluateCheck5Grade(percentHard: number): 'great'|'average'|'poor' {
    const { greatMaxPct, averageMaxPct } = this.adv5().thresholds;
    if (percentHard <= greatMaxPct) return 'great';
    if (percentHard <= averageMaxPct) return 'average';
    return 'poor';
  }

  evaluateCheck5Pass(percentHard: number): boolean {
    return percentHard <= this.adv5().thresholds.requiredMaxPct;
  }

  // ==== I/O ====
  private loadAdv5(): DcmaCheck5Advanced {
    if (typeof window === 'undefined') return this.defaultAdv5();
    const raw = localStorage.getItem(this.adv5Key);
    if (raw) { try { return { ...this.defaultAdv5(), ...JSON.parse(raw) }; } catch {} }
    const def = this.defaultAdv5();
    localStorage.setItem(this.adv5Key, JSON.stringify(def));
    return def;
  }

  private defaultAdv5(): DcmaCheck5Advanced {
    return {
      includeDetails: true,
      detailsLimit: 500,
      ignoreMilestoneActivities: false,
      ignoreLoEActivities: false,
      ignoreWbsSummaryActivities: false,
      ignoreCompletedActivities: false,
      thresholds: { requiredMaxPct: 5.0, averageMaxPct: 5.0, greatMaxPct: 1.0 },
    };
  }
}