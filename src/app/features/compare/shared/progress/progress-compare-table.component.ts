// src/app/shared/progress/progress-compare-table.component.ts
import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoModule } from '@jsverse/transloco';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';

export interface NumberTriple {
  base: number;
  candidate: number;
  compare: number;
}

export interface ProgressCompareData {
  progressSchedulePct: NumberTriple; // график
  progressPhysicalPct: NumberTriple; // физика
  progressCostPct: NumberTriple;     // стоимость
}

type Row = {
  key: keyof ProgressCompareData;
  labelKey: string;       // transloco ключ
  base: number;           // 0..100
  candidate: number;      // 0..100
  compare: number;        // может быть <, = или > 0
};

@Component({
  selector: 'sv-progress-compare-table',
  standalone: true,
  imports: [CommonModule, TranslocoModule, MatTableModule, MatIconModule],
  styles: [`
    :host { display:block; }
    table { width: 100%; }
    .label { white-space: nowrap; }
    .num { text-align: left; font-variant-numeric: tabular-nums; }



    .delta {
      display:flex; align-items:center; gap:6px; justify-content:flex-end;
      font-variant-numeric: tabular-nums;
    }
    .pos { color:#2e7d32; }  /* up */
    .neg { color:#c62828; }  /* down */
    .zero{ color:rgba(0,0,0,.54); }

    th.mat-mdc-header-cell, td.mat-mdc-cell { padding: 10px 12px; }
  `],
  template: `
    <table mat-table [dataSource]="rows" class="mat-elevation-z1">

      <!-- Показатель -->
      <ng-container matColumnDef="label">
        <th mat-header-cell *matHeaderCellDef>
          {{ 'progress.columns.metric' | transloco }}
        </th>
        <td mat-cell *matCellDef="let r">
          <span class="label">{{ r.labelKey | transloco }}</span>
        </td>
      </ng-container>

      <!-- База % -->
      <ng-container matColumnDef="base">
        <th mat-header-cell *matHeaderCellDef>
          {{ 'progress.columns.base_pct' | transloco }}
        </th>
        <td mat-cell *matCellDef="let r" class="num">
          {{ r.base | number:'1.0-2' }}%
        </td>
      </ng-container>

      <!-- Кандидат % -->
      <ng-container matColumnDef="candidate">
        <th mat-header-cell *matHeaderCellDef>
          {{ 'progress.columns.candidate_pct' | transloco }}
        </th>
        <td mat-cell *matCellDef="let r" class="num">
          {{ r.candidate | number:'1.0-2' }}%
        </td>
      </ng-container>

      <!-- Δ Отклонение % -->
      <ng-container matColumnDef="compare">
        <th mat-header-cell *matHeaderCellDef>
          {{ 'progress.columns.delta_pct' | transloco }}
        </th>
        <td mat-cell *matCellDef="let r" class="num">
          <span class="delta" [ngClass]="deltaClass(r.compare)">
            @if (r.compare > 0) { <mat-icon>trending_up</mat-icon> }
            @if (r.compare < 0) { <mat-icon>trending_down</mat-icon> }
            @if (r.compare === 0) { <mat-icon>drag_handle</mat-icon> }
            <span>{{ r.compare | number:'1.0-2' }}%</span>
          </span>
        </td>
      </ng-container>

      <tr mat-header-row *matHeaderRowDef="displayed"></tr>
      <tr mat-row *matRowDef="let row; columns: displayed;"></tr>
    </table>
  `
})
export class ProgressCompareTableComponent implements OnChanges {
  @Input({ required: true }) data!: ProgressCompareData;

  displayed: Array<keyof Row | 'label'> = ['label', 'base', 'candidate', 'compare'];
  rows: Row[] = [];

  private clamp(x: unknown): number {
    const n = Number(x);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, n));
  }

  ngOnChanges(_: SimpleChanges): void {
    if (!this.data) { this.rows = []; return; }

    // Порядок строк: График → Физика → Стоимость
    const defs: Array<[keyof ProgressCompareData, string]> = [
      ['progressSchedulePct', 'dashboard.schedule'],
      ['progressPhysicalPct', 'dashboard.physical'],
      ['progressCostPct',     'dashboard.cost']
    ];

    this.rows = defs
      .filter(([k]) => !!this.data[k])
      .map(([k, labelKey]) => {
        const v = this.data[k]!;
        return {
          key: k,
          labelKey,
          base: this.clamp(v.base),
          candidate: this.clamp(v.candidate),
          compare: Number(v.compare ?? 0)
        };
      });
  }

  deltaClass(val: number): string {
    if (val > 0) return 'pos';
    if (val < 0) return 'neg';
    return 'zero';
  }
}
