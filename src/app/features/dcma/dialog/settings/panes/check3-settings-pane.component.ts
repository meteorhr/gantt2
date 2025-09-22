import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDividerModule } from '@angular/material/divider';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { TranslocoModule } from '@jsverse/transloco';

import { DcmaSettingsService, DcmaCheck3Advanced } from '../../../services/adv/dcma-settings.service';

@Component({
  standalone: true,
  selector: 'app-dcma-check3-settings-pane',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, MatDividerModule, MatSlideToggleModule,
    MatFormFieldModule, MatInputModule, TranslocoModule
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
      <div class="row-text"><div class="row-title">{{ 'dcma.common.filters.types' | transloco }}:</div></div>
    </div>

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
    <p class="muted">{{ 'dcma.common.notes.dcmaFive' | transloco }}</p>

    <div class="row-line">
      <div class="row-text"><div class="row-title">{{ 'dcma.check3.tolerance.strictFive' | transloco }}</div></div>
      <mat-slide-toggle
        [checked]="adv().tolerance.strictFivePct"
        (change)="patchTol('strictFivePct', $event.checked)">
      </mat-slide-toggle>
    </div>

    @if (!adv().tolerance.strictFivePct) {
      <div class="row-line">
        <div class="row-text"><div class="row-title">{{ 'dcma.common.tolerance.percent' | transloco }}</div></div>
        <mat-form-field class="pct-field" appearance="outline">
          <input matInput type="number" min="0" max="100" step="0.1"
                 [value]="adv().tolerance.percent"
                 (input)="patchTolNum('percent', $any($event.target).value)">
          <span matTextSuffix>%</span>
        </mat-form-field>
      </div>

      <div class="row-line">
        <div class="row-text"><div class="row-title">{{ 'dcma.common.tolerance.count' | transloco }}</div></div>
        <mat-form-field class="pct-field" appearance="outline">
          <input matInput type="number" min="0" step="1"
                 [value]="adv().tolerance.count"
                 (input)="patchTolNum('count', $any($event.target).value)">
        </mat-form-field>
      </div>

      <div class="row-line">
        <div class="row-text"><div class="row-title">{{ 'dcma.common.tolerance.hours' | transloco }}</div></div>
        <mat-form-field class="pct-field" appearance="outline">
          <input matInput type="number" min="0" step="0.1"
                 [value]="adv().tolerance.totalLagHours"
                 (input)="patchTolNum('totalLagHours', $any($event.target).value)">
          <span matTextSuffix>h</span>
        </mat-form-field>
      </div>
    }

    <h4 class="section-title">{{ 'dcma.common.title.thresholds' | transloco }}</h4>
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

    <div class="threshold-bar" [style.background]="thresholdGradient()"></div>
  `
})
export class DcmaCheck3SettingsPaneComponent {
  private readonly svc = inject(DcmaSettingsService);
  readonly adv = computed<DcmaCheck3Advanced>(() => this.svc.adv3());

  patch(p: Partial<DcmaCheck3Advanced>) { this.svc.patchAdv3(p); }

  patchNum<K extends keyof DcmaCheck3Advanced>(key: K, v: string) {
    const n = Number(v); if (!Number.isFinite(n)) return;
    this.patch({ [key]: n } as any);
  }

  patchType(type: 'FS'|'SS'|'FF'|'SF', val: boolean) {
    const cur = this.adv().includeLinkTypes;
    this.patch({ includeLinkTypes: { ...cur, [type]: val } });
  }

  patchTol(field: 'strictFivePct', val: boolean) {
    const t = this.adv().tolerance;
    this.patch({ tolerance: { ...t, [field]: val } });
  }
  patchTolNum(field: 'percent'|'count'|'totalLagHours', v: string) {
    const n = Number(v); if (!Number.isFinite(n) || n < 0) return;
    const t = this.adv().tolerance;
    this.patch({ tolerance: { ...t, [field]: n } });
  }

  patchThreshold(key: 'greatPct'|'averagePct', v: string) {
    const n = Math.max(0, Math.min(100, Number(v)));
    if (!Number.isFinite(n)) return;
    const th = this.adv().thresholds;
    const next = { ...th, [key]: n };
    if (next.greatPct > next.averagePct) {
      if (key === 'greatPct') next.averagePct = next.greatPct;
      else next.greatPct = next.averagePct;
    }
    this.patch({ thresholds: next });
  }

  private clampPct(n: number): number { return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0; }
  thresholdGradient(): string {
    const a = this.adv();
    const gp = this.clampPct(a.thresholds.greatPct);
    const ap = this.clampPct(a.thresholds.averagePct);
    const g = '#4CAF50', y = '#FFC107', r = '#EF5350';
    if (ap <= gp) return `linear-gradient(to right, ${g} 0 ${gp}%, ${r} ${gp}% 100%)`;
    return `linear-gradient(to right, ${g} 0 ${gp}%, ${y} ${gp}% ${ap}%, ${r} ${ap}% 100%)`;
  }
}
