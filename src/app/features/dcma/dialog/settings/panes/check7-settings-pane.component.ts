import { Component, inject, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDividerModule } from '@angular/material/divider';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { TranslocoModule } from '@jsverse/transloco';

import { DcmaAdv7SettingsService } from '../../../services/adv/settings/adv7-settings.service';
import type { DcmaCheck7Advanced } from '../../../services/adv/types/adv7-settings.types';

@Component({
  standalone: true,
  selector: 'app-dcma-check7-settings-pane',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatDividerModule,
    MatSlideToggleModule,
    MatFormFieldModule,
    MatInputModule,
    TranslocoModule
  ],
  template: `
    <mat-divider></mat-divider>

    <!-- GENERAL -->
    <h4 class="section-title">{{ 'dcma.common.title.general' | transloco }}</h4>

    <div class="row-line">
      <div class="row-text">
        <div class="row-title">{{ 'dcma.common.general.includeDetails' | transloco }}</div>
      </div>
      <mat-slide-toggle
        [checked]="adv().includeDetails"
        (change)="patch({ includeDetails: $event.checked })"
        [attr.aria-label]="'dcma.common.general.includeDetails' | transloco">
      </mat-slide-toggle>
    </div>

    @if (adv().includeDetails) {
      <div class="row-line">
        <div class="row-text"><div class="row-title">{{ 'dcma.common.general.detailsLimit' | transloco }}</div></div>
        <mat-form-field class="pct-field" appearance="outline">
          <input
            matInput type="number" min="0" step="1" inputmode="numeric" pattern="\\d*"
            [value]="adv().detailsLimit"
            (input)="patchInt('detailsLimit', $any($event.target).value)"
            [attr.aria-label]="'dcma.common.general.detailsLimit' | transloco">
        </mat-form-field>
      </div>
    }

    <!-- HPD fallback (основной HPD берётся из календарей) -->
    <div class="row-line">
      <div class="row-text">
        <div class="row-title">{{ 'dcma.common.calendar.defaultHpd' | transloco }}</div>
        <div class="muted">{{ 'dcma.common.calendar.note' | transloco }}</div>
      </div>
      <mat-form-field class="pct-field" appearance="outline">
        <input
          matInput type="number" min="1" step="1" inputmode="numeric" pattern="\\d*"
          [value]="adv().hoursPerDay"
          (input)="patchInt('hoursPerDay', $any($event.target).value)"
          [attr.aria-label]="'dcma.common.calendar.defaultHpd' | transloco">
        <span matTextSuffix>h</span>
      </mat-form-field>
    </div>

    <!-- TOLERANCE (в часах) -->
    <div class="row-line">
      <div class="row-text">
        <div class="row-title">{{ 'dcma.check7.tolerance.hours' | transloco: { default: 'Tolerance for negative float (hours)' } }}</div>
      </div>
      <mat-form-field class="pct-field" appearance="outline">
        <input
          matInput type="number" min="0" step="0.1" inputmode="decimal"
          [value]="adv().toleranceHours"
          (input)="patchFloat('toleranceHours', $any($event.target).value)"
          [attr.aria-label]="'dcma.check7.tolerance.hours' | transloco">
        <span matTextSuffix>h</span>
      </mat-form-field>
    </div>

    <!-- FILTERS -->
    <h4 class="section-title">{{ 'dcma.common.title.filters' | transloco }}</h4>

    <div class="row-line">
      <div class="row-text"><div class="row-title">{{ 'dcma.common.filters.ignoreMilestones' | transloco }}</div></div>
      <mat-slide-toggle
        [checked]="adv().ignoreMilestoneActivities"
        (change)="patch({ ignoreMilestoneActivities: $event.checked })"
        [attr.aria-label]="'dcma.common.filters.ignoreMilestones' | transloco">
      </mat-slide-toggle>
    </div>

    <div class="row-line">
      <div class="row-text"><div class="row-title">{{ 'dcma.common.filters.ignoreLoE' | transloco }}</div></div>
      <mat-slide-toggle
        [checked]="adv().ignoreLoEActivities"
        (change)="patch({ ignoreLoEActivities: $event.checked })"
        [attr.aria-label]="'dcma.common.filters.ignoreLoE' | transloco">
      </mat-slide-toggle>
    </div>

    <div class="row-line">
      <div class="row-text"><div class="row-title">{{ 'dcma.common.filters.ignoreWbsSummary' | transloco }}</div></div>
      <mat-slide-toggle
        [checked]="adv().ignoreWbsSummaryActivities"
        (change)="patch({ ignoreWbsSummaryActivities: $event.checked })"
        [attr.aria-label]="'dcma.common.filters.ignoreWbsSummary' | transloco">
      </mat-slide-toggle>
    </div>

    <div class="row-line">
      <div class="row-text"><div class="row-title">{{ 'dcma.common.filters.ignoreCompleted' | transloco }}</div></div>
      <mat-slide-toggle
        [checked]="adv().ignoreCompletedActivities"
        (change)="patch({ ignoreCompletedActivities: $event.checked })"
        [attr.aria-label]="'dcma.common.filters.ignoreCompleted' | transloco">
      </mat-slide-toggle>
    </div>

    <!-- MODE & THRESHOLDS -->
    <h4 class="section-title">{{ 'dcma.common.title.thresholds' | transloco }}</h4>

    <div class="row-line">
      <div class="row-text">
        <div class="row-title">{{ 'dcma.check7.mode.strictZero' | transloco: { default: 'Strict Zero (DCMA)' } }}</div>
        <div class="muted">{{ 'dcma.check7.mode.note' | transloco: { default: 'If enabled, pass only when negative float count is 0. If disabled, use thresholds below.' } }}</div>
      </div>
      <mat-slide-toggle
        [checked]="adv().mode.strictZero"
        (change)="patchMode({ strictZero: $event.checked })"
        [attr.aria-label]="'dcma.check7.mode.strictZero' | transloco">
      </mat-slide-toggle>
    </div>

    @if (!adv().mode.strictZero) {
      <div class="row-line">
        <div class="row-text"><div class="row-title">{{ 'dcma.common.thresholds.requiredMaxPct' | transloco }}</div></div>
        <mat-form-field class="pct-field" appearance="outline">
          <input
            matInput type="number" min="0" max="100" step="0.1" inputmode="decimal"
            [value]="adv().mode.thresholds.requiredMaxPct"
            (input)="onRequiredChange($any($event.target).value)"
            [attr.aria-label]="'dcma.common.thresholds.requiredMaxPct' | transloco">
          <span matTextSuffix>%</span>
        </mat-form-field>
      </div>

      <div class="row-line">
        <div class="row-text"><div class="row-title">{{ 'dcma.common.thresholds.average' | transloco }}</div></div>
        <mat-form-field class="pct-field" appearance="outline">
          <input
            matInput type="number" min="0" max="100" step="0.1" inputmode="decimal"
            [value]="adv().mode.thresholds.averageMaxPct"
            (input)="onAverageChange($any($event.target).value)"
            [attr.aria-label]="'dcma.common.thresholds.average' | transloco">
          <span matTextSuffix>%</span>
        </mat-form-field>
      </div>

      <div class="row-line">
        <div class="row-text"><div class="row-title">{{ 'dcma.common.thresholds.great' | transloco }}</div></div>
        <mat-form-field class="pct-field" appearance="outline">
          <input
            matInput type="number" min="0" max="100" step="0.1" inputmode="decimal"
            [value]="adv().mode.thresholds.greatMaxPct"
            (input)="onGreatChange($any($event.target).value)"
            [attr.aria-label]="'dcma.common.thresholds.great' | transloco">
          <span matTextSuffix>%</span>
        </mat-form-field>
      </div>

      <div class="threshold-bar" [style.background]="thresholdGradient()"></div>
    }
  `,
  styleUrls: ['./settings-pane.component.scss']
})
export class DcmaCheck7SettingsPaneComponent {
  private readonly svc = inject(DcmaAdv7SettingsService);
  readonly adv = computed<DcmaCheck7Advanced>(() => this.svc.adv7());

