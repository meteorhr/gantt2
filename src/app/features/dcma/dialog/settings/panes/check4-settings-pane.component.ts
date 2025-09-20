import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDividerModule } from '@angular/material/divider';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { TranslocoModule } from '@jsverse/transloco';

import { DcmaSettingsService } from '../../../services/dcma-settings.service';
import type { DcmaCheck4Advanced } from '../../../services/dcma-settings.service'; // ✅ импортируем type

@Component({
  standalone: true,
  selector: 'app-dcma-check4-settings-pane',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, MatDividerModule, MatSlideToggleModule,
    MatFormFieldModule, MatInputModule, MatRadioModule, TranslocoModule
  ],
  styleUrls: ['./settings-pane.component.scss'],
  template: `
    <mat-divider></mat-divider>

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
          <input matInput type="number" min="0" step="1"
                 [value]="adv().detailsLimit"
                 (input)="patchNum('detailsLimit', $any($event.target).value)">
        </mat-form-field>
      </div>
    }
    <h4 class="section-title">{{ 'dcma.common.title.filters' | transloco }}</h4>
    <div class="row-line">
      <div class="row-text"><div class="row-title">{{ 'dcma.common.filters.ignoreMilestones' | transloco }}</div></div>
      <mat-slide-toggle [checked]="adv().ignoreMilestoneRelations" (change)="patch({ ignoreMilestoneRelations: $event.checked })"></mat-slide-toggle>
    </div>
    <div class="row-line">
      <div class="row-text"><div class="row-title">{{ 'dcma.common.filters.ignoreLoE' | transloco }}</div></div>
      <mat-slide-toggle [checked]="adv().ignoreLoERelations" (change)="patch({ ignoreLoERelations: $event.checked })"></mat-slide-toggle>
    </div>
    <div class="row-line">
      <div class="row-text"><div class="row-title">{{ 'dcma.common.filters.ignoreWbsSummary' | transloco }}</div></div>
      <mat-slide-toggle [checked]="adv().ignoreWbsSummaryRelations" (change)="patch({ ignoreWbsSummaryRelations: $event.checked })"></mat-slide-toggle>
    </div>
    <div class="row-line">
      <div class="row-text"><div class="row-title">{{ 'dcma.common.filters.ignoreCompleted' | transloco }}</div></div>
      <mat-slide-toggle [checked]="adv().ignoreCompletedRelations" (change)="patch({ ignoreCompletedRelations: $event.checked })"></mat-slide-toggle>
    </div>

    <h4 class="section-title">{{ 'dcma.common.title.dedup' | transloco }}</h4>
    <div class="row-line">
      <mat-radio-group
        [value]="adv().dedupMode"
        (change)="patch({ dedupMode: $any($event.value) })"
        class="radio-vertical">
        <mat-radio-button value="byType">{{ 'dcma.check4.dedup.byType' | transloco }}</mat-radio-button>
        <mat-radio-button value="byTypeAndLag">{{ 'dcma.check4.dedup.byTypeAndLag' | transloco }}</mat-radio-button>
      </mat-radio-group>
    </div>

    <h4 class="section-title">{{ 'dcma.common.title.thresholds' | transloco }}</h4>
    <p class="muted" style="margin:-4px 0 6px">
      {{ 'dcma.check4.note.kpiOnly' | transloco }}
    </p>

    <div class="row-line">
      <div class="row-text"><div class="row-title">{{ 'dcma.common.thresholds.average' | transloco }}</div></div>
      <mat-form-field class="pct-field" appearance="outline">
        <input matInput type="number" min="0" max="100" step="0.1"
               [value]="adv().thresholds.averagePct"
               (input)="patchPct('averagePct', $any($event.target).value)">
        <span matTextSuffix>%</span>
      </mat-form-field>
    </div>

    <div class="row-line">
      <div class="row-text"><div class="row-title">{{ 'dcma.common.thresholds.great' | transloco }}</div></div>
      <mat-form-field class="pct-field" appearance="outline">
        <input matInput type="number" min="0" max="100" step="0.1"
               [value]="adv().thresholds.greatPct"
               (input)="patchPct('greatPct', $any($event.target).value)">
        <span matTextSuffix>%</span>
      </mat-form-field>
    </div>

    <div class="threshold-bar" [style.background]="thresholdGradient()"></div>
  `
})
export class DcmaCheck4SettingsPaneComponent {
  private readonly svc = inject(DcmaSettingsService);
  readonly adv = computed<DcmaCheck4Advanced>(() => this.svc.adv4());

  patch(p: Partial<DcmaCheck4Advanced>) { this.svc.patchAdv4(p); }

  patchNum<K extends keyof DcmaCheck4Advanced>(key: K, v: string) {
    const n = Number(v); if (!Number.isFinite(n)) return;
    this.patch({ [key]: n } as any);
  }

  patchPct(key: keyof DcmaCheck4Advanced['thresholds'], v: string) {
    let n = Number(v);
    if (!Number.isFinite(n)) return;
    n = Math.max(0, Math.min(100, n));

    const th = this.adv().thresholds;
    const next = { ...th, [key]: n };
    // FS: чем больше, тем лучше → average ≤ great
    if (next.averagePct > next.greatPct) {
      if (key === 'averagePct') next.greatPct = next.averagePct;
      else next.averagePct = next.greatPct;
    }
    this.patch({ thresholds: next });
  }

  private clampPct(x: number) { return Math.max(0, Math.min(100, Math.round(x))); }

  thresholdGradient(): string {
    const { averagePct, greatPct } = this.adv().thresholds;
    const r = '#EF5350', y = '#FFC107', g = '#4CAF50';
    const a = this.clampPct(averagePct);
    const b = this.clampPct(greatPct);
    if (b <= a) return `linear-gradient(to right, ${r} 0 ${a}%, ${g} ${a}% 100%)`;
    return `linear-gradient(to right, ${r} 0 ${a}%, ${y} ${a}% ${b}%, ${g} ${b}% 100%)`;
  }
}
