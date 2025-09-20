import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDividerModule } from '@angular/material/divider';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoModule } from '@jsverse/transloco';

import { DcmaSettingsService } from '../../../services/adv/dcma-settings.service';
import type { DcmaCheck5Advanced } from '../../../services/adv/dcma-settings.service';

@Component({
  standalone: true,
  selector: 'app-dcma-check5-settings-pane',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    MatDividerModule,
    MatSlideToggleModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    TranslocoModule,
  ],
  styleUrls: ['./settings-pane.component.scss'],
  template: `
    <mat-divider></mat-divider>

    <h4 class="section-title">
      <span>{{ 'dcma.common.title.general' | transloco }}</span>
    </h4>

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
          <input matInput type="number" min="0" step="1"
                 [value]="adv().detailsLimit"
                 (input)="patchNum('detailsLimit', $any($event.target).value)">
        </mat-form-field>
      </div>
    }

    <h4 class="section-title">
      <span>{{ 'dcma.common.title.filters' | transloco }}</span>
    </h4>

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

    <h4 class="section-title">
      <span>{{ 'dcma.common.title.thresholds' | transloco }}</span>
    </h4>

    <p class="muted">
      {{ 'dcma.check5.note.required' | transloco : { value: adv().thresholds.requiredMaxPct | number:'1.0-1' } }}
    </p>
    <p class="muted">
      {{ 'dcma.check5.note.kpiOnly' | transloco }}
    </p>

    <div class="row-line">
      <div class="row-text"><div class="row-title">{{ 'dcma.common.thresholds.average' | transloco }}</div></div>
      <mat-form-field class="pct-field" appearance="outline">
        <input matInput type="number" min="0" max="100" step="0.1"
               [value]="adv().thresholds.averageMaxPct"
               (input)="onAverageChange($any($event.target).value)">
        <span matTextSuffix>%</span>
      </mat-form-field>
    </div>

    <div class="row-line">
      <div class="row-text"><div class="row-title">{{ 'dcma.common.thresholds.great' | transloco }}</div></div>
      <mat-form-field class="pct-field" appearance="outline">
        <input matInput type="number" min="0" max="100" step="0.1"
               [value]="adv().thresholds.greatMaxPct"
               (input)="onGreatChange($any($event.target).value)">
        <span matTextSuffix>%</span>
      </mat-form-field>
    </div>

    <div class="threshold-bar" [style.background]="thresholdGradient()"></div>
  `,
})
export class DcmaCheck5SettingsPaneComponent {
  private readonly svc = inject(DcmaSettingsService);
  readonly adv = computed<DcmaCheck5Advanced>(() => this.svc.adv5());

  // --- patch helpers ---
  patch(p: Partial<DcmaCheck5Advanced>) { this.svc.patchAdv5(p); }

  patchNum<K extends keyof DcmaCheck5Advanced>(key: K, v: string) {
    const n = Math.max(0, Math.floor(Number(v)));
    if (!Number.isFinite(n)) return;
    this.patch({ [key]: n } as any);
  }

  private clampPct(v: unknown): number {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    const c = Math.min(100, Math.max(0, n));
    return Math.round(c * 10) / 10; // шаг 0.1
  }


  onAverageChange(v: string) {
    const { requiredMaxPct, greatMaxPct } = this.adv().thresholds;
    const avg = Math.min(this.clampPct(v), requiredMaxPct);
    const grt = Math.min(greatMaxPct, avg);
    this.patch({ thresholds: { requiredMaxPct, averageMaxPct: avg, greatMaxPct: grt } });
  }

  onGreatChange(v: string) {
    const { requiredMaxPct, averageMaxPct } = this.adv().thresholds;
    const grt = this.clampPct(v);
    const avg = Math.min(Math.max(grt, averageMaxPct), requiredMaxPct);
    this.patch({ thresholds: { requiredMaxPct, averageMaxPct: avg, greatMaxPct: grt } });
  }

  private clampInt(n: number): number {
    return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
  }

  /** Градиент: зелёный 0..Great, жёлтый Great..Average, красный выше Average */
  thresholdGradient(): string {
    const t = this.adv().thresholds;
    const gp = this.clampInt(t.greatMaxPct);
    const ap = this.clampInt(t.averageMaxPct);
    const g = '#4CAF50', y = '#FFC107', r = '#EF5350';
    if (ap <= gp) {
      // если по какой-то причине equal/перекрёст, показываем две зоны
      return `linear-gradient(to right, ${g} 0 ${gp}%, ${r} ${gp}% 100%)`;
    }
    return `linear-gradient(to right, ${g} 0 ${gp}%, ${y} ${gp}% ${ap}%, ${r} ${ap}% 100%)`;
  }
}