import { Component, ChangeDetectionStrategy, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoModule } from '@jsverse/transloco';

import { DcmaSettingsService } from '../../../services/dcma-settings.service';
import type { DcmaCheck5Advanced } from '../../../services/dcma-settings.service';

@Component({
  standalone: true,
  selector: 'app-dcma-check5-settings-pane',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    MatSlideToggleModule,
    MatFormFieldModule,
    MatInputModule,
    MatDividerModule,
    MatIconModule,
    TranslocoModule,
  ],
  styles: [`
    .radio-vertical { display:flex; flex-direction:column; gap:8px; }
    .pct-row { display:flex; align-items:center; gap:12px; }
    .pct-field { width:120px; margin-left:auto; }
    .threshold-bar { height:8px; border-radius:4px; margin:8px 0 16px;
      background: linear-gradient(90deg, #d32f2f 0%, #fbc02d 50%, #388e3c 100%);
    }
    .note { font-size: 12px; opacity: 0.85; }
    .section { margin-top: 8px; }
    .title { font-weight: 600; margin: 8px 0; display:flex; align-items:center; gap:8px; }
    .spacer { flex: 1 1 auto; }
    .mt8 { margin-top: 8px; }
  `],
  template: `
    <div>
      <div class="title">
        <mat-icon>tune</mat-icon>
        <span>{{ 'dcma.check5.title.general' | transloco }}</span>
      </div>

      <div class="radio-vertical">
        <mat-slide-toggle
          [ngModel]="adv().includeDetails"
          (ngModelChange)="onToggle('includeDetails', $event)">
          {{ 'dcma.common.includeDetails' | transloco }}
        </mat-slide-toggle>

        <div class="pct-row">
          <span>{{ 'dcma.common.detailsLimit' | transloco }}</span>
          <mat-form-field class="pct-field" appearance="outline">
            <input matInput type="number" min="0" step="1"
              [ngModel]="adv().detailsLimit"
              (ngModelChange)="onNumber('detailsLimit', $event)">
          </mat-form-field>
        </div>
      </div>

      <mat-divider class="mt8"></mat-divider>

      <div class="title">
        <mat-icon>filter_alt</mat-icon>
        <span>{{ 'dcma.check5.title.filters' | transloco }}</span>
      </div>

      <div class="radio-vertical">
        <mat-slide-toggle
          [ngModel]="adv().ignoreMilestoneActivities"
          (ngModelChange)="onToggle('ignoreMilestoneActivities', $event)">
          {{ 'dcma.common.filters.ignoreMilestones' | transloco }}
        </mat-slide-toggle>

        <mat-slide-toggle
          [ngModel]="adv().ignoreLoEActivities"
          (ngModelChange)="onToggle('ignoreLoEActivities', $event)">
          {{ 'dcma.common.filters.ignoreLoE' | transloco }}
        </mat-slide-toggle>

        <mat-slide-toggle
          [ngModel]="adv().ignoreWbsSummaryActivities"
          (ngModelChange)="onToggle('ignoreWbsSummaryActivities', $event)">
          {{ 'dcma.common.filters.ignoreWbsSummary' | transloco }}
        </mat-slide-toggle>

        <mat-slide-toggle
          [ngModel]="adv().ignoreCompletedActivities"
          (ngModelChange)="onToggle('ignoreCompletedActivities', $event)">
          {{ 'dcma.common.filters.ignoreCompleted' | transloco }}
        </mat-slide-toggle>
      </div>

      <mat-divider class="mt8"></mat-divider>

      <div class="title">
        <mat-icon>stacked_bar_chart</mat-icon>
        <span>{{ 'dcma.check5.title.thresholds' | transloco }}</span>
        <span class="spacer"></span>
      </div>

      <div class="note">
        {{ 'dcma.check5.note.required' | transloco : { value: adv().thresholds.requiredMaxPct | number:'1.0-1' } }}
      </div>
      <div class="note">
        {{ 'dcma.check5.note.kpiOnly' | transloco }}
      </div>

      <div class="threshold-bar"></div>

      <div class="radio-vertical">
        <div class="pct-row">
          <span>{{ 'dcma.common.thresholds.requiredMaxPct' | transloco }}</span>
          <mat-form-field class="pct-field" appearance="outline">
            <input matInput type="number" min="0" max="100" step="0.1"
              [ngModel]="adv().thresholds.requiredMaxPct"
              (ngModelChange)="onRequiredChange($event)">
          </mat-form-field>
        </div>

        <div class="pct-row">
          <span>{{ 'dcma.common.thresholds.averageMaxPct' | transloco }}</span>
          <mat-form-field class="pct-field" appearance="outline">
            <input matInput type="number" min="0" max="100" step="0.1"
              [ngModel]="adv().thresholds.averageMaxPct"
              (ngModelChange)="onAverageChange($event)">
          </mat-form-field>
        </div>

        <div class="pct-row">
          <span>{{ 'dcma.common.thresholds.greatMaxPct' | transloco }}</span>
          <mat-form-field class="pct-field" appearance="outline">
            <input matInput type="number" min="0" max="100" step="0.1"
              [ngModel]="adv().thresholds.greatMaxPct"
              (ngModelChange)="onGreatChange($event)">
          </mat-form-field>
        </div>
      </div>
    </div>
  `,
})
export class DcmaCheck5SettingsPaneComponent {
  private readonly svc = inject(DcmaSettingsService);
  adv = computed<DcmaCheck5Advanced>(() => this.svc.adv5());

  // --- helpers ---
  private clamp01(val: number, max=100, step=0.1): number {
    const v = Number.isFinite(+val) ? +val : 0;
    const c = Math.min(Math.max(v, 0), max);
    return Math.round(c / step) * step;
  }

  onToggle<K extends keyof DcmaCheck5Advanced>(key: K, v: any): void {
    const patch: Partial<DcmaCheck5Advanced> = { [key]: !!v } as any;
    this.svc.patchAdv5(patch);
  }

  onNumber<K extends keyof DcmaCheck5Advanced>(key: K, v: any): void {
    const n = Math.max(0, Math.floor(+v || 0));
    const patch: Partial<DcmaCheck5Advanced> = { [key]: n } as any;
    this.svc.patchAdv5(patch);
  }

  onRequiredChange(v: any): void {
    const required = this.clamp01(+v);
    const { averageMaxPct, greatMaxPct } = this.adv().thresholds;
    const avg = Math.min(averageMaxPct, required);
    const great = Math.min(greatMaxPct, avg);
    this.svc.patchAdv5({ thresholds: { requiredMaxPct: required, averageMaxPct: avg, greatMaxPct: great } });
  }

  onAverageChange(v: any): void {
    const a = this.adv().thresholds;
    const required = a.requiredMaxPct;
    const average = Math.min(this.clamp01(+v), required);
    const great = Math.min(a.greatMaxPct, average);
    this.svc.patchAdv5({ thresholds: { requiredMaxPct: required, averageMaxPct: average, greatMaxPct: great } });
  }

  onGreatChange(v: any): void {
    const a = this.adv().thresholds;
    const great = this.clamp01(+v);
    const average = Math.max(great, Math.min(a.averageMaxPct, a.requiredMaxPct));
    const required = Math.max(average, a.requiredMaxPct); // не понижаем required
    this.svc.patchAdv5({ thresholds: { requiredMaxPct: required, averageMaxPct: average, greatMaxPct: great } });
  }
}
