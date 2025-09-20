import { Component, inject, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDividerModule } from '@angular/material/divider';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { TranslocoModule } from '@jsverse/transloco';

import { DcmaAdv8SettingsService } from '../../../services/adv/settings/adv8-settings.service';
import type { DcmaCheck8Advanced } from '../../../services/adv/types/adv8-settings.types';

@Component({
  standalone: true,
  selector: 'app-dcma-check8-settings-pane',
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
      <div class="row-text"><div class="row-title">{{ 'dcma.common.general.includeDetails' | transloco }}</div></div>
      <mat-slide-toggle
        [checked]="adv().includeDetails"
        (change)="patch({ includeDetails: $event.checked })">
      </mat-slide-toggle>
    </div>

    @if (adv().includeDetails) {
      <div class="row-line">
        <div class="row-text"><div class="row-title">{{ 'dcma.common.general.detailsLimit' | transloco }}</div></div>
        <mat-form-field class="pct-field" appearance="outline">
          <input
            matInput type="number" min="0" step="1" inputmode="numeric" pattern="\\d*"
            [value]="adv().detailsLimit"
            (input)="patchInt('detailsLimit', $any($event.target).value)">
        </mat-form-field>
      </div>
    }

    <div class="row-line">
      <div class="row-text">
        <div class="row-title">{{ 'dcma.common.title.calendar' | transloco }}</div>
        <div class="muted">{{ 'dcma.common.calendar.note' | transloco }}</div>
      </div>
    </div>

    <!-- Fallback HPD (основной HPD берётся из календарей) -->
    <div class="row-line">
      <div class="row-text"><div class="row-title">{{ 'dcma.common.calendar.defaultHpd' | transloco }}</div></div>
      <mat-form-field class="pct-field" appearance="outline">
        <input
          matInput type="number" min="1" step="1" inputmode="numeric" pattern="\\d*"
          [value]="adv().hoursPerDay"
          (input)="patchInt('hoursPerDay', $any($event.target).value)">
        <span matTextSuffix>h</span>
      </mat-form-field>
    </div>

    <!-- Threshold days (> X days Remaining Duration считается "High Duration") -->
    <div class="row-line">
      <div class="row-text"><div class="row-title">{{ 'dcma.check8.thresholdDays' | transloco }}</div></div>
      <mat-form-field class="pct-field" appearance="outline">
        <input
          matInput type="number" min="0" step="0.1" inputmode="decimal"
          [value]="adv().thresholdDays"
          (input)="patchFloat('thresholdDays', $any($event.target).value)">
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

    <!-- Thresholds -->
    <h4 class="section-title">{{ 'dcma.common.title.thresholds' | transloco }}</h4>

    <div class="row-line">
      <div class="row-text"><div class="row-title">{{ 'dcma.common.thresholds.requiredMaxPct' | transloco }}</div></div>
      <mat-form-field class="pct-field" appearance="outline">
        <input
          matInput type="number" min="0" max="100" step="0.1" inputmode="decimal"
          [value]="adv().thresholds.requiredMaxPct"
          (input)="onRequiredPct($any($event.target).value)">
        <span matTextSuffix>%</span>
      </mat-form-field>
    </div>

    <div class="row-line">
      <div class="row-text"><div class="row-title">{{ 'dcma.common.thresholds.averageMaxPct' | transloco }}</div></div>
      <mat-form-field class="pct-field" appearance="outline">
        <input
          matInput type="number" min="0" max="100" step="0.1" inputmode="decimal"
          [value]="adv().thresholds.averageMaxPct"
          (input)="onAveragePct($any($event.target).value)">
        <span matTextSuffix>%</span>
      </mat-form-field>
    </div>

    <div class="row-line">
      <div class="row-text"><div class="row-title">{{ 'dcma.common.thresholds.greatMaxPct' | transloco }}</div></div>
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
export class DcmaCheck8SettingsPaneComponent {
  private readonly svc = inject(DcmaAdv8SettingsService);
  readonly adv = computed<DcmaCheck8Advanced>(() => this.svc.adv8());

  // ---- patch helpers ----
  patch(patch: Partial<DcmaCheck8Advanced>): void {
    this.svc.patchAdv8(patch);
  }

  patchInt<K extends keyof DcmaCheck8Advanced>(key: K, v: string): void {
    const n = Math.floor(Number(v));
    if (!Number.isFinite(n) || n < 0) return;
    this.patch({ [key]: n } as Partial<DcmaCheck8Advanced>);
  }

  patchFloat<K extends keyof DcmaCheck8Advanced>(key: K, v: string): void {
    const num = Number(v);
    if (!Number.isFinite(num) || num < 0) return;
    this.patch({ [key]: num } as Partial<DcmaCheck8Advanced>);
  }

  // ---- thresholds with ordering: great ≤ average ≤ required ----
  private clampPct(x: unknown): number {
    const n = Number(x);
    if (!Number.isFinite(n)) return 0;
    const bounded = Math.max(0, Math.min(100, n));
    return Math.round(bounded * 10) / 10; // шаг 0.1
  }

  onRequiredPct(v: string): void {
    const cur = this.adv().thresholds;
    const req = this.clampPct(v);
    const avg = Math.min(cur.averageMaxPct, req);
    const grt = Math.min(cur.greatMaxPct,   avg);
    this.patch({ thresholds: { requiredMaxPct: req, averageMaxPct: avg, greatMaxPct: grt } });
  }

  onAveragePct(v: string): void {
    const cur = this.adv().thresholds;
    const req = cur.requiredMaxPct;
    const avg = Math.min(this.clampPct(v), req);
    const grt = Math.min(cur.greatMaxPct, avg);
    this.patch({ thresholds: { requiredMaxPct: req, averageMaxPct: avg, greatMaxPct: grt } });
  }

  onGreatPct(v: string): void {
    const cur = this.adv().thresholds;
    const req = cur.requiredMaxPct;
    const grt = this.clampPct(v);
    const avg = Math.min(Math.max(grt, cur.averageMaxPct), req);
    this.patch({ thresholds: { requiredMaxPct: req, averageMaxPct: avg, greatMaxPct: grt } });
  }

  // ---- gradient (зелёный → жёлтый → красный) ----
  private clampIntPct(n: number): number {
    return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
  }
  thresholdGradient(): string {
    const t = this.adv().thresholds;
    const gp = this.clampIntPct(t.greatMaxPct);
    const ap = this.clampIntPct(t.averageMaxPct);
    const g = '#4CAF50', y = '#FFC107', r = '#EF5350';
    if (ap <= gp) return `linear-gradient(to right, ${g} 0 ${gp}%, ${r} ${gp}% 100%)`;
    return `linear-gradient(to right, ${g} 0 ${gp}%, ${y} ${gp}% ${ap}%, ${r} ${ap}% 100%)`;
  }
}