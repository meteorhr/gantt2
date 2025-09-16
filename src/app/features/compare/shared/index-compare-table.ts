import { Component, computed, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';

export interface NumberTriple {
  base: number;
  candidate: number;
  compare: number;
}
export interface StringEqualPair {
  base: string;
  candidate: string;
  equal: boolean;
}

type MetricValue = NumberTriple | StringEqualPair;

type Row = {
  key: string;
  label: string;
  base: number | string;
  candidate: number | string;
  compare: number | null;    // null → строковая метрика (equal)
  equal?: boolean;           // для строковых метрик
};

@Component({
  selector: 'sv-index-compare-table',
  standalone: true,
  imports: [CommonModule, MatTableModule, MatIconModule],
  styles: [`
    :host { display:block; }
    .title { font-weight:600; margin-bottom:8px; }
    table { width:100%; }
    .num { text-align:right; font-variant-numeric: tabular-nums; }
    .delta { display:flex; align-items:center; gap:6px; justify-content:flex-end; }
    .pos { color:#2e7d32; }   /* green-800 */
    .neg { color:#c62828; }   /* red-800 */
    .zero { color:rgba(0,0,0,.54); }
    .label { white-space:nowrap; }
  `],
  template: `
    @if (title()) {
      <div class="title">{{ title() }}</div>
    }

    <table mat-table [dataSource]="rows()">

      <ng-container matColumnDef="label">
        <th mat-header-cell *matHeaderCellDef>Показатель</th>
        <td mat-cell *matCellDef="let r"><span class="label">{{ r.label }}</span></td>
      </ng-container>

      <ng-container matColumnDef="base">
        <th mat-header-cell *matHeaderCellDef>Base</th>
        <td mat-cell *matCellDef="let r" [ngClass]="{'num': isNumber(r.base)}">
          @if (isNumber(r.base)) { {{ r.base | number: numberFormat() }} } @else { {{ r.base }} }
        </td>
      </ng-container>

      <ng-container matColumnDef="candidate">
        <th mat-header-cell *matHeaderCellDef>Candidate</th>
        <td mat-cell *matCellDef="let r" [ngClass]="{'num': isNumber(r.candidate)}">
          @if (isNumber(r.candidate)) { {{ r.candidate | number: numberFormat() }} } @else { {{ r.candidate }} }
        </td>
      </ng-container>

      <ng-container matColumnDef="delta">
        <th mat-header-cell *matHeaderCellDef>Δ</th>
        <td mat-cell *matCellDef="let r" class="num">
          @if (r.compare !== null) {
            <span class="delta" [ngClass]="deltaClass(r.compare!)">
              <mat-icon *ngIf="r.compare! > 0">trending_up</mat-icon>
              <mat-icon *ngIf="r.compare! < 0">trending_down</mat-icon>
              <mat-icon *ngIf="r.compare! === 0">drag_handle</mat-icon>
              <span>{{ r.compare! | number: numberFormat() }}</span>
            </span>
          } @else {
            @if (r.equal === true) {
              <span class="delta zero"><mat-icon>check_circle</mat-icon><span>—</span></span>
            } @else {
              <span class="delta neg"><mat-icon>cancel</mat-icon><span>≠</span></span>
            }
          }
        </td>
      </ng-container>

      <tr mat-header-row *matHeaderRowDef="displayed"></tr>
      <tr mat-row        *matRowDef="let row; columns: displayed;"></tr>
    </table>
  `,
})
export class IndexCompareTableComponent {
  title = input<string>('');
  data  = input.required<Record<string, MetricValue>>();
  /** map ключ→подпись; если не задано — ключ и будет подписью */
  labels = input<Record<string, string>>({});
  /** порядок ключей; если не задано — Object.keys(data) */
  order  = input<string[] | undefined>(undefined);
  /** формат чисел для пайпа number */
  numberFormat = input<string>('1.0-3');

  displayed: string[] = ['label','base','candidate','delta'];

  private isNumberTriple(v: MetricValue): v is NumberTriple {
    return typeof (v as any)?.base === 'number'
        && typeof (v as any)?.candidate === 'number'
        && typeof (v as any)?.compare === 'number';
  }
  private isStringPair(v: MetricValue): v is StringEqualPair {
    return typeof (v as any)?.base === 'string'
        && typeof (v as any)?.candidate === 'string'
        && typeof (v as any)?.equal === 'boolean';
  }

  rows = computed<Row[]>(() => {
    const d = this.data();
    const order = this.order() ?? Object.keys(d);
    const labelMap = this.labels();
    const out: Row[] = [];

    for (const key of order) {
      const v = d[key];
      if (v == null) continue;

      if (this.isNumberTriple(v)) {
        out.push({
          key,
          label: labelMap[key] ?? key,
          base: v.base,
          candidate: v.candidate,
          compare: v.compare,
        });
        continue;
      }
      if (this.isStringPair(v)) {
        out.push({
          key,
          label: labelMap[key] ?? key,
          base: v.base,
          candidate: v.candidate,
          compare: null,
          equal: v.equal,
        });
        continue;
      }
      // защитный случай: покажем как есть
      out.push({
        key,
        label: labelMap[key] ?? key,
        base: (v as any)?.base ?? '',
        candidate: (v as any)?.candidate ?? '',
        compare: typeof (v as any)?.compare === 'number' ? (v as any).compare : null,
        equal: typeof (v as any)?.equal === 'boolean' ? (v as any).equal : undefined,
      });
    }
    return out;
  });

  isNumber(v: unknown): v is number { return typeof v === 'number' && Number.isFinite(v); }
  deltaClass(val: number): string { return val > 0 ? 'pos' : val < 0 ? 'neg' : 'zero'; }
}
