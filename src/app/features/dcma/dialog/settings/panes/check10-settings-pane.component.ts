import { Component, inject, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDividerModule } from '@angular/material/divider';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { TranslocoModule } from '@jsverse/transloco';

import { DcmaAdv10SettingsService } from '../../../services/adv/settings/adv10-settings.service';
import type { DcmaCheck10Advanced } from '../../../services/adv/types/adv10-settings.types';

@Component({
  standalone: true,
  selector: 'app-dcma-check10-settings-pane',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatDividerModule,
    MatSlideToggleModule,
    MatFormFieldModule,
    MatInputModule,
    TranslocoModule
  ],
  styleUrls: ['./settings-pane.component.scss'],
  template: `
    <mat-divider></mat-divider>

    <!-- General -->
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
        <div class="row-text">
          <div class="row-title">{{ 'dcma.common.general.detailsLimit' | transloco }}</div>
        </div>
        <mat-form-field class="pct-field" appearance="outline">
          <input
            matInput type="number" min="0" step="1" inputmode="numeric" pattern="\\d*"
            [value]="adv().detailsLimit"
            (input)="patchInt('detailsLimit', $any($event.target).value)">
        </mat-form-field>
      </div>
    }

    <!-- Rule: duration threshold (days) -->
    <h4 class="section-title">{{ 'dcma.check10.title.rule' | transloco }}</h4>
    <p class="muted">
      {{ 'dcma.check10.note' | transloco }}
    </p>

    <div class="row-line">
      <div class="row-text">
        <div class="row-title">{{ 'dcma.check10.durationThresholdDays' | transloco }}</div>
      </div>
      <mat-form-field class="pct-field" appearance="outline">
        <input
          matInput type="number" min="0" step="0.1" inputmode="decimal"
          [value]="adv().durationDayThreshold"
          (input)="patchFloat('durationDayThreshold', $any($event.target).value)">
        <span matTextSuffix>d</span>
      </mat-form-field>
    </div>

    <!-- Filters -->
    <h4 class="section-title">{{ 'dcma.common.title.filters' | transloco }}</h4>

    <div class="row-line">
      <div class="row-text"><div class="row-title">{{ 'dcma.common.filters.ignoreMilestones' | transloco }}</div></div>
      <mat-slide-toggle
        [checked]="adv().ignoreMilestoneActivities"
        (change)="patch({ ignoreMilestoneActivities: $event.checked })">
      </mat-slide-toggle>
    </div>

    <div class="row-line">
      <div class="row-text"><div class="row-title">{{ 'dcma.common.filters.ignoreLoE' | transloco }}</div></div>
      <mat-slide-toggle
        [checked]="adv().ignoreLoEActivities"
        (change)="patch({ ignoreLoEActivities: $event.checked })">
      </mat-slide-toggle>
    </div>

    <div class="row-line">
      <div class="row-text"><div class="row-title">{{ 'dcma.common.filters.ignoreWbsSummary' | transloco }}</div></div>
      <mat-slide-toggle
        [checked]="adv().ignoreWbsSummaryActivities"
        (change)="patch({ ignoreWbsSummaryActivities: $event.checked })">
      </mat-slide-toggle>
    </div>

    <div class="row-line">
      <div class="row-text"><div class="row-title">{{ 'dcma.common.filters.ignoreCompleted' | transloco }}</div></div>
      <mat-slide-toggle
        [checked]="adv().ignoreCompletedActivities"
        (change)="patch({ ignoreCompletedActivities: $event.checked })">
      </mat-slide-toggle>
    </div>

    <!-- Thresholds (percent) -->
    <h4 class="section-title">{{ 'dcma.common.title.thresholds' | transloco }}</h4>

    <div class="row-line">
      <div class="row-text">
        <div class="row-title">{{ 'dcma.common.thresholds.requiredMaxPct' | transloco }}</div>
      </div>
      <mat-form-field class="pct-field" appearance="outline">
        <input
          matInput type="number" min="0" max="100" step="0.1" inputmode="decimal"
          [value]="adv().thresholds.requiredMaxPct"
          (input)="onRequiredPct($any($event.target).value)">
        <span matTextSuffix>%</span>
      </mat-form-field>
    </div>

    <div class="row-line">
      <div class="row-text">
        <div class="row-title">{{ 'dcma.common.thresholds.averageMaxPct' | transloco }}</div>
      </div>
      <mat-form-field class="pct-field" appearance="outline">
        <input
          matInput type="number" min="0" max="100" step="0.1" inputmode="decimal"
          [value]="adv().thresholds.averageMaxPct"
          (input)="onAveragePct($any($event.target).value)">
        <span matTextSuffix>%</span>
      </mat-form-field>
    </div>

    <div class="row-line">
      <div class="row-text">
        <div class="row-title">{{ 'dcma.common.thresholds.greatMaxPct' | transloco }}</div>
      </div>
      <mat-form-field class="pct-field" appearance="outline">
        <input
          matInput type="number" min="0" max="100" step="0.1" inputmode="decimal"
          [value]="adv().thresholds.greatMaxPct"
          (input)="onGreatPct($any($event.target).value)">
        <span matTextSuffix>%</span>
      </mat-form-field>
    </div>

    <div class="threshold-bar" [style.background]="thresholdGradient()"></div>
  `
})
export class DcmaCheck10SettingsPaneComponent {
  private readonly svc = inject(DcmaAdv10SettingsService);
  readonly adv = computed<DcmaCheck10Advanced>(() => this.svc.adv10());

