import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';

export interface NumberTriple {
  base: number;
  candidate: number;
  compare: number;
}

export interface RsrcQtyCompareData {
  rsrcQtyActualToDate: NumberTriple;
  rsrcQtyBudgeted: NumberTriple;
  rsrcQtyRemaining: NumberTriple;
  rsrcQtyThisPeriod: NumberTriple;
}

type Row = {
  metricKey: keyof RsrcQtyCompareData;
  label: string;
  base: number;
  candidate: number;
  compare: number;
};

@Component({
  selector: 'sv-rsrc-qty-compare-table',
  standalone: true,
  imports: [CommonModule, MatTableModule, MatIconModule],
  styles: [`
    :host { display:block; }
    table { width: 100%; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .delta { display:flex; align-items:center; gap:6px; justify-content:flex-end; }
    .pos { color: #2e7d32; }   /* green 800 */
    .neg { color: #c62828; }   /* red 800 */
    .zero { color: rgba(0,0,0,0.54); }
    .label { white-space: nowrap; }
  `],
  template: `
    <table mat-table [dataSource]="rows">

      <ng-container matColumnDef="label">
        <th mat-header-cell *matHeaderCellDef> Показатель (Units) </th>
        <td mat-cell *matCellDef="let r">
          <span class="label">{{ r.label }}</span>
        </td>
      </ng-container>

      <ng-container matColumnDef="base">
        <th mat-header-cell *matHeaderCellDef> Base </th>
        <td mat-cell *matCellDef="let r" class="num">
          {{ r.base | number:'1.0-3' }}
        </td>
      </ng-container>

      <ng-container matColumnDef="candidate">
        <th mat-header-cell *matHeaderCellDef> Candidate </th>
        <td mat-cell *matCellDef="let r" class="num">
          {{ r.candidate | number:'1.0-3' }}
        </td>
      </ng-container>

      <ng-container matColumnDef="compare">
        <th mat-header-cell *matHeaderCellDef> Δ Compare </th>
        <td mat-cell *matCellDef="let r" class="num">
          <span class="delta" [ngClass]="deltaClass(r.compare)">
            <mat-icon *ngIf="r.compare > 0">trending_up</mat-icon>
            <mat-icon *ngIf="r.compare < 0">trending_down</mat-icon>
            <mat-icon *ngIf="r.compare === 0">drag_handle</mat-icon>
            <span>{{ r.compare | number:'1.0-3' }}</span>
          </span>
        </td>
      </ng-container>

      <tr mat-header-row *matHeaderRowDef="displayed"></tr>
      <tr mat-row *matRowDef="let row; columns: displayed;"></tr>
    </table>
  `,
})
export class RsrcQtyCompareTableComponent implements OnChanges {
  @Input() data!: RsrcQtyCompareData;

  displayed: Array<'label'|'base'|'candidate'|'compare'> = ['label', 'base', 'candidate', 'compare'];
  rows: Row[] = [];

  private readonly LABELS: Record<keyof RsrcQtyCompareData, string> = {
    rsrcQtyActualToDate: 'Факт по трудозатратам на дату (Actual Units)',
    rsrcQtyBudgeted: 'Плановые трудозатраты (Budgeted Units)',
    rsrcQtyRemaining: 'Оставшиеся трудозатраты (Remaining Units)',
    rsrcQtyThisPeriod: 'Трудозатраты за период (This Period)',
  };

  ngOnChanges(_: SimpleChanges): void {
    if (!this.data) {
      this.rows = [];
      return;
    }
    this.rows = (Object.keys(this.LABELS) as Array<keyof RsrcQtyCompareData>)
      .filter((k) => !!this.data[k])
      .map((k) => {
        const v = this.data[k]!;
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
