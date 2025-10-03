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
  selector: 'dcma-check6-details',
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
             preserveAspectRatio="none"><path [attr.d]="asb.summaryBorderPath()" pathLength="1"></path></svg>

        <p class="c1-summary__title">{{ row.metric }}</p>
        <p class="c1-summary__percent">{{ row.percent | number:'1.0-2' }}%</p>
        <p class="c1-summary__great">{{ greatText }}</p>
        <p class="c1-summary__desc">{{ ('dcma.checkDesc.' + row.check) | transloco }}</p>

        <p class="c1-summary__line">
          <strong>{{ 'dcma.c6.highFloat' | transloco }}</strong>
          {{ row.result?.highFloatCount }} / {{ row.result?.totalEligible }}
        </p>
      </div>
    </mat-tab>

    @if (row.result?.details?.items?.length) {
      <mat-tab label="{{ 'dcma.c6.highFloat' | transloco }}">
        <table mat-table [dataSource]="row.result.details.items" class="mat-elevation-z1 sticky-header">
          <ng-container matColumnDef="code">
            <th mat-header-cell *matHeaderCellDef>{{ 'dcma.col.codeId' | transloco }}</th>
            <td mat-cell *matCellDef="let i">{{ i.task_code || i.task_id }}</td>
          </ng-container>
          <ng-container matColumnDef="name">
            <th mat-header-cell *matHeaderCellDef>{{ 'dcma.col.name' | transloco }}</th>
            <td mat-cell *matCellDef="let i">{{ i.task_name }}</td>
          </ng-container>
          <ng-container matColumnDef="tfh">
            <th mat-header-cell *matHeaderCellDef>{{ 'dcma.col.tfHours' | transloco }}</th>
            <td mat-cell *matCellDef="let i">{{ i.total_float_hr_cnt }}</td>
          </ng-container>
          <ng-container matColumnDef="tfd">
            <th mat-header-cell *matHeaderCellDef>{{ 'dcma.col.tfDays' | transloco }}</th>
            <td mat-cell *matCellDef="let i">{{ i.total_float_days_8h }}</td>
          </ng-container>
          <ng-container matColumnDef="hpd">
            <th mat-header-cell *matHeaderCellDef>{{ 'dcma.col.hpd' | transloco }}</th>
            <td mat-cell *matCellDef="let i">{{ i.hours_per_day_used || '—' }}</td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="['code','name','tfh','tfd','hpd']"></tr>
          <tr mat-row *matRowDef="let i; columns: ['code','name','tfh','tfd','hpd']"></tr>
        </table>
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
export class DcmaCheck6DetailsComponent {
  @Input({ required: true }) row!: DcmaRow;
  @Input({ required: true }) animate!: boolean;
  @Input({ required: true }) zoneColor!: string;
  @Input({ required: true }) greatText!: string;

  @ViewChildren(CdkVirtualScrollViewport) vps!: QueryList<CdkVirtualScrollViewport>;

  onTabChange() {
    queueMicrotask(() => {
      this.vps?.forEach(vp => {
        try { vp.checkViewportSize(); vp.scrollToIndex(0, 'auto'); } catch {}
      });
    });
  }
}
