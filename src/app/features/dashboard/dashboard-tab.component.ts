import {
  Component,
  OnInit,
  inject,
  computed,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Inject,
} from '@angular/core';
import { CommonModule, NgClass } from '@angular/common';
import { TranslocoModule } from '@jsverse/transloco';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';

import { BehaviorSubject } from 'rxjs';

import { AppStateService } from '../../state/app-state.service';
import { SpeedometerComponent } from '../../widget/gauge/gauge.component';

import {
  HistogramOptions,
  HistogramResult,
  HistogramService,
} from '../../p6/services/histogram.service'; // оставлен, если нужен дальше
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule }     from '@angular/material/select';
import { HistogramPivotService } from '../../p6/services/histogram-pivot.service';
import {
  MonthlyUnitsAggregatorService,
  MonthlyUnitsRow,
} from '../../p6/services/monthly-units-aggregator.service';
import { HistogramPivotChartComponent } from '../../widget/histogram/histogram-pivot-chart.component';
import {
  MatDatepickerModule,
  MatDatepickerInputEvent,
} from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

type MeasureKey = 'Budgeted' | 'Actual' | 'Remaining' | 'AtCompletionUnits';

/** Конфиг для спидометра (строгий тип) */
interface GaugeZone {
  from: number;
  to: number;
  color: string;
}
interface GaugeConfig {
  min: number;
  max: number;
  value: number;
  size: number;
  zones: GaugeZone[];
}