  // ---- patch helpers ----
  patch(p: Partial<DcmaCheck7Advanced>): void { this.svc.patchAdv7(p); }
  patchMode(p: Partial<DcmaCheck7Advanced['mode']>): void {
    const cur = this.adv().mode;
    const next: DcmaCheck7Advanced['mode'] = {
      ...cur,
      ...(p.strictZero === undefined ? {} : { strictZero: p.strictZero }),
      ...(p.thresholds
        ? { thresholds: { ...cur.thresholds, ...p.thresholds } }
        : { thresholds: cur.thresholds }),
    };
    this.svc.patchAdv7({ mode: next });
  }

  patchInt<K extends keyof DcmaCheck7Advanced>(key: K, v: string): void {
    const n = Math.max(0, Math.floor(Number(v) || 0));
    this.patch({ [key]: n } as any);
  }
  patchFloat<K extends keyof DcmaCheck7Advanced>(key: K, v: string): void {
    const n = Math.max(0, Number(v) || 0);
    this.patch({ [key]: n } as any);
  }

  // ---- thresholds (сервис сам нормализует порядок) ----
  private clampPct(v: unknown): number {
    const x = Number(v);
    const b = Number.isFinite(x) ? Math.min(100, Math.max(0, x)) : 0;
    return Math.round(b * 10) / 10;
  }
  onRequiredChange(v: unknown): void {
    this.patchMode({ thresholds: { requiredMaxPct: this.clampPct(v) } as any });
  }
  onAverageChange(v: unknown): void {
    this.patchMode({ thresholds: { averageMaxPct: this.clampPct(v) } as any });
  }
  onGreatChange(v: unknown): void {
    this.patchMode({ thresholds: { greatMaxPct: this.clampPct(v) } as any });
  }

  // ---- gradient (зелёный → жёлтый → красный) ----
  private clampInt100(n: number): number {
    return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
  }
  thresholdGradient(): string {
    const t = this.adv().mode.thresholds;
    const gp = this.clampInt100(t.greatMaxPct);
    const ap = this.clampInt100(t.averageMaxPct);
    const g = '#4CAF50', y = '#FFC107', r = '#EF5350';
    if (ap <= gp) return `linear-gradient(to right, ${g} 0 ${gp}%, ${r} ${gp}% 100%)`;
    return `linear-gradient(to right, ${g} 0 ${gp}%, ${y} ${gp}% ${ap}%, ${r} ${ap}% 100%)`;
  }
}