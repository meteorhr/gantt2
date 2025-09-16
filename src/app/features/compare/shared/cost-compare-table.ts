import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';

export interface NumberTriple {
  base: number;
  candidate: number;
  compare: number;
}

export interface CostCompareData {
  costActualToDate: NumberTriple;
  costBudgeted: NumberTriple;
  costRemaining: NumberTriple;
  costThisPeriod: NumberTriple;
}

type Row = {
  metricKey: keyof CostCompareData;
  label: string;
  base: number;
  candidate: number;
  compare: number;
};

@Component({
  selector: 'sv-cost-compare-table',
  standalone: true,
  imports: [CommonModule, MatTableModule, MatIconModule],
  styles: [`
    :host { display:block; }
    table { width: 100%; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .delta { display:flex; align-items:center; gap:6px; justify-content:flex-end; }
    .pos { color: #2e7d32; }     /* green 800 */
    .neg { color: #c62828; }     /* red 800 */
    .zero { color: rgba(0,0,0,0.54); }
    .label { white-space: nowrap; }
  `],
  template: `
    <table mat-table [dataSource]="rows">

      <!-- Metric column -->
      <ng-container matColumnDef="label">
        <th mat-header-cell *matHeaderCellDef> Показатель </th>
        <td mat-cell *matCellDef="let r">
          <span class="label">{{ r.label }}</span>
        </td>
      </ng-container>

      <!-- Base column -->
      <ng-container matColumnDef="base">
        <th mat-header-cell *matHeaderCellDef> Base </th>
        <td mat-cell *matCellDef="let r" class="num">
          {{ r.base | number:'1.0-3' }}
        </td>
      </ng-container>

      <!-- Candidate column -->
      <ng-container matColumnDef="candidate">
        <th mat-header-cell *matHeaderCellDef> Candidate </th>
        <td mat-cell *matCellDef="let r" class="num">
          {{ r.candidate | number:'1.0-3' }}
        </td>
      </ng-container>

      <!-- Compare column -->
      <ng-container matColumnDef="compare">
        <th mat-header-cell *matHeaderCellDef> Δ Compare </th>
        <td mat-cell *matCellDef="let r" class="num">
          <span class="delta" [ngClass]="deltaClass(r.compare)">
            @if(r.compare > 0) {
                <mat-icon>trending_up</mat-icon>
            }
            @if(r.compare < 0) {
                <mat-icon>trending_down</mat-icon>
            }
            @if(r.compare === 0) {
                <mat-icon>drag_handle</mat-icon>
            }           
            <span>{{ r.compare | number:'1.0-3' }}</span>
          </span>
        </td>
      </ng-container>

      <tr mat-header-row *matHeaderRowDef="displayed"></tr>
      <tr mat-row *matRowDef="let row; columns: displayed;"></tr>
    </table>
  `,
})
export class CostCompareTableComponent implements OnChanges {
  @Input() data!: CostCompareData;

  displayed: Array<keyof Row> = ['label', 'base', 'candidate', 'compare'];
  rows: Row[] = [];

  private readonly LABELS: Record<keyof CostCompareData, string> = {
    costActualToDate: 'Факт на дату (AC)',
    costBudgeted: 'Бюджет (BAC)',
    costRemaining: 'Оставшиеся затраты',
    costThisPeriod: 'Затраты за период',
  };

  ngOnChanges(_: SimpleChanges): void {
    if (!this.data) {
      this.rows = [];
      return;
    }
    this.rows = (Object.keys(this.LABELS) as Array<keyof CostCompareData>)
      .filter((k) => !!this.data[k])
      .map((k) => {
        const v = this.data[k];
        return {
          metricKey: k,
          label: this.LABELS[k],
          base: Number(v.base ?? 0),
          candidate: Number(v.candidate ?? 0),
          compare: Number(v.compare ?? 0),
        };
      });
  }

  deltaClass(val: number): string {
    if (val > 0) return 'pos';
    if (val < 0) return 'neg';
    return 'zero';
    }
}
