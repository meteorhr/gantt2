// src/app/shared/date/date-compare-table.component.ts
import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoModule } from '@jsverse/transloco';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';

export interface DateCompareRow {
  key: string;
  base: string | null;        // 'YYYY-MM-DD' (UTC) или null
  candidate: string | null;   // 'YYYY-MM-DD' (UTC) или null
  compare: number | null;     // дни: candidate - base
  equal: boolean | null;      // true если 0
  baseMs: number | null;      // UTC-полночь в мс
  candidateMs: number | null; // UTC-полночь в мс
}

type RowVM = {
  key: string;
  label: string;
  base: string | null;
  candidate: string | null;
  compare: number | null;
};

@Component({
  selector: 'sv-date-compare-table',
  standalone: true,
  imports: [CommonModule, TranslocoModule, MatTableModule, MatIconModule, MatCardModule],
  styles: [`
    :host { display:block; }
    table { width: 100%; }
    .num { font-variant-numeric: tabular-nums; }
    .delta { display:flex; align-items:left; gap:6px; justify-content:flex-end; }
    .pos { color: #2e7d32; }     /* green 800 */
    .neg { color: #c62828; }     /* red 800 */
    .zero { color: rgba(0,0,0,0.54); }
    .label { white-space: nowrap; }
  `],
  template: `

    <table mat-table [dataSource]="rows" class="mat-elevation-z1">

      <!-- Тип даты -->
      <ng-container matColumnDef="label">
        <th mat-header-cell *matHeaderCellDef>
          {{ 'dates.columns.type' | transloco }}
        </th>
        <td mat-cell *matCellDef="let r">
          <span class="label">{{ "dates.labels." + r.label | transloco }}</span>
        </td>
      </ng-container>

      <!-- База -->
      <ng-container matColumnDef="base">
        <th mat-header-cell *matHeaderCellDef>
          {{ 'dates.columns.base' | transloco }}
        </th>
        <td mat-cell *matCellDef="let r" class="num">
          {{ r.base || '—' }}
        </td>
      </ng-container>

      <!-- Кандидат -->
      <ng-container matColumnDef="candidate">
        <th mat-header-cell *matHeaderCellDef>
          {{ 'dates.columns.candidate' | transloco }}
        </th>
        <td mat-cell *matCellDef="let r" class="num">
          {{ r.candidate || '—' }}
        </td>
      </ng-container>

      <!-- Отклонение (дни) -->
      <ng-container matColumnDef="compare">
        <th mat-header-cell *matHeaderCellDef>
          {{ 'dates.columns.delta' | transloco }}
        </th>
        <td mat-cell *matCellDef="let r" class="num">
          <span class="delta" [ngClass]="deltaClass(r.compare)">
            @if (r.compare !== null) {
              @if (r.compare > 0) { <mat-icon>trending_up</mat-icon> }
              @if (r.compare < 0) { <mat-icon>trending_down</mat-icon> }
              @if (r.compare === 0) { <mat-icon>drag_handle</mat-icon> }
              <span>{{ r.compare }} {{ 'dates.days' | transloco }}</span>
            } @else {
              <mat-icon class="zero">info</mat-icon>
              <span class="zero">—</span>
            }
          </span>
        </td>
      </ng-container>

      <tr mat-header-row *matHeaderRowDef="displayed"></tr>
      <tr mat-row *matRowDef="let row; columns: displayed;"></tr>
    </table>

  `,
})
export class DateCompareTableComponent implements OnChanges {

  @Input({ required: true }) dates: DateCompareRow[] = [];

  displayed: Array<keyof RowVM> = ['label', 'base', 'candidate', 'compare'];
  rows: RowVM[] = [];

  ngOnChanges(_: SimpleChanges): void {
    const order = ['planStart', 'dataDate', 'planEnd', 'mustFinish'];

    const byKey = new Map(this.dates.map(r => [r.key, r]));
    const keys = order.filter(k => byKey.has(k)).concat(
      this.dates.map(r => r.key).filter(k => !order.includes(k))
    );

    this.rows = keys.map(key => {
      const m = byKey.get(key)!;
      return {
        key,
        label: this.labelFor(key),
        base: m.base,
        candidate: m.candidate,
        compare: m.compare
      };
    });
  }

  private labelFor(key: string): string {
    // Метка берётся из Transloco: 'dates.labels.<key>'
    // В шаблоне можно было бы делать через pipe, но для единообразия храним строку здесь
    // Если хотите, замените на прямую интерполяцию в шаблоне:
    //   {{ ('dates.labels.' + r.key) | transloco }}
    // Тогда верните здесь просто key.
    return key; // фактическую локализацию делает шаблон через Transloco (см. выше)
  }

  deltaClass(val: number | null): string {
    if (val === null) return 'zero';
    if (val > 0) return 'pos';
    if (val < 0) return 'neg';
    return 'zero';
  }
}
