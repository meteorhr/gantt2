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
  selector: 'dcma-check1-details',
  styleUrl: '../dcma-tab.component.scss',
  imports: [CommonModule, TranslocoModule, MatTabsModule, MatTableModule, ScrollingModule, AnimatedSummaryBorderDirective],
  template: `
  @let c1 = row.result?.details;

  <mat-tab-group [mat-stretch-tabs]="false" mat-align-tabs="start" (selectedTabChange)="onTabChange()">
    <mat-tab label="{{ 'dcma.summary' | transloco }}">

        <div class="c1-summary"
            [class.animate-border]="animate"
            [style.--c]="zoneColor"
            animatedSummaryBorder #asb="asb">

          <svg class="c1-summary__border"
              [attr.viewBox]="'0 0 ' + asb.sumW() + ' ' + asb.sumH()"
              preserveAspectRatio="none" aria-hidden="true">
            <path [attr.d]="asb.summaryBorderPath()" pathLength="1"></path>
          </svg>

          <p class="c1-summary__title">{{ row.metric }}</p>
          <p class="c1-summary__percent">{{ row.percent | number:'1.0-2' }}%</p>
          <p class="c1-summary__great">{{ greatText }}</p>
          <p class="c1-summary__desc">{{ ('dcma.checkDesc.' + row.check) | transloco }}</p>

          <p class="c1-summary__line">
            <strong>{{ 'dcma.c1.missingTriplet' | transloco }}</strong>
            {{ row.result?.missingPredecessor }}/{{ row.result?.missingSuccessor }}/{{ row.result?.missingBoth }}
          </p>
        </div>
      
    </mat-tab>

    @if ((c1?.missingPredList?.length ?? 0) > 0) {
      <mat-tab label="{{ 'dcma.c1.missingPred' | transloco }} ({{ c1!.missingPredList.length }})">
        <div class="vtable">
          <table class="vtable__head mat-elevation-z1">
            <colgroup>
              <col style="width:160px" />
              <col />
            </colgroup>
            <thead>
              <tr>
                <th>{{ 'dcma.col.codeId' | transloco }}</th>
                <th>{{ 'dcma.col.name' | transloco }}</th>
              </tr>
            </thead>
          </table>

          <cdk-virtual-scroll-viewport class="v-viewport"
                                       [itemSize]="44"
                                       [minBufferPx]="minBufferPx"
                                       [maxBufferPx]="maxBufferPx">
            <table class="vtable__body mat-elevation-z1">
              <colgroup>
                <col style="width:160px" />
                <col />
              </colgroup>
              <tbody>
                <tr *cdkVirtualFor="let i of c1!.missingPredList; trackBy: trackTask">
                  <td>{{ i.task_code || i.task_id }}</td>
                  <td>{{ i.task_name }}</td>
                </tr>
              </tbody>
            </table>
          </cdk-virtual-scroll-viewport>
        </div>
      </mat-tab>
    }

    @if ((c1?.missingSuccList?.length ?? 0) > 0) {
      <mat-tab label="{{ 'dcma.c1.missingSucc' | transloco }} ({{ c1!.missingSuccList.length }})">
        <div class="vtable">
          <table class="vtable__head mat-elevation-z1">
            <colgroup>
              <col style="width:160px" />
              <col />
            </colgroup>
            <thead>
              <tr>
                <th>{{ 'dcma.col.codeId' | transloco }}</th>
                <th>{{ 'dcma.col.name' | transloco }}</th>
              </tr>
            </thead>
          </table>

          <cdk-virtual-scroll-viewport class="v-viewport"
                                       [itemSize]="44"
                                       [minBufferPx]="minBufferPx"
                                       [maxBufferPx]="maxBufferPx">
            <table class="vtable__body mat-elevation-z1">
              <colgroup>
                <col style="width:160px" />
                <col />
              </colgroup>
              <tbody>
                <tr *cdkVirtualFor="let i of c1!.missingSuccList; trackBy: trackTask">
                  <td>{{ i.task_code || i.task_id }}</td>
                  <td>{{ i.task_name }}</td>
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
export class DcmaCheck1DetailsComponent {
  @Input({ required: true }) row!: DcmaRow;
  @Input({ required: true }) animate!: boolean;
  @Input({ required: true }) zoneColor!: string;
  @Input({ required: true }) greatText!: string;
  @Input() ITEM_SIZE: number = 44;

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

  trackTask = (_: number, i: any) => i?.task_id ?? i?.task_code ?? i?.id ?? i;

  onTabChange() {
    queueMicrotask(() => {
      this.vps?.forEach(vp => {
        try { vp.checkViewportSize(); vp.scrollToIndex(0, 'auto'); } catch {}
      });
    });
  }
}
