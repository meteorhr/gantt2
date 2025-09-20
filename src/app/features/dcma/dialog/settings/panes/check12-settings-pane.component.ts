import { Component, inject, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDividerModule } from '@angular/material/divider';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { TranslocoModule } from '@jsverse/transloco';

import { DcmaAdv12SettingsService } from '../../../services/adv/settings/adv12-settings.service';
import type { DcmaCheck12Advanced } from '../../../services/adv/types/adv12-settings.types';

@Component({
  standalone: true,
  selector: 'app-dcma-check12-settings-pane',
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
      <div class="row-text">
        <div class="row-title">{{ 'dcma.common.general.includeDetails' | transloco }}</div>
      </div>
      <mat-slide-toggle
        [checked]="adv().includeDetails"
        (change)="patch({ includeDetails: $event.checked })"
        [attr.aria-label]="'dcma.common.general.includeDetails' | transloco">
      </mat-slide-toggle>
    </div>

    <!-- Thresholds (Criticality by TF) -->
    <h4 class="section-title">{{ 'dcma.common.title.thresholds' | transloco }}</h4>

    <div class="row-line">
      <div class="row-text">
        <div class="row-title">{{ 'dcma.common.tolerance.mode' | transloco : { default: 'Mode' } }}</div>
        <div class="muted">{{ 'dcma.common.calendar.note' | transloco }}</div>
      </div>
    </div>

    <div class="row-block">
      <mat-radio-group
        class="radio-vert"
        [value]="adv().floatThresholdMode"
        (change)="patch({ floatThresholdMode: $any($event.value) })"
        [attr.aria-label]="'dcma.common.tolerance.mode' | transloco">
        <mat-radio-button value="auto">{{ 'dcma.common.mode.auto' | transloco }}</mat-radio-button>
        <mat-radio-button value="fixed">{{ 'dcma.common.mode.fixed' | transloco }}</mat-radio-button>
      </mat-radio-group>
    </div>

    @if (adv().floatThresholdMode === 'fixed') {
      <div class="row-line">
        <div class="row-text">
          <div class="row-title">{{ 'dcma.common.tolerance.hours' | transloco }}</div>
          <div class="muted">{{ 'dcma.common.notes.tfHours' | transloco : { default: 'Total Float threshold in hours' } }}</div>
        </div>
        <mat-form-field class="pct-field" appearance="outline">
          <input
            matInput type="number" min="0" step="0.1" inputmode="decimal"
            [value]="adv().floatThresholdHours"
            (input)="patchFloat('floatThresholdHours', $any($event.target).value)">
          <span matTextSuffix>h</span>
        </mat-form-field>
      </div>
    }

    <div class="row-line">
      <div class="row-text">
        <div class="row-title">{{ 'dcma.check12.simulatedDelayDays' | transloco : { default: 'Simulated delay (days)' } }}</div>
        <div class="muted">{{ 'dcma.check12.simulatedNote' | transloco : { default: 'Used by the heuristic test; HPD is taken from calendars' } }}</div>
      </div>
      <mat-form-field class="pct-field" appearance="outline">
        <input
          matInput type="number" min="0" step="1" inputmode="numeric" pattern="\\d*"
          [value]="adv().simulatedDelayDays"
          (input)="patchInt('simulatedDelayDays', $any($event.target).value)">
        <span matTextSuffix>d</span>
      </mat-form-field>
    </div>

    <!-- Filters -->
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
  `
})
export class DcmaCheck12SettingsPaneComponent {
  private readonly svc = inject(DcmaAdv12SettingsService);
  readonly adv = computed<DcmaCheck12Advanced>(() => this.svc.adv12());

  patch(patch: Partial<DcmaCheck12Advanced>): void {
    this.svc.patchAdv12(patch);
  }

  patchInt<K extends keyof DcmaCheck12Advanced>(key: K, v: string): void {
    const n = Math.max(0, Math.floor(Number(v)));
    if (!Number.isFinite(n)) return;
    this.patch({ [key]: n } as Partial<DcmaCheck12Advanced>);
  }

  patchFloat<K extends keyof DcmaCheck12Advanced>(key: K, v: string): void {
    const n = Math.max(0, Number(v));
    if (!Number.isFinite(n)) return;
    // шаг 0.1
    const snapped = Math.round(n * 10) / 10;
    this.patch({ [key]: snapped } as Partial<DcmaCheck12Advanced>);
  }
}