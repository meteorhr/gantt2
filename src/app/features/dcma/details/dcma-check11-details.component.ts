import { Component, Input, ViewChildren, QueryList, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoModule } from '@jsverse/transloco';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTableModule } from '@angular/material/table';
import { CdkVirtualScrollViewport, ScrollingModule } from '@angular/cdk/scrolling';
import { AnimatedSummaryBorderDirective } from './animated-summary-border.directive';
import { DcmaRow } from './models/dcma-row.model';

@Component({
  standalone: true,
  selector: 'dcma-check11-details',
  imports: [CommonModule, TranslocoModule, MatTabsModule, MatTableModule, ScrollingModule, AnimatedSummaryBorderDirective],
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
        <p class="c1-summary__percent">{{ row.percent | number:'1.0-2' }}%</p>
        <p class="c1-summary__great">{{ greatText }}</p>
        <p class="c1-summary__desc">{{ ('dcma.checkDesc.' + row.check) | transloco }}</p>

        <p class="c1-summary__line">
          <strong>{{ 'dcma.c11.missed' | transloco }}</strong>
          {{ row.result?.missedCount }} / {{ row.result?.totalCompleted }}
        </p>
      </div>
    </mat-tab>

    @if (row.result?.details?.items?.length) {
      <mat-tab label="{{ 'dcma.details.title' | transloco }}">
        <div class="vtable">
          <table class="vtable__head">
            <thead>
              <tr>
                <th>{{ 'dcma.col.codeId' | transloco }}</th>
                <th>{{ 'dcma.col.name' | transloco }}</th>
                <th>{{ 'dcma.col.af' | transloco }}</th>
                <th>{{ 'dcma.col.bl' | transloco }}</th>
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
                <tr *cdkVirtualFor="let i of row.result.details.items; trackBy: trackDetailsItems">
                  <td>{{ i.task_code || i.task_id }}</td>
                  <td>{{ i.task_name }}</td>
                  <td>{{ i.act_finish ? (i.act_finish | date:'mediumDate') : '—' }}</td>
                  <td>{{ i.baseline_finish ? (i.baseline_finish | date:'mediumDate') : '—' }}</td>
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
export class DcmaCheck11DetailsComponent {
  @Input({ required: true }) row!: DcmaRow;
  @Input({ required: true }) animate!: boolean;
  @Input({ required: true }) zoneColor!: string;
  @Input({ required: true }) greatText!: string;
  @Input() ITEM_SIZE = 44;

  @ViewChildren(CdkVirtualScrollViewport) vps!: QueryList<CdkVirtualScrollViewport>;

  

  trackDetailsItems = (_: number, i: any) =>
    i?.task_id ?? i?.task_code ?? `${i?.task_name}|${i?.act_finish}|${i?.baseline_finish}`;

  onTabChange() {
    queueMicrotask(() => {
      this.vps?.forEach(vp => { try { vp.checkViewportSize(); vp.scrollToIndex(0, 'auto'); } catch {} });
    });
  }
}
