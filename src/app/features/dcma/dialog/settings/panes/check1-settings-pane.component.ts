import { Component, inject, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDividerModule } from '@angular/material/divider';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { TranslocoModule } from '@jsverse/transloco';

import { DcmaSettingsService } from '../../../services/dcma-settings.service';
import type { DcmaCheck1AdvancedPatch } from '../../../services/dcma-settings.service';

@Component({
  standalone: true,
  selector: 'app-dcma-check1-settings-pane',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatDividerModule,
    MatSlideToggleModule,
    MatFormFieldModule,
    MatInputModule,
    TranslocoModule
  ],
  template: `
    <mat-divider></mat-divider>

    <h4 class="section-title">{{ 'dcma.check1.title.visibility' | transloco }}</h4>
    <div class="row-line">
      <div class="row-text">
        <div class="row-title">{{ 'dcma.check1.visibility.showOnMain' | transloco }}</div>
      </div>
      <mat-slide-toggle
        [checked]="adv1().showOnMain"
        (change)="patchAdv1({ showOnMain: $event.checked })"
        [attr.aria-label]="'dcma.check1.visibility.showOnMain' | transloco">
      </mat-slide-toggle>
    </div>

    <h4 class="section-title">{{ 'dcma.check1.title.filters' | transloco }}</h4>

    <div class="row-line">
      <div class="row-text"><div class="row-title">{{ 'dcma.check1.filters.taskResDep' | transloco }}</div></div>
      <mat-slide-toggle
        [checked]="adv1().includeTaskResDep"
        (change)="patchAdv1({ includeTaskResDep: $event.checked })"
        [attr.aria-label]="'dcma.check1.filters.taskResDep' | transloco">
      </mat-slide-toggle>
    </div>

    <div class="row-line">
      <div class="row-text"><div class="row-title">{{ 'dcma.check1.filters.milestones' | transloco }}</div></div>
      <mat-slide-toggle
        [checked]="adv1().includeMilestones"
        (change)="patchAdv1({ includeMilestones: $event.checked })"
        [attr.aria-label]="'dcma.check1.filters.milestones' | transloco">
      </mat-slide-toggle>
    </div>

    <div class="row-line">
      <div class="row-text"><div class="row-title">{{ 'dcma.check1.filters.loe' | transloco }}</div></div>
      <mat-slide-toggle
        [checked]="adv1().includeLoE"
        (change)="patchAdv1({ includeLoE: $event.checked })"
        [attr.aria-label]="'dcma.check1.filters.loe' | transloco">
      </mat-slide-toggle>
    </div>

    <div class="row-line">
      <div class="row-text"><div class="row-title">{{ 'dcma.check1.filters.wbsSummary' | transloco }}</div></div>
      <mat-slide-toggle
        [checked]="adv1().includeWbsSummary"
        (change)="patchAdv1({ includeWbsSummary: $event.checked })"
        [attr.aria-label]="'dcma.check1.filters.wbsSummary' | transloco">
      </mat-slide-toggle>
    </div>

    <div class="row-line">
      <div class="row-text"><div class="row-title">{{ 'dcma.check1.filters.completed' | transloco }}</div></div>
      <mat-slide-toggle
        [checked]="adv1().includeCompleted"
        (change)="patchAdv1({ includeCompleted: $event.checked })"
        [attr.aria-label]="'dcma.check1.filters.completed' | transloco">
      </mat-slide-toggle>
    </div>

    <div class="row-line">
      <div class="row-text"><div class="row-title">{{ 'dcma.check1.filters.obsolete' | transloco }}</div></div>
      <mat-slide-toggle
        [checked]="adv1().includeObsolete"
        (change)="patchAdv1({ includeObsolete: $event.checked })"
        [disabled]="true"
        [attr.aria-label]="'dcma.check1.filters.obsolete' | transloco">
      </mat-slide-toggle>
    </div>

    <h4 class="section-title">{{ 'dcma.check1.title.thresholds' | transloco }}</h4>

    <div class="row-line">
      <div class="row-text"><div class="row-title">{{ 'dcma.check1.thresholds.great' | transloco }}</div></div>
      <mat-form-field class="pct-field" appearance="outline">
        <input matInput type="number" min="0" max="100" step="1"
               [value]="adv1().thresholds.greatPct"
               (input)="onGreatPct($any($event.target).value)">
        <span matTextSuffix>%</span>
      </mat-form-field>
    </div>

    <div class="row-line">
      <div class="row-text"><div class="row-title">{{ 'dcma.check1.thresholds.average' | transloco }}</div></div>
      <mat-form-field class="pct-field" appearance="outline">
        <input matInput type="number" min="0" max="100" step="1"
               [value]="adv1().thresholds.averagePct"
               (input)="onAvgPct($any($event.target).value)">
        <span matTextSuffix>%</span>
      </mat-form-field>
    </div>

    <div class="threshold-bar" [style.background]="thresholdGradient()"></div>
  `,
  styleUrls: ['./settings-pane.component.scss']
})
export class DcmaCheck1SettingsPaneComponent {
  private readonly svc = inject(DcmaSettingsService);
  readonly adv1 = computed(() => this.svc.adv1());

  patchAdv1(patch: DcmaCheck1AdvancedPatch): void { this.svc.patchAdv1(patch); }

  private clampPct(n: number): number {
    const x = Number(n);
    return Number.isFinite(x) ? Math.max(0, Math.min(100, Math.round(x))) : 0;
  }

  onGreatPct(v: string): void {
    const n = this.clampPct(Number(v));
    this.patchAdv1({ thresholds: { greatPct: n } });
  }

  onAvgPct(v: string): void {
    const n = this.clampPct(Number(v));
    this.patchAdv1({ thresholds: { averagePct: n } });
  }

  thresholdGradient(): string {
    const a = this.adv1();
    const gp = this.clampPct(a.thresholds.greatPct);
    const ap = this.clampPct(a.thresholds.averagePct);
    const g = '#4CAF50', y = '#FFC107', r = '#EF5350';
    if (ap <= gp) return `linear-gradient(to right, ${g} 0 ${gp}%, ${r} ${gp}% 100%)`;
    return `linear-gradient(to right, ${g} 0 ${gp}%, ${y} ${gp}% ${ap}%, ${r} ${ap}% 100%)`;
  }
}
