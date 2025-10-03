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
  selector: 'dcma-check3-details',
  imports: [CommonModule, TranslocoModule, MatTabsModule, MatTableModule, ScrollingModule, AnimatedSummaryBorderDirective],
  template: `
  <mat-tab-group [mat-stretch-tabs]="false" mat-align-tabs="start" (selectedTabChange)="onTabChange()">
    <mat-tab label="{{ 'dcma.summary' | transloco }}">
      <div class="c1-summary"
           [class.animate-border]="animate"
           [style.--c]="zoneColor"
           animatedSummaryBorder #asb="asb">
        <svg class="c1-summary__border"
             [attr.viewBox]="'0 0 ' + asb.sumW() + ' ' + asb.sumH()"
             preserveAspectRatio="none"><path [attr.d]="asb.summaryBorderPath()" pathLength="1"></path></svg>

        <p class="c1-summary__title">{{ row.metric }}</p>
        <p class="c1-summary__percent">{{ row.percent | number:'1.0-2' }}%</p>
        <p class="c1-summary__great">{{ greatText }}</p>
        <p class="c1-summary__desc">{{ ('dcma.checkDesc.' + row.check) | transloco }}</p>

        <p class="c1-summary__line">
          <strong>{{ 'dcma.c3.lags' | transloco }}</strong>
          {{ row.result?.lagCount }} / {{ row.result?.totalRelationships }}
        </p>
      </div>
    </mat-tab>

    @if (row.result?.details?.lags?.length) {
      <mat-tab label="{{ 'dcma.details.title' | transloco }}">
        <div class="vtable">
          <table class="vtable__head">
            <thead>
              <tr>
                <th>{{ 'dcma.col.pred' | transloco }}</th>
                <th>{{ 'dcma.col.succ' | transloco }}</th>
                <th>{{ 'dcma.col.type' | transloco }}</th>
                <th>{{ 'dcma.col.lagDays' | transloco }}</th>
              </tr>
            </thead>
          </table>

          <cdk-virtual-scroll-viewport class="v-viewport"
            [itemSize]="ITEM_SIZE"
            [minBufferPx]="minBufferPx"
            [maxBufferPx]="maxBufferPx">
            <table class="vtable__body mat-elevation-z1">
              <tbody>
                <tr *cdkVirtualFor="let l of row.result.details.lags; trackBy: trackLink">
                  <td>{{ l.predecessor_code || l.predecessor_task_id }}</td>
                  <td>{{ l.successor_code   || l.successor_task_id   }}</td>
                  <td>{{ l.link_type }}</td>
                  <td>{{ l.lag_days_8h }}</td>
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
export class DcmaCheck3DetailsComponent {
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

  trackLink = (_: number, l: any) =>
    l?.id ?? `${l?.predecessor_task_id || l?.predecessor_code}->${l?.successor_task_id || l?.successor_code}:${l?.link_type}:${l?.lag_days_8h}`;

  onTabChange() {
    queueMicrotask(() => {
      this.vps?.forEach(vp => {
        try { vp.checkViewportSize(); vp.scrollToIndex(0, 'auto'); } catch {}
      });
    });
  }
}