  // ---- patch helpers ----
  patch(patch: Partial<DcmaCheck10Advanced>): void {
    this.svc.patchAdv10(patch);
  }

  patchInt<K extends keyof DcmaCheck10Advanced>(key: K, v: string): void {
    const n = Math.floor(Number(v));
    if (!Number.isFinite(n) || n < 0) return;
    this.patch({ [key]: n } as Partial<DcmaCheck10Advanced>);
  }

  patchFloat<K extends keyof DcmaCheck10Advanced>(key: K, v: string): void {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return;
    this.patch({ [key]: n } as Partial<DcmaCheck10Advanced>);
  }

  // ---- thresholds helpers: enforce great ≤ average ≤ required ----
  private clampPct(x: unknown): number {
    const n = Number(x);
    if (!Number.isFinite(n)) return 0;
    const bounded = Math.min(Math.max(n, 0), 100);
    return Math.round(bounded * 10) / 10; // шаг 0.1
  }

  onRequiredPct(v: string): void {
    const cur = this.adv().thresholds;
    const req = this.clampPct(v);
    const avg = Math.min(this.clampPct(cur.averageMaxPct), req);
    const grt = Math.min(this.clampPct(cur.greatMaxPct),   avg);
    this.patch({ thresholds: { requiredMaxPct: req, averageMaxPct: avg, greatMaxPct: grt } });
  }

  onAveragePct(v: string): void {
    const cur = this.adv().thresholds;
    const req = this.clampPct(cur.requiredMaxPct);
    const avg = Math.min(this.clampPct(v), req);
    const grt = Math.min(this.clampPct(cur.greatMaxPct), avg);
    this.patch({ thresholds: { requiredMaxPct: req, averageMaxPct: avg, greatMaxPct: grt } });
  }

  onGreatPct(v: string): void {
    const cur = this.adv().thresholds;
    const req = this.clampPct(cur.requiredMaxPct);
    const grt = this.clampPct(v);
    const avg = Math.min(Math.max(grt, this.clampPct(cur.averageMaxPct)), req);
    this.patch({ thresholds: { requiredMaxPct: req, averageMaxPct: avg, greatMaxPct: grt } });
  }

  // ---- decorative gradient bar (зелёный → жёлтый → красный) ----
  private clamp01(n: number): number {
    return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
  }
  thresholdGradient(): string {
    const t = this.adv().thresholds;
    const gp = this.clamp01(t.greatMaxPct);
    const ap = this.clamp01(t.averageMaxPct);
    const g = '#4CAF50', y = '#FFC107', r = '#EF5350';
    if (ap <= gp) return `linear-gradient(to right, ${g} 0 ${gp}%, ${r} ${gp}% 100%)`;
    return `linear-gradient(to right, ${g} 0 ${gp}%, ${y} ${gp}% ${ap}%, ${r} ${ap}% 100%)`;
  }
}