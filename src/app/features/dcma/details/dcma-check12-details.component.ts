import { Component, Input, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoModule } from '@jsverse/transloco';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTableModule } from '@angular/material/table';
import { AnimatedSummaryBorderDirective } from './animated-summary-border.directive';
import { DcmaRow } from './models/dcma-row.model';

@Component({
  standalone: true,
  selector: 'dcma-check12-details',
  imports: [CommonModule, TranslocoModule, MatTabsModule, MatTableModule, AnimatedSummaryBorderDirective],
  template: `
  <mat-tab-group mat-stretch-tabs="false" mat-align-tabs="start">
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
          <strong>{{ 'dcma.c12.criticalTasks' | transloco }}</strong>
          {{ row.result?.criticalCount }}
        </p>
        <p class="c1-summary__line">
          <strong>{{ 'dcma.c12.singleChain' | transloco }}</strong>
          {{ row.result?.isSingleChain ? ('common.yes' | transloco) : ('common.no' | transloco) }}
        </p>
        <p class="c1-summary__line">
          <strong>{{ 'dcma.c12.endsAtPf' | transloco }}</strong>
          {{ row.result?.reachedProjectFinish ? ('common.yes' | transloco) : ('common.no' | transloco) }}
        </p>
        <p class="c1-summary__line">
          <strong>{{ 'dcma.c12.startNodes' | transloco }}</strong>
          {{ row.result?.startNodesOnCP }}
        </p>
        <p class="c1-summary__line">
          <strong>{{ 'dcma.c12.endNodes' | transloco }}</strong>
          {{ row.result?.endNodesOnCP }}
        </p>
      </div>
    </mat-tab>

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
export class DcmaCheck12DetailsComponent {
  @Input({ required: true }) row!: DcmaRow;
  @Input({ required: true }) animate!: boolean;
  @Input({ required: true }) zoneColor!: string;
  @Input({ required: true }) greatText!: string;
}
