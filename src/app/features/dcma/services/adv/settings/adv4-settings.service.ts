import { Injectable, signal } from '@angular/core';
import type { DcmaCheck4Advanced } from '../types/adv4-settings.types';
import type { DcmaCheck4Options } from '../../../../../p6/services/dcma';

@Injectable({ providedIn: 'root' })
export class DcmaAdv4SettingsService {
  private readonly adv4Key = 'dcma.adv.4';
  private readonly adv4Signal = signal<DcmaCheck4Advanced>(this.loadAdv4());

  adv4(): DcmaCheck4Advanced { return this.adv4Signal(); }

  ensureInitialized(): void {
    if (typeof window === 'undefined') return;
    if (!localStorage.getItem(this.adv4Key)) {
      const def = this.defaultAdv4();
      localStorage.setItem(this.adv4Key, JSON.stringify(def));
      this.adv4Signal.set(def);
    }
  }

  resetAdv4(): void {
    const def = this.defaultAdv4();
    this.adv4Signal.set(def);
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.adv4Key, JSON.stringify(def));
    }
  }

  patchAdv4(patch: Partial<DcmaCheck4Advanced>) {
    const cur = this.adv4Signal();
    const next: DcmaCheck4Advanced = {
      ...cur,
      ...patch,
      thresholds: patch.thresholds ? { ...cur.thresholds, ...patch.thresholds } : cur.thresholds,
    };
    this.adv4Signal.set(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.adv4Key, JSON.stringify(next));
    }
  }

  buildCheck4Options(): DcmaCheck4Options {
    const a = this.adv4();
    return {
      includeDetails: a.includeDetails,
      detailsLimit: a.detailsLimit,
      ignoreMilestoneRelations: a.ignoreMilestoneRelations,
      ignoreLoERelations: a.ignoreLoERelations,
      ignoreWbsSummaryRelations: a.ignoreWbsSummaryRelations,
      ignoreCompletedRelations: a.ignoreCompletedRelations,
      dedupMode: a.dedupMode
    };
  }

  evaluateCheck4Grade(fsPercent: number): 'great'|'average'|'poor' {
    const { averagePct, greatPct } = this.adv4().thresholds;
    if (fsPercent >= greatPct) return 'great';
    if (fsPercent >= averagePct) return 'average';
    return 'poor';
  }

  evaluateCheck4Pass(fsPercent: number): boolean {
    return fsPercent >= this.adv4().thresholds.requiredPct;
  }

  // ==== I/O ====
  private loadAdv4(): DcmaCheck4Advanced {
    if (typeof window === 'undefined') return this.defaultAdv4();
    const raw = localStorage.getItem(this.adv4Key);
    if (raw) { try { return { ...this.defaultAdv4(), ...JSON.parse(raw) }; } catch {} }
    const def = this.defaultAdv4();
    localStorage.setItem(this.adv4Key, JSON.stringify(def));
    return def;
  }

  private defaultAdv4(): DcmaCheck4Advanced {
    return {
      includeDetails: true,
      detailsLimit: 500,
      ignoreMilestoneRelations: false,
      ignoreLoERelations: false,
      ignoreWbsSummaryRelations: false,
      ignoreCompletedRelations: false,
      dedupMode: 'byType',
      thresholds: { requiredPct: 90, averagePct: 90, greatPct: 95 },
    };
  }
}