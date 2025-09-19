import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDividerModule } from '@angular/material/divider';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { TranslocoModule } from '@jsverse/transloco';

import { DcmaSettingsService } from '../../../services/dcma-settings.service';

export type DcmaCheck2Advanced = {
  strictZero: boolean;
  includeDetails: boolean;
  detailsLimit: number;
  hoursPerDay: number;
  calendarSource: 'successor' | 'predecessor' | 'fixed';
  fixedHoursPerDay: number;
  includeLinkTypes: { FS: boolean; SS: boolean; FF: boolean; SF: boolean };
  ignoreMilestoneRelations: boolean;
  ignoreLoERelations: boolean;
  ignoreWbsSummaryRelations: boolean;
  ignoreCompletedRelations: boolean;
  thresholds: { greatPct: number; averagePct: number };
  tolerance: { percent: number; count: number; totalLeadHours: number };
};

@Component({
  standalone: true,
  selector: 'app-dcma-check2-settings-pane',
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
      <div class="row-text"><div class="row-title">{{ 'dcma.common.general.strictZero' | transloco }}</div></div>
      <mat-slide-toggle
        [checked]="adv().strictZero"
        (change)="patch({ strictZero: $event.checked })"
        [attr.aria-label]="'dcma.common.general.strictZero' | transloco">
      </mat-slide-toggle>
    </div>

    <div class="row-line">
      <div class="row-text"><div class="row-title">{{ 'dcma.common.general.includeDetails' | transloco }}</div></div>
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
          <input matInput type="number" min="0" step="1"
                 [value]="adv().detailsLimit"
                 (input)="patchNum('detailsLimit', $any($event.target).value)">
        </mat-form-field>
      </div>
    }

    <h4 class="section-title">{{ 'dcma.common.title.calendar' | transloco }}</h4>

    <!-- HPD source: вертикальные радио, блоком «слева» -->
    <div class="row-block">
      <div class="row-title block-title">{{ 'dcma.common.calendar.source' | transloco }}:</div>
      <mat-radio-group
        class="radio-vert"
        [value]="adv().calendarSource"
        (change)="patch({ calendarSource: $any($event.value) })"
        [attr.aria-label]="'dcma.common.calendar.source' | transloco">
        <mat-radio-button value="successor">{{ 'dcma.common.calendar.successor' | transloco }}</mat-radio-button>
        <mat-radio-button value="predecessor">{{ 'dcma.common.calendar.predecessor' | transloco }}</mat-radio-button>
        <mat-radio-button value="fixed">{{ 'dcma.common.calendar.fixed' | transloco }}</mat-radio-button>
      </mat-radio-group>
    </div>

    @if (adv().calendarSource === 'fixed') {
      <div class="row-line">
        <div class="row-text"><div class="row-title">{{ 'dcma.common.calendar.fixedHpd' | transloco }}</div></div>
        <mat-form-field class="pct-field" appearance="outline">
          <input matInput type="number" min="1" step="1"
                 [value]="adv().fixedHoursPerDay"
                 (input)="patchNum('fixedHoursPerDay', $any($event.target).value)">
          <span matTextSuffix>h</span>
        </mat-form-field>
      </div>
    }

    <div class="row-line">
      <div class="row-text"><div class="row-title">{{ 'dcma.common.calendar.defaultHpd' | transloco }}</div></div>
      <mat-form-field class="pct-field" appearance="outline">
        <input matInput type="number" min="1" step="1"
               [value]="adv().hoursPerDay"
               (input)="patchNum('hoursPerDay', $any($event.target).value)">
        <span matTextSuffix>h</span>
      </mat-form-field>
    </div>

    <h4 class="section-title">{{ 'dcma.common.title.filters' | transloco }}</h4>

    <!-- Relationship types: 4 слайд-тоггла вертикально -->
    <div class="row-block">
      <div class="row-title block-title">{{ 'dcma.common.filters.types' | transloco }}:</div>


    <div class="row-line">
      <div class="row-text"><div class="row-title">FS</div></div>
      <mat-slide-toggle [checked]="adv().includeLinkTypes.FS" (change)="patchType('FS', $event.checked)"></mat-slide-toggle>
    </div>

    <div class="row-line">
      <div class="row-text"><div class="row-title">SS</div></div>
      <mat-slide-toggle [checked]="adv().includeLinkTypes.SS" (change)="patchType('SS', $event.checked)"></mat-slide-toggle>
    </div>

    
    <div class="row-line">
      <div class="row-text"><div class="row-title">FF</div></div>
      <mat-slide-toggle [checked]="adv().includeLinkTypes.FF" (change)="patchType('FF', $event.checked)"></mat-slide-toggle>
    </div>

    <div class="row-line">
      <div class="row-text"><div class="row-title">SF</div></div>
      <mat-slide-toggle [checked]="adv().includeLinkTypes.SF" (change)="patchType('SF', $event.checked)"></mat-slide-toggle>
    </div>
    </div>

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

    <h4 class="section-title">{{ 'dcma.common.title.tolerance' | transloco }}</h4>
    <div class="row-line">
      <div class="row-text"><div class="row-title">{{ 'dcma.common.tolerance.percent' | transloco }}</div></div>
      <mat-form-field class="pct-field" appearance="outline">
        <input matInput type="number" min="0" max="100" step="0.1"
               [value]="adv().tolerance.percent"
               (input)="patchTol('percent', $any($event.target).value)">
        <span matTextSuffix>%</span>
      </mat-form-field>
    </div>
    <div class="row-line">
      <div class="row-text"><div class="row-title">{{ 'dcma.common.tolerance.count' | transloco }}</div></div>
      <mat-form-field class="pct-field" appearance="outline">
        <input matInput type="number" min="0" step="1"
               [value]="adv().tolerance.count"
               (input)="patchTol('count', $any($event.target).value)">
      </mat-form-field>
    </div>
    <div class="row-line">
      <div class="row-text"><div class="row-title">{{ 'dcma.common.tolerance.hours' | transloco }}</div></div>
      <mat-form-field class="pct-field" appearance="outline">
        <input matInput type="number" min="0" step="0.1"
               [value]="adv().tolerance.totalLeadHours"
               (input)="patchTol('totalLeadHours', $any($event.target).value)">
        <span matTextSuffix>h</span>
      </mat-form-field>
    </div>

    <h4 class="section-title">{{ 'dcma.common.title.thresholds' | transloco }}</h4>
    <p class="muted" style="margin: -4px 0 6px">
      {{ 'dcma.common.note.dcmaZero' | transloco }}
    </p>

    <div class="row-line">
      <div class="row-text"><div class="row-title">{{ 'dcma.common.thresholds.great' | transloco }}</div></div>
      <mat-form-field class="pct-field" appearance="outline">
        <input matInput type="number" min="0" max="100" step="0.1"
               [value]="adv().thresholds.greatPct"
               (input)="patchThreshold('greatPct', $any($event.target).value)">
        <span matTextSuffix>%</span>
      </mat-form-field>
    </div>

    <div class="row-line">
      <div class="row-text"><div class="row-title">{{ 'dcma.common.thresholds.average' | transloco }}</div></div>
      <mat-form-field class="pct-field" appearance="outline">
        <input matInput type="number" min="0" max="100" step="0.1"
               [value]="adv().thresholds.averagePct"
               (input)="patchThreshold('averagePct', $any($event.target).value)">
        <span matTextSuffix>%</span>
      </mat-form-field>
    </div>

    <!-- Добавлено: визуальная полоса порогов -->
    <div class="threshold-bar" [style.background]="thresholdGradient()"></div>
  `
})
export class DcmaCheck2SettingsPaneComponent {
  private readonly svc = inject(DcmaSettingsService);
  readonly adv = computed<DcmaCheck2Advanced>(() => this.svc.adv2());

  patch(p: Partial<DcmaCheck2Advanced>) { this.svc.patchAdv2(p); }

  patchNum<K extends keyof DcmaCheck2Advanced>(key: K, v: string) {
    const n = Number(v); if (!Number.isFinite(n)) return;
    this.patch({ [key]: n } as any);
  }

  patchType(type: 'FS'|'SS'|'FF'|'SF', val: boolean) {
    const cur = this.adv().includeLinkTypes;
    this.patch({ includeLinkTypes: { ...cur, [type]: val } });
  }

  patchTol<K extends keyof DcmaCheck2Advanced['tolerance']>(key: K, v: string) {
    const n = Number(v); if (!Number.isFinite(n) || n < 0) return;
    const t = this.adv().tolerance;
    this.patch({ tolerance: { ...t, [key]: n } });
  }

  patchThreshold(key: 'greatPct'|'averagePct', v: string) {
    let n = Number(v);
    if (!Number.isFinite(n) || n < 0) n = 0;
    if (n > 100) n = 100;
    const th = this.adv().thresholds;
    const next = { ...th, [key]: n };
    // гарантия: great ≤ average
    if (next.greatPct > next.averagePct) {
      if (key === 'greatPct') next.averagePct = next.greatPct;
      else next.greatPct = next.averagePct;
    }
    this.patch({ thresholds: next });
  }

  private clampPct(x: number): number {
    return Number.isFinite(x) ? Math.max(0, Math.min(100, Math.round(x))) : 0;
  }

  /** Полоса: зелёный до great, жёлтый до average, далее красный */
  thresholdGradient(): string {
    const a = this.adv();
    const gp = this.clampPct(a.thresholds.greatPct);
    const ap = this.clampPct(a.thresholds.averagePct);
    const g = '#4CAF50', y = '#FFC107', r = '#EF5350';
    if (ap <= gp) {
      return `linear-gradient(to right, ${g} 0 ${gp}%, ${r} ${gp}% 100%)`;
    }
    return `linear-gradient(to right, ${g} 0 ${gp}%, ${y} ${gp}% ${ap}%, ${r} ${ap}% 100%)`;
  }
}