@Component({
  selector: 'sv-dashboard-tab',
  standalone: true,
  imports: [
    CommonModule,
    NgClass,
    TranslocoModule,
    MatCardModule,
    MatTableModule,
    MatIconModule,
    MatChipsModule,
    MatDividerModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,

    SpeedometerComponent,
    HistogramPivotChartComponent,
  ],
  styleUrls: ['./dashboard-tab.component.scss'],
  templateUrl: './dashboard-tab.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardTabComponent implements OnInit {
  // --- инъекции
  readonly wm = inject(AppStateService);
  private readonly dialog = inject(MatDialog);
  private readonly monthlyAgg = inject(MonthlyUnitsAggregatorService);
  private readonly cdr = inject(ChangeDetectorRef);

  // Если нужен напрямую сервис гистограммы/пивота — оставьте/используйте:
  private readonly hist = inject(HistogramService);
  private readonly histogramPivotService = inject(HistogramPivotService);

  // --- данные для графиков/таблиц
  /** Данные помесячного агрегата по ресурсам для <histogramPivotChart> */
  histogramUnitsResult: MonthlyUnitsRow[] = [];

  /** Конфиги спидометров */
  public readonly spi$ = new BehaviorSubject<GaugeConfig>(this.makeGauge(0));
  public readonly cpi$ = new BehaviorSubject<GaugeConfig>(this.makeGauge(0));

  /** Быстрый KPI: число уникальных ресурсов (без «—») */
  readonly nonEmptyRsrcCount = computed<number>(() => {
    const d: any = this.wm.dashboard();
    if (!d?.byRsrcId) return 0;
    return d.byRsrcId.filter((x: { value: string }) => x.value !== '—').length;
  });

  /** простые флаги состояния */
  loading = false;
  error: string | null = null;

  histogramCostResult: MonthlyUnitsRow[] = [];
selectedMeasureCost: MeasureKey = 'Budgeted';

  /** выбор метрики */
  selectedMeasure: MeasureKey = 'Budgeted';
  readonly measureOptions: { key: MeasureKey; label: string }[] = [
    { key: 'Budgeted',           label: 'Budgeted' },
    { key: 'Actual',             label: 'Actual' },
    { key: 'Remaining',          label: 'Remaining' },
    { key: 'AtCompletionUnits',  label: 'AtCompletionUnits' },
  ];

  // ---- диапазон дат
  startDate: Date | null = null;
  endDate: Date | null = null;

  async ngOnInit(): Promise<void> {
    this.loading = true;
    this.error = null;
    this.cdr.markForCheck();

    try {
      // 1) пересчёт дашборда (SPI/CPI и плановые даты)
      await this.wm.computeDashboard();
      const d: any = this.wm.dashboard();

      // безоп. парсинг дат (строка/Date/число) + обрубание до локальной полуночи
      const s = this.toDate(d?.planStart);
      const e = this.toDate(d?.planEnd);
      this.startDate = s ? this.floorToLocalDate(s) : null;
      this.endDate   = e ? this.floorToLocalDate(e) : null;

      // 2) первичная загрузка гистограммы
      await this.loadHistogram();

      // 3) спидометры
      this.spi$.next(this.makeGauge(Number(d?.spi?.SPI ?? 0)));
      this.cpi$.next(this.makeGauge(Number(d?.cpi?.CPI ?? 0)));
    } catch (e: unknown) {
      this.error = e instanceof Error ? e.message : 'Unknown error';
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  // ---- единая подгрузка данных под текущие фильтры
   async loadHistogram(): Promise<void> {
    this.loading = true;
    this.error = null;
    this.cdr.markForCheck();

    try {
      this.histogramUnitsResult = await this.monthlyAgg.buildMonthlyUnits({
        bucket: 'month',
        zeroFill: false,
        resourceOrder: 'name',
        desc: false,
        mode: 'units',
        rangeStart: this.startDate ? this.floorToLocalDate(this.startDate) : null,
        rangeEnd:   this.endDate   ? this.floorToLocalDate(this.endDate)   : null,
      });

      this.histogramCostResult = await this.monthlyAgg.buildMonthlyUnits({
        bucket: 'month',
        zeroFill: false,
        resourceOrder: 'name',
        desc: false,
        mode: 'cost',
        rangeStart: this.startDate ? this.floorToLocalDate(this.startDate) : null,
        rangeEnd:   this.endDate   ? this.floorToLocalDate(this.endDate)   : null,
      });
    } catch (e: unknown) {
      this.error = e instanceof Error ? e.message : 'Unknown error';
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  // ---- обработчики picker'а
  onStartChange(ev: MatDatepickerInputEvent<Date>) {
    this.startDate = ev.value ? this.floorToLocalDate(ev.value) : null;
    void this.loadHistogram();
  }
  onEndChange(ev: MatDatepickerInputEvent<Date>) {
    this.endDate = ev.value ? this.floorToLocalDate(ev.value) : null;
    void this.loadHistogram();
  }

  // ---- helpers даты/числа
  floorToLocalDate(d: Date): Date {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }
  private toDate(v: unknown): Date | null {
    if (!v) return null;
    const d = v instanceof Date ? v : new Date(v as any);
    return Number.isFinite(d.getTime()) ? d : null;
  }

  // ==== Диалоги (оставлены как есть) ====
  openSpiDialog(d: unknown): void {
    this.dialog.open(SpiDialogCmp, {
      width: '560px',
      data: d,
    });
  }
  
  openCpiDialog(d: unknown): void {
    this.dialog.open(CpiDialogCmp, {
      width: '560px',
      data: d,
    });
  }

  /** Самый частый value:count из списка */
  top(list: Array<{ value: string; count: number }> = []): string {
    if (!list.length) return '—';
    const m = list.reduce((acc, x) => (x.count > acc.count ? x : acc), list[0]);
    return `${m.value}: ${m.count}`;
  }

  /** Обёртка для совместимости (если где-то вызывается напрямую) */
  private async buildHistogram(
    opts: HistogramOptions,
  ): Promise<HistogramResult | null> {
    return this.hist.buildHistogram(opts);
  }

  // ====== helpers ======
  /** Единый генератор конфига для спидометра */
  private makeGauge(value: number): GaugeConfig {
    const v = Number.isFinite(value) ? value : 0;
    return {
      min: 0,
      max: 1,
      value: v,
      size: 200,
      zones: GAUGE_ZONES,
    };
  }
}

// Вынесенные константы (не создаются заново при каждом next)
const GAUGE_ZONES: GaugeZone[] = [
  { from: 0.0, to: 0.5, color: '#d7191c' },
  { from: 0.5, to: 0.8, color: '#fdae61' },
  { from: 0.8, to: 1.0, color: '#1a9641' },
];


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
