import { Component, OnInit, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoModule } from '@jsverse/transloco';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { AppStateService } from '../../state/app-state.service';
import { SpeedometerComponent } from '../../widget/gauge/gauge.component';
import { BehaviorSubject } from 'rxjs';
import { Inject } from '@angular/core';

@Component({
  selector: 'sv-dashboard-tab',
  standalone: true,
  imports: [
    CommonModule,
    TranslocoModule,
    MatCardModule,
    MatTableModule,
    MatIconModule,
    MatChipsModule,
    MatDividerModule,
    MatProgressBarModule,
    MatButtonModule,
    MatDialogModule,
    SpeedometerComponent,
  ],
  styleUrls: ['./dashboard-tab.component.scss'],
  templateUrl: './dashboard-tab.component.html',
})
export class DashboardTabComponent implements OnInit {
  readonly wm = inject(AppStateService);
  readonly dialog = inject(MatDialog);

  public spi$ = new BehaviorSubject<any>({});
  public cpi$ = new BehaviorSubject<any>({});

  // Число уникальных rsrc_id (без пустого значения '—'), вынесено из шаблона
  readonly nonEmptyRsrcCount = computed(() => {
    const d = this.wm.dashboard();
    return d ? d.byRsrcId.filter(x => x.value !== '—').length : 0;
  });

  async ngOnInit(): Promise<void> {
    // пересчёт КАЖДЫЙ раз при заходе на вкладку
    await this.wm.computeDashboard();
    const d = this.wm.dashboard();

    this.spi$.next({
      min: 0,
      max: 1,
      value: d?.spi?.SPI ?? 0,
      size: 200,
      zones: [
        { from: 0.0, to: 0.5, color: '#d7191c' },
        { from: 0.5, to: 0.8, color: '#fdae61' },
        { from: 0.8, to: 1.0, color: '#1a9641' }
      ]
    });

    this.cpi$.next({
      min: 0,
      max: 1,
      value: d?.cpi?.CPI ?? 0,
      size: 200,
      zones: [
        { from: 0.0, to: 0.5, color: '#d7191c' },
        { from: 0.5, to: 0.8, color: '#fdae61' },
        { from: 0.8, to: 1.0, color: '#1a9641' }
      ]
    });
  }

  openSpiDialog(d: any): void {
    this.dialog.open(SpiDialogCmp, {
      width: '560px',
      data: d,
    });
  }

  openCpiDialog(d: any): void {
    this.dialog.open(CpiDialogCmp, {
      width: '560px',
      data: d,
    });
  }

  top(list: { value: string; count: number }[]): string {
    if (!list.length) return '—';
    const m = list.reduce((acc, x) => (x.count > acc.count ? x : acc), list[0]);
    return `${m.value}: ${m.count}`;
  }
}

/* ----------------- SPI Dialog ----------------- */
@Component({
  selector: 'sv-spi-dialog',
  standalone: true,
  imports: [CommonModule, TranslocoModule, MatTableModule, MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>{{ 'dashboard.spi.title' | transloco }}</h2>
    <div mat-dialog-content>
      <table mat-table [dataSource]="[
        { k: ('dashboard.spi.rows.ev'  | transloco), v: (data?.spi?.EV  == null ? '—' : (data.spi.EV  | number:'1.0-2')) },
        { k: ('dashboard.spi.rows.pv'  | transloco), v: (data?.spi?.PV  == null ? '—' : (data.spi.PV  | number:'1.0-2')) },
        { k: ('dashboard.spi.rows.spi' | transloco), v: (data?.spi?.SPI == null ? '—' : (data.spi.SPI | number:'1.2-2')) }
      ]">
        <ng-container matColumnDef="k">
          <th mat-header-cell *matHeaderCellDef>{{ 'dashboard.spi.table.metric' | transloco }}</th>
          <td mat-cell *matCellDef="let r">{{ r.k }}</td>
        </ng-container>
        <ng-container matColumnDef="v">
          <th mat-header-cell *matHeaderCellDef>{{ 'dashboard.spi.table.amount' | transloco }}</th>
          <td mat-cell *matCellDef="let r">{{ r.v }}</td>
        </ng-container>
        <tr mat-header-row *matHeaderRowDef="['k','v']"></tr>
        <tr mat-row *matRowDef="let row; columns: ['k','v'];"></tr>
      </table>

      <div class="mat-body" style="opacity:.7;margin-top:8px">
        {{ 'dashboard.spi.method_label' | transloco : { method: (data?.spi?.method || '—') } }}
      </div>
    </div>
    <div mat-dialog-actions align="end">
      <button mat-stroked-button mat-dialog-close>OK</button>
    </div>
  `,
})
export class SpiDialogCmp {
  constructor(
    public dialogRef: MatDialogRef<SpiDialogCmp>,
    @Inject(MAT_DIALOG_DATA) public data: any,
  ) {}
}

/* ----------------- CPI Dialog ----------------- */
@Component({
  selector: 'sv-cpi-dialog',
  standalone: true,
  imports: [CommonModule, TranslocoModule, MatTableModule, MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>{{ 'dashboard.cpi.title' | transloco }}</h2>
    <div mat-dialog-content>
      <table mat-table [dataSource]="[
        { k: ('dashboard.cpi.rows.ev'  | transloco), v: (data?.cpi?.EV  == null ? '—' : (data.cpi.EV  | number:'1.0-2')) },
        { k: ('dashboard.cpi.rows.ac'  | transloco), v: (data?.cpi?.AC  == null ? '—' : (data.cpi.AC  | number:'1.0-2')) },
        { k: ('dashboard.cpi.rows.cpi' | transloco), v: (data?.cpi?.CPI == null ? '—' : (data.cpi.CPI | number:'1.2-2')) }
      ]">
        <ng-container matColumnDef="k">
          <th mat-header-cell *matHeaderCellDef>{{ 'dashboard.cpi.table.metric' | transloco }}</th>
          <td mat-cell *matCellDef="let r">{{ r.k }}</td>
        </ng-container>
        <ng-container matColumnDef="v">
          <th mat-header-cell *matHeaderCellDef>{{ 'dashboard.cpi.table.amount' | transloco }}</th>
          <td mat-cell *matCellDef="let r">{{ r.v }}</td>
        </ng-container>
        <tr mat-header-row *matHeaderRowDef="['k','v']"></tr>
        <tr mat-row *matRowDef="let row; columns: ['k','v'];"></tr>
      </table>

      <div class="mat-body" style="opacity:.7;margin-top:8px">
        {{ 'dashboard.cpi.method_label' | transloco : { method: (data?.cpi?.method || '—') } }}
      </div>
    </div>
    <div mat-dialog-actions align="end">
      <button mat-stroked-button mat-dialog-close>OK</button>
    </div>
  `,
})
export class CpiDialogCmp {
  constructor(
    public dialogRef: MatDialogRef<CpiDialogCmp>,
    @Inject(MAT_DIALOG_DATA) public data: any,
  ) {}
}