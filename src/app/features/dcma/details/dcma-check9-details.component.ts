import { Component, Input, ViewChildren, QueryList, ViewEncapsulation, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoModule } from '@jsverse/transloco';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTableModule } from '@angular/material/table';
import { CdkVirtualScrollViewport, ScrollingModule } from '@angular/cdk/scrolling';
import { AnimatedSummaryBorderDirective } from './animated-summary-border.directive';
import { DcmaRow } from './models/dcma-row.model';

@Component({
  standalone: true,
  selector: 'dcma-check9-details',
  imports: [CommonModule, TranslocoModule, MatTabsModule, MatTableModule, ScrollingModule, AnimatedSummaryBorderDirective],
  styleUrl: '../dcma-tab.component.scss',
  template: `
  <mat-tab-group mat-stretch-tabs="false" mat-align-tabs="start" (selectedTabChange)="onTabChange()">
    <mat-tab label="{{ 'dcma.summary' | transloco }}">
      <div class="c1-summary"
           [class.animate-border]="animate"
           [style.--c]="zoneColor"
           animatedSummaryBorder #asb="asb">
        <svg class="c1-summary__border"
             [attr.viewBox]="'0 0 ' + asb.sumW() + ' ' + asb.sumH()"
             preserveAspectRatio="none">
          <path [attr.d]="asb.summaryBorderPath()" pathLength="1"></path>
        </svg>

        <p class="c1-summary__title">{{ row.metric }}</p>

        <p class="c1-summary__pass" [class.ok]="row.passed" [class.bad]="!row.passed">
          {{ row.passed ? ('common.pass' | transloco) : ('common.fail' | transloco) }}
        </p>

        <p class="c1-summary__great">{{ greatText }}</p>
        <p class="c1-summary__desc">{{ ('dcma.checkDesc.' + row.check) | transloco }}</p>

        <p class="c1-summary__line">
          <strong>{{ 'dcma.c9.invalidForecast' | transloco }}</strong>
          {{ row.result?.invalidForecastCount }}
        </p>
        <p class="c1-summary__line">
          <strong>{{ 'dcma.c9.invalidActual' | transloco }}</strong>
          {{ row.result?.invalidActualCount }}
        </p>
      </div>
    </mat-tab>

    @if (row.result?.details?.forecast?.length) {
      <mat-tab label="{{ 'dcma.c9.forecastList' | transloco }} ({{ row.result.details.forecast.length }})">
        <div class="vtable">
          <table class="vtable__head">
            <thead>
              <tr>
                <th>{{ 'dcma.col.codeId' | transloco }}</th>
                <th>{{ 'dcma.col.es' | transloco }}</th>
                <th>{{ 'dcma.col.ef' | transloco }}</th>
                <th>{{ 'dcma.col.ls' | transloco }}</th>
                <th>{{ 'dcma.col.lf' | transloco }}</th>
              </tr>
            </thead>
          </table>

          <cdk-virtual-scroll-viewport
            class="v-viewport"
            [itemSize]="ITEM_SIZE"
            [minBufferPx]="minBufferPx"
            [maxBufferPx]="maxBufferPx">
            <table class="vtable__body mat-elevation-z1">
              <tbody>
                <tr *cdkVirtualFor="let i of row.result.details.forecast; trackBy: trackC9Forecast">
                  <td>{{ i.task_code || i.task_id }}</td>
                  <td>{{ i.early_start_date ? (i.early_start_date | date:'mediumDate') : '—' }}</td>
                  <td>{{ i.early_end_date   ? (i.early_end_date   | date:'mediumDate') : '—' }}</td>
                  <td>{{ i.late_start_date  ? (i.late_start_date  | date:'mediumDate') : '—' }}</td>
                  <td>{{ i.late_end_date    ? (i.late_end_date    | date:'mediumDate') : '—' }}</td>
                </tr>
              </tbody>
            </table>
          </cdk-virtual-scroll-viewport>
        </div>
      </mat-tab>
    }

    @if (row.result?.details?.actual?.length) {
      <mat-tab label="{{ 'dcma.c9.actualList' | transloco }} ({{ row.result.details.actual.length }})">
        <div class="vtable">
          <table class="vtable__head">
            <thead>
              <tr>
                <th>{{ 'dcma.col.codeId' | transloco }}</th>
                <th>{{ 'dcma.col.as' | transloco }}</th>
                <th>{{ 'dcma.col.af' | transloco }}</th>
              </tr>
            </thead>
          </table>

          <cdk-virtual-scroll-viewport
            class="v-viewport"
            [itemSize]="ITEM_SIZE"
            [minBufferPx]="minBufferPx"
            [maxBufferPx]="maxBufferPx">
            <table class="vtable__body mat-elevation-z1">
              <tbody>
                <tr *cdkVirtualFor="let i of row.result.details.actual; trackBy: trackC9Actual">
                  <td>{{ i.task_code || i.task_id }}</td>
                  <td>{{ i.act_start_date ? (i.act_start_date | date:'mediumDate') : '—' }}</td>
                  <td>{{ i.act_end_date   ? (i.act_end_date   | date:'mediumDate') : '—' }}</td>
                </tr>
              </tbody>
            </table>
          </cdk-virtual-scroll-viewport>
        </div>
      </mat-tab>
    }

    @if (row.result?.details?.dq) {
      <mat-tab label="{{ 'common.dq' | transloco }}">
        <table mat-table [dataSource]="(row.result.details.dq | keyvalue)" class="mat-elevation-z1 sticky-header dq-table">
          <ng-container matColumnDef="metric">
            <th mat-header-cell *matHeaderCellDef>{{ 'dcma.col.metric' | transloco }}</th>
            <td mat-cell *matCellDef="let k">{{ ('dcma.dq.' + k.key) | transloco }}</td>
          </ng-container>
          <ng-container matColumnDef="value">
            <th mat-header-cell *matHeaderCellDef>{{ 'dcma.col.value' | transloco }}</th>
            <td mat-cell *matCellDef="let k">{{ k.value }}</td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="['metric','value']"></tr>
          <tr mat-row *matRowDef="let r; columns: ['metric','value']"></tr>
        </table>
      </mat-tab>
    }
  </mat-tab-group>
  `,
  encapsulation: ViewEncapsulation.None
})
export class DcmaCheck9DetailsComponent {
  @Input({ required: true }) row!: DcmaRow;
  @Input({ required: true }) animate!: boolean;
  @Input({ required: true }) zoneColor!: string;
  @Input({ required: true }) greatText!: string;
  @Input() ITEM_SIZE = 44;

  @ViewChildren(CdkVirtualScrollViewport) vps!: QueryList<CdkVirtualScrollViewport>;


  minBufferPx = 440;
  maxBufferPx = 880;

  ngOnInit(): void {
    this.recomputeBuffers();
  }

  @HostListener('window:resize')
  onWindowResize() {
    this.recomputeBuffers();
  }

  private recomputeBuffers(): void {
    const vh = window?.innerHeight ?? 800;
    // min = calc(100vh - 150px), max = calc(100vh)
    const min = Math.max(0, vh - 150);
    const max = Math.max(min + this.ITEM_SIZE, vh); // гарантируем max >= min + itemSize
    this.minBufferPx = Math.round(min);
    this.maxBufferPx = Math.round(max);

    // если вьюпорты уже отрисованы — подсказать им про смену размеров
    queueMicrotask(() => {
      this.vps?.forEach(vp => { try { vp.checkViewportSize(); } catch {} });
    });
  }


  trackC9Forecast = (_: number, i: any) =>
    i?.task_id ?? i?.task_code ?? `${i?.early_start_date}|${i?.early_end_date}|${i?.late_start_date}|${i?.late_end_date}`;
  trackC9Actual = (_: number, i: any) =>
    i?.task_id ?? i?.task_code ?? `${i?.act_start_date}|${i?.act_end_date}`;

  onTabChange() {
    queueMicrotask(() => {
      this.vps?.forEach(vp => { try { vp.checkViewportSize(); vp.scrollToIndex(0, 'auto'); } catch {} });
    });
  }
}
