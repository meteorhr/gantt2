import { Component, inject, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDividerModule } from '@angular/material/divider';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { TranslocoModule } from '@jsverse/transloco';

import { DcmaAdv13SettingsService } from '../../../services/adv/settings/adv13-settings.service';
import type { DcmaCheck13Advanced } from '../../../services/adv/types/adv13-settings.types';

@Component({
  standalone: true,
  selector: 'app-dcma-check13-settings-pane',
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

    <!-- Forecast source -->
    <h4 class="section-title">{{ 'dcma.check13.title.forecastSource' | transloco : { default: 'Forecast source' } }}</h4>

    <div class="row-line">
      <div class="row-text">
        <div class="row-title">{{ 'dcma.check13.forecastSource.label' | transloco : { default: 'Select forecast aggregation source' } }}</div>
        <div class="muted">{{ 'dcma.check13.forecastSource.note' | transloco : { default: 'EF_LF_AF: try EF, then LF, then AF' } }}</div>
      </div>
    </div>

    <div class="row-block">
      <mat-radio-group
        class="radio-vert"
        [value]="adv().forecastSource"
        (change)="patch({ forecastSource: $any($event.value) })"
        [attr.aria-label]="'dcma.check13.forecastSource.label' | transloco">
        <mat-radio-button value="EF_LF_AF">EF → LF → AF</mat-radio-button>
        <mat-radio-button value="EF">EF</mat-radio-button>
        <mat-radio-button value="LF">LF</mat-radio-button>
        <mat-radio-button value="AF">AF</mat-radio-button>
      </mat-radio-group>
    </div>

    <!-- Data Date -->
    <h4 class="section-title">{{ 'dcma.check13.title.dataDate' | transloco : { default: 'Data Date' } }}</h4>

    <div class="row-line">
      <div class="row-text">
        <div class="row-title">{{ 'dcma.check13.dataDate.override' | transloco : { default: 'Override Data Date (ISO)' } }}</div>
        <div class="muted">{{ 'dcma.check13.dataDate.note' | transloco : { default: 'Leave empty to use PROJECT fields by order below' } }}</div>
      </div>
      <mat-form-field class="pct-field" appearance="outline">
        <input
          matInput
          type="date"
          [value]="adv().dataDateOverrideISO ?? ''"
          (input)="onDataDateOverride($any($event.target).value)"
          [attr.aria-label]="'dcma.check13.dataDate.override' | transloco">
      </mat-form-field>
    </div>

    <div class="row-line">
      <div class="row-text">
        <div class="row-title">{{ 'dcma.check13.dataDate.order' | transloco : { default: 'PROJECT Data Date field order (comma-separated)' } }}</div>
      </div>
      <mat-form-field appearance="outline" style="width:60%">
        <input
          matInput
          [value]="adv().dataDateFieldOrder.join(', ')"
          (input)="onList('dataDateFieldOrder', $any($event.target).value)"
          [attr.aria-label]="'dcma.check13.dataDate.order' | transloco"
          placeholder="cur_data_date, data_date, status_date">
      </mat-form-field>
    </div>

    <!-- Baseline Finish fields order -->
    <h4 class="section-title">{{ 'dcma.check13.title.baselineOrder' | transloco : { default: 'Baseline Finish fields order' } }}</h4>

    <div class="row-line">
      <div class="row-text">
        <div class="row-title">{{ 'dcma.check13.baseline.order' | transloco : { default: 'Task Baseline Finish fields (comma-separated)' } }}</div>
      </div>
      <mat-form-field appearance="outline" style="width:60%">
        <input
          matInput
          [value]="adv().baselineFinishFieldsOrder.join(', ')"
          (input)="onList('baselineFinishFieldsOrder', $any($event.target).value)"
          [attr.aria-label]="'dcma.check13.baseline.order' | transloco"
          placeholder="baseline_finish_date, bl_finish_date, target_finish_date">
      </mat-form-field>
    </div>

    <!-- Clamp negative CPL -->
    <div class="row-line">
      <div class="row-text"><div class="row-title">{{ 'dcma.check13.clampNegative' | transloco : { default: 'Clamp negative CPL to 0' } }}</div></div>
      <mat-slide-toggle
        [checked]="adv().clampNegativeCpl"
        (change)="patch({ clampNegativeCpl: $event.checked })"
        [attr.aria-label]="'dcma.check13.clampNegative' | transloco">
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

    <!-- Thresholds -->
    <h4 class="section-title">{{ 'dcma.common.title.thresholds' | transloco }}</h4>
    <p class="muted">
      {{ 'dcma.check13.note.required' | transloco : { default: 'Pass requires |CPLI - 1.0| ≤ %{v}% (DCMA required)', v: adv().thresholds.requiredTolerancePct } }}
      <br>
      {{ 'dcma.check13.note.kpiOnly' | transloco : { default: 'Lower thresholds affect only KPI grading (Great/Average)' } }}
    </p>

    <div class="row-line">
      <div class="row-text"><div class="row-title">{{ 'dcma.common.thresholds.requiredMaxPct' | transloco }}</div></div>
      <mat-form-field class="pct-field" appearance="outline">
        <input matInput type="number" min="0" max="100" step="0.1"
               [value]="adv().thresholds.requiredTolerancePct"
               (input)="onRequiredTol($any($event.target).value)">
        <span matTextSuffix>%</span>
      </mat-form-field>
    </div>

    <div class="row-line">
      <div class="row-text"><div class="row-title">{{ 'dcma.common.thresholds.averageMaxPct' | transloco }}</div></div>
      <mat-form-field class="pct-field" appearance="outline">
        <input matInput type="number" min="0" max="100" step="0.1"
               [value]="adv().thresholds.averageTolerancePct"
               (input)="onAverageTol($any($event.target).value)">
        <span matTextSuffix>%</span>
      </mat-form-field>
    </div>

    <div class="row-line">
      <div class="row-text"><div class="row-title">{{ 'dcma.common.thresholds.greatMaxPct' | transloco }}</div></div>
      <mat-form-field class="pct-field" appearance="outline">
        <input matInput type="number" min="0" max="100" step="0.1"
               [value]="adv().thresholds.greatTolerancePct"
               (input)="onGreatTol($any($event.target).value)">
        <span matTextSuffix>%</span>
      </mat-form-field>
    </div>

    <div class="threshold-bar" [style.background]="thresholdGradient()"></div>
  `
})
export class DcmaCheck13SettingsPaneComponent {
  private readonly svc = inject(DcmaAdv13SettingsService);
  readonly adv = computed<DcmaCheck13Advanced>(() => this.svc.adv13());

  // ---- patch helpers ----
  patch(patch: Partial<DcmaCheck13Advanced>): void { this.svc.patchAdv13(patch); }

  private parseList(v: string): string[] {
    return String(v ?? '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
  }
  onList(field: 'dataDateFieldOrder' | 'baselineFinishFieldsOrder', v: string): void {
    const list = this.parseList(v);
    this.patch({ [field]: list } as Partial<DcmaCheck13Advanced>);
  }

  onDataDateOverride(v: string): void {
    const iso = (v && v.length) ? v : null;
    this.patch({ dataDateOverrideISO: iso });
  }

  // ---- thresholds (enforce great ≤ average ≤ required) ----
  private clampPct(val: unknown, max = 100, step = 0.1): number {
    const num = Number(val);
    const safe = Number.isFinite(num) ? num : 0;
    const bounded = Math.min(Math.max(safe, 0), max);
    const snapped = Math.round(bounded / step) * step;
    return Math.round(snapped * 10) / 10;
  }

  onRequiredTol(v: string): void {
    const req = this.clampPct(v);
    const cur = this.adv().thresholds;
    const avg = Math.min(cur.averageTolerancePct, req);
    const great = Math.min(cur.greatTolerancePct, avg);
    this.patch({ thresholds: { requiredTolerancePct: req, averageTolerancePct: avg, greatTolerancePct: great } });
  }

  onAverageTol(v: string): void {
    const cur = this.adv().thresholds;
    const req = cur.requiredTolerancePct;
    const avg = Math.min(this.clampPct(v), req);
    const great = Math.min(cur.greatTolerancePct, avg);
    this.patch({ thresholds: { requiredTolerancePct: req, averageTolerancePct: avg, greatTolerancePct: great } });
  }

  onGreatTol(v: string): void {
    const cur = this.adv().thresholds;
    const req = cur.requiredTolerancePct;
    const great = this.clampPct(v);
    const avg = Math.min(Math.max(great, cur.averageTolerancePct), req);
    this.patch({ thresholds: { requiredTolerancePct: req, averageTolerancePct: avg, greatTolerancePct: great } });
  }

  // Smaller is better (0% → green, up to great; yellow up to average; red after required)
  private clamp0_100(n: number): number {
    return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n * 10) / 10)) : 0;
  }
  thresholdGradient(): string {
    const t = this.adv().thresholds;
    const gp = this.clamp0_100(t.greatTolerancePct);
    const ap = this.clamp0_100(t.averageTolerancePct);
    const rp = this.clamp0_100(t.requiredTolerancePct);
    const g = '#4CAF50', y = '#FFC107', r = '#EF5350';
    // 0..great = green, great..average = yellow, average..100 = red
    if (ap <= gp) return `linear-gradient(to right, ${g} 0 ${gp}%, ${r} ${gp}% 100%)`;
    if (rp <= ap)  return `linear-gradient(to right, ${g} 0 ${gp}%, ${y} ${gp}% ${ap}%, ${r} ${ap}% 100%)`;
    return `linear-gradient(to right, ${g} 0 ${gp}%, ${y} ${gp}% ${ap}%, ${r} ${ap}% 100%)`;
  }
}