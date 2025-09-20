import { Component, inject, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDividerModule } from '@angular/material/divider';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { TranslocoModule } from '@jsverse/transloco';

import { DcmaAdv14SettingsService } from '../../../services/adv/settings/adv14-settings.service';
import type { DcmaCheck14Advanced } from '../../../services/adv/types/adv14-settings.types';

@Component({
  standalone: true,
  selector: 'app-dcma-check14-settings-pane',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatDividerModule,
    MatSlideToggleModule,
    MatFormFieldModule,
    MatInputModule,
    MatRadioModule,
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
        (change)="patch({ includeDetails: $event.checked })"
        [attr.aria-label]="'dcma.common.general.includeDetails' | transloco">
      </mat-slide-toggle>
    </div>

    <!-- Data Date -->
    <h4 class="section-title">{{ 'dcma.check14.title.dataDate' | transloco : { default: 'Data Date' } }}</h4>

    <div class="row-line">
      <div class="row-text">
        <div class="row-title">
          {{ 'dcma.check14.dataDate.override' | transloco : { default: 'Override Data Date (ISO)' } }}
        </div>
        <div class="muted">
          {{ 'dcma.check14.dataDate.note' | transloco : { default: 'Leave empty to fetch from PROJECT by field order below' } }}
        </div>
      </div>
      <mat-form-field class="pct-field" appearance="outline">
        <input
          matInput
          type="date"
          [value]="adv().dataDateOverrideISO ?? ''"
          (input)="onDataDateOverride($any($event.target).value)"
          [attr.aria-label]="'dcma.check14.dataDate.override' | transloco">
      </mat-form-field>
    </div>

    <div class="row-line">
      <div class="row-text">
        <div class="row-title">
          {{ 'dcma.check14.dataDate.order' | transloco : { default: 'PROJECT Data Date field order (comma-separated)' } }}
        </div>
      </div>
      <mat-form-field appearance="outline" style="width:100%">
        <input
          matInput
          [value]="adv().dataDateFieldOrder.join(', ')"
          (input)="onList('dataDateFieldOrder', $any($event.target).value)"
          [attr.aria-label]="'dcma.check14.dataDate.order' | transloco"
          placeholder="cur_data_date, data_date, status_date">
      </mat-form-field>
    </div>

    <!-- Baseline Finish fields order -->
    <h4 class="section-title">{{ 'dcma.check14.title.baselineOrder' | transloco : { default: 'Baseline Finish fields order' } }}</h4>

    <div class="row-line">
      <div class="row-text">
        <div class="row-title">
          {{ 'dcma.check14.baseline.order' | transloco : { default: 'Task Baseline Finish fields (comma-separated)' } }}
        </div>
      </div>
      <mat-form-field appearance="outline" style="width:100%">
        <input
          matInput
          [value]="adv().baselineFinishFieldsOrder.join(', ')"
          (input)="onList('baselineFinishFieldsOrder', $any($event.target).value)"
          [attr.aria-label]="'dcma.check14.baseline.order' | transloco"
          placeholder="baseline_finish_date, bl_finish_date, target_finish_date">
      </mat-form-field>
    </div>

    <!-- Planned comparison mode -->
    <h4 class="section-title">{{ 'dcma.check14.title.plannedCmp' | transloco : { default: 'Planned comparison mode' } }}</h4>

    <div class="row-block">
      <mat-radio-group
        class="radio-vert"
        [value]="adv().plannedComparisonMode"
        (change)="patch({ plannedComparisonMode: $any($event.value) })"
        [attr.aria-label]="'dcma.check14.title.plannedCmp' | transloco">
        <mat-radio-button value="lte">BL Finish ≤ Data Date</mat-radio-button>
        <mat-radio-button value="lt">BL Finish &lt; Data Date</mat-radio-button>
      </mat-radio-group>
    </div>

    <!-- Actuals policy -->
    <div class="row-line">
      <div class="row-text">
        <div class="row-title">
          {{ 'dcma.check14.actuals.requireAF' | transloco : { default: 'Require Actual Finish for actuals' } }}
        </div>
        <div class="muted">
          {{ 'dcma.check14.actuals.note' | transloco : { default: 'If disabled, Completed status can count as actual completion' } }}
        </div>
      </div>
      <mat-slide-toggle
        [checked]="adv().requireActualFinishForActuals"
        (change)="patch({ requireActualFinishForActuals: $event.checked })"
        [attr.aria-label]="'dcma.check14.actuals.requireAF' | transloco">
      </mat-slide-toggle>
    </div>

    <!-- Filters -->
    <h4 class="section-title">{{ 'dcma.common.title.filters' | transloco }}</h4>

    <div class="row-line">
      <div class="row-text"><div class="row-title">{{ 'dcma.common.filters.ignoreWbsSummary' | transloco }}</div></div>
      <mat-slide-toggle
        [checked]="adv().ignoreWbsSummaryActivities"
        (change)="patch({ ignoreWbsSummaryActivities: $event.checked })"
        [attr.aria-label]="'dcma.common.filters.ignoreWbsSummary' | transloco">
      </mat-slide-toggle>
    </div>
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
      <div class="row-text"><div class="row-title">{{ 'dcma.common.filters.ignoreCompleted' | transloco }}</div></div>
      <mat-slide-toggle
        [checked]="adv().ignoreCompletedActivities"
        (change)="patch({ ignoreCompletedActivities: $event.checked })"
        [attr.aria-label]="'dcma.common.filters.ignoreCompleted' | transloco">
      </mat-slide-toggle>
    </div>

    <!-- Thresholds (BEI — больше лучше) -->
    <h4 class="section-title">{{ 'dcma.common.title.thresholds' | transloco }}</h4>
    <p class="muted">
      {{ 'dcma.check14.note.required' | transloco : { default: 'Pass requires BEI ≥ required', } }}
      <br>
      {{ 'dcma.check14.note.kpiOnly' | transloco : { default: 'Average/Great thresholds affect KPI (colors), not pass rule' } }}
    </p>

    <div class="row-line">
      <div class="row-text"><div class="row-title">{{ 'dcma.common.thresholds.requiredMin' | transloco : { default: 'Required (min BEI)' } }}</div></div>
      <mat-form-field class="pct-field" appearance="outline">
        <input matInput type="number" min="0" max="2" step="0.01"
               [value]="adv().thresholds.requiredMinBei"
               (input)="onRequiredChange($any($event.target).value)"
               [attr.aria-label]="'dcma.common.thresholds.requiredMin' | transloco">
      </mat-form-field>
    </div>

    <div class="row-line">
      <div class="row-text"><div class="row-title">{{ 'dcma.common.thresholds.averageMin' | transloco : { default: 'Average (min BEI)' } }}</div></div>
      <mat-form-field class="pct-field" appearance="outline">
        <input matInput type="number" min="0" max="2" step="0.01"
               [value]="adv().thresholds.averageMinBei"
               (input)="onAverageChange($any($event.target).value)"
               [attr.aria-label]="'dcma.common.thresholds.averageMin' | transloco">
      </mat-form-field>
    </div>

    <div class="row-line">
      <div class="row-text"><div class="row-title">{{ 'dcma.common.thresholds.greatMin' | transloco : { default: 'Great (min BEI)' } }}</div></div>
      <mat-form-field class="pct-field" appearance="outline">
        <input matInput type="number" min="0" max="2" step="0.01"
               [value]="adv().thresholds.greatMinBei"
               (input)="onGreatChange($any($event.target).value)"
               [attr.aria-label]="'dcma.common.thresholds.greatMin' | transloco">
      </mat-form-field>
    </div>

    <div class="threshold-bar" [style.background]="thresholdGradient()"></div>
  `
})
export class DcmaCheck14SettingsPaneComponent {
  private readonly svc = inject(DcmaAdv14SettingsService);
  readonly adv = computed<DcmaCheck14Advanced>(() => this.svc.adv14());

  // --- patch helpers ---
  patch(patch: Partial<DcmaCheck14Advanced>): void { this.svc.patchAdv14(patch); }

  onDataDateOverride(v: string): void {
    const iso = (v && v.length) ? v : null;
    this.patch({ dataDateOverrideISO: iso });
  }

  private parseList(v: string): string[] {
    return String(v ?? '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
  }
  onList(field: 'dataDateFieldOrder' | 'baselineFinishFieldsOrder', v: string): void {
    this.patch({ [field]: this.parseList(v) } as Partial<DcmaCheck14Advanced>);
  }

  // --- thresholds (enforce required ≤ average ≤ great) ---
  private clampBei(val: unknown, max = 2, step = 0.01): number {
    const num = Number(val);
    const safe = Number.isFinite(num) ? num : 0;
    const bounded = Math.min(Math.max(safe, 0), max);
    const snapped = Math.round(bounded / step) * step;
    return Math.round(snapped * 100) / 100;
  }

  onRequiredChange(v: string): void {
    const req = this.clampBei(v);
    const t = this.adv().thresholds;
    const avg = Math.max(t.averageMinBei, req);
    const great = Math.max(t.greatMinBei, avg);
    this.patch({ thresholds: { requiredMinBei: req, averageMinBei: avg, greatMinBei: great } });
  }

  onAverageChange(v: string): void {
    const t = this.adv().thresholds;
    const req = t.requiredMinBei;
    let avg = this.clampBei(v);
    if (avg < req) avg = req;
    const great = Math.max(t.greatMinBei, avg);
    this.patch({ thresholds: { requiredMinBei: req, averageMinBei: avg, greatMinBei: great } });
  }

  onGreatChange(v: string): void {
    const t = this.adv().thresholds;
    const req = t.requiredMinBei;
    const avg = Math.max(t.averageMinBei, req);
    let great = this.clampBei(v);
    if (great < avg) great = avg;
    this.patch({ thresholds: { requiredMinBei: req, averageMinBei: avg, greatMinBei: great } });
  }

  // --- gradient: чем выше BEI, тем лучше (0..maxBeiScaled) ---
  private toPct(x: number, max = 1.5): number {
    const m = Math.max(0.5, Math.min(max, Math.max(x + 0.2, 1.2))); // динамический правый край
    return Math.max(0, Math.min(100, Math.round((x / m) * 100)));
  }
  thresholdGradient(): string {
    const { requiredMinBei, averageMinBei, greatMinBei } = this.adv().thresholds;
    const g = '#4CAF50', y = '#FFC107', r = '#EF5350';
    const gp = this.toPct(greatMinBei);
    const ap = this.toPct(averageMinBei);
    const rp = this.toPct(requiredMinBei);
    // 0..average = red, average..great = yellow, great..end = green
    // (required используется для Pass, но визуально совпадает с «красной зоной»)
    const a = Math.min(ap, gp);
    if (gp <= ap) return `linear-gradient(to right, ${r} 0 ${ap}%, ${y} ${ap}% ${gp}%, ${g} ${gp}% 100%)`;
    // обычный случай: average ≤ great
    return `linear-gradient(to right, ${r} 0 ${ap}%, ${y} ${ap}% ${gp}%, ${g} ${gp}% 100%)`;
  }
}