import { Component, inject, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDividerModule } from '@angular/material/divider';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { TranslocoModule } from '@jsverse/transloco';

import { DcmaAdv9SettingsService } from '../../../services/adv/settings/adv9-settings.service';
import type { DcmaCheck9Advanced } from '../../../services/adv/types/adv9-settings.types';

@Component({
  standalone: true,
  selector: 'app-dcma-check9-settings-pane',
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
        (change)="patch({ includeDetails: $event.checked })">
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

    <!-- Tolerances (days) -->
    <h4 class="section-title">{{ 'dcma.common.title.tolerance' | transloco }}</h4>
    <p class="muted">
      {{ 'dcma.check9.note' | transloco }}
    </p>

    <div class="row-line">
      <div class="row-text">
        <div class="row-title">{{ 'dcma.common.tolerance.forecastDays' | transloco }}</div>
      </div>
      <mat-form-field class="pct-field" appearance="outline">
        <input
          matInput type="number" min="0" step="1" inputmode="numeric" pattern="\\d*"
          [value]="adv().forecastToleranceDays"
          (input)="patchInt('forecastToleranceDays', $any($event.target).value)">
        <span matTextSuffix>d</span>
      </mat-form-field>
    </div>

    <div class="row-line">
      <div class="row-text">
        <div class="row-title">{{ 'dcma.common.tolerance.actualDays' | transloco }}</div>
      </div>
      <mat-form-field class="pct-field" appearance="outline">
        <input
          matInput type="number" min="0" step="1" inputmode="numeric" pattern="\\d*"
          [value]="adv().actualToleranceDays"
          (input)="patchInt('actualToleranceDays', $any($event.target).value)">
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

    <!-- Thresholds (counts) -->
    <h4 class="section-title">{{ 'dcma.common.title.thresholds' | transloco }}</h4>

    <div class="row-line">
      <div class="row-text">
        <div class="row-title">{{ 'dcma.common.thresholds.required' | transloco }}</div>
      </div>
      <mat-form-field class="pct-field" appearance="outline">
        <input
          matInput type="number" min="0" step="1" inputmode="numeric" pattern="\\d*"
          [value]="adv().thresholds.requiredMaxTotalCount"
          (input)="onRequiredCount($any($event.target).value)">
      </mat-form-field>
    </div>

    <div class="row-line">
      <div class="row-text">
        <div class="row-title">{{ 'dcma.common.thresholds.average' | transloco }}</div>
      </div>
      <mat-form-field class="pct-field" appearance="outline">
        <input
          matInput type="number" min="0" step="1" inputmode="numeric" pattern="\\d*"
          [value]="adv().thresholds.averageMaxTotalCount"
          (input)="onAverageCount($any($event.target).value)">
      </mat-form-field>
    </div>

    <div class="row-line">
      <div class="row-text">
        <div class="row-title">{{ 'dcma.common.thresholds.great' | transloco }}</div>
      </div>
      <mat-form-field class="pct-field" appearance="outline">
        <input
          matInput type="number" min="0" step="1" inputmode="numeric" pattern="\\d*"
          [value]="adv().thresholds.greatMaxTotalCount"
          (input)="onGreatCount($any($event.target).value)">
      </mat-form-field>
    </div>

    <div class="threshold-bar" [style.background]="thresholdGradient()"></div>
  `
})
export class DcmaCheck9SettingsPaneComponent {
  private readonly svc = inject(DcmaAdv9SettingsService);
  readonly adv = computed<DcmaCheck9Advanced>(() => this.svc.adv9());

  // --- patch helpers ---
  patch(patch: Partial<DcmaCheck9Advanced>): void {
    this.svc.patchAdv9(patch);
  }

  patchInt<K extends keyof DcmaCheck9Advanced>(key: K, v: string): void {
    const n = Math.floor(Number(v));
    if (!Number.isFinite(n) || n < 0) return;
    this.patch({ [key]: n } as Partial<DcmaCheck9Advanced>);
  }

  private clampInt(x: unknown, min = 0, max = 1_000_000): number {
    const n = Math.floor(Number(x));
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, n));
  }

  // thresholds with ordering: great ≤ average ≤ required
  onRequiredCount(v: string): void {
    const cur = this.adv().thresholds;
    const req = this.clampInt(v);
    const avg = Math.min(this.clampInt(cur.averageMaxTotalCount), req);
    const grt = Math.min(this.clampInt(cur.greatMaxTotalCount),   avg);
    this.patch({ thresholds: { requiredMaxTotalCount: req, averageMaxTotalCount: avg, greatMaxTotalCount: grt } });
  }

  onAverageCount(v: string): void {
    const cur = this.adv().thresholds;
    const req = this.clampInt(cur.requiredMaxTotalCount);
    const avg = Math.min(this.clampInt(v), req);
    const grt = Math.min(this.clampInt(cur.greatMaxTotalCount), avg);
    this.patch({ thresholds: { requiredMaxTotalCount: req, averageMaxTotalCount: avg, greatMaxTotalCount: grt } });
  }

  onGreatCount(v: string): void {
    const cur = this.adv().thresholds;
    const req = this.clampInt(cur.requiredMaxTotalCount);
    const grt = this.clampInt(v);
    const avg = Math.min(Math.max(grt, this.clampInt(cur.averageMaxTotalCount)), req);
    this.patch({ thresholds: { requiredMaxTotalCount: req, averageMaxTotalCount: avg, greatMaxTotalCount: grt } });
  }

  // decorative gradient bar (зелёный → жёлтый → красный)
  private clampIntPct(n: number): number {
    return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
  }
  thresholdGradient(): string {
    // для counts нет процента; рисуем простой «три-цвет» по местам great/avg/required условно
    const g = '#4CAF50', y = '#FFC107', r = '#EF5350';
    // фиксированные сегменты, чтобы не вводить шкалу — чисто визуальное разделение
    return `linear-gradient(to right, ${g} 0 33%, ${y} 33% 66%, ${r} 66% 100%)`;
  }
}