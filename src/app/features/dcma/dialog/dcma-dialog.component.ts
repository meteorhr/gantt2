import { CommonModule } from "@angular/common";
import { Component, Inject } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MAT_DIALOG_DATA, MatDialogModule } from "@angular/material/dialog";
import { MatIconModule } from "@angular/material/icon";
import { TranslocoModule } from "@jsverse/transloco";
import { MatTabsModule } from '@angular/material/tabs';
import { MatTableModule } from '@angular/material/table';
import { ScrollingModule } from '@angular/cdk/scrolling';

@Component({
  standalone: true,
  selector: 'app-dcma-details-dialog',
   imports: [
    CommonModule,
    MatDialogModule,
    MatIconModule,
    MatButtonModule,
    TranslocoModule,
    MatTabsModule,
    MatTableModule,
    ScrollingModule
  ],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    @if (data.strictLogic) { <div class="badge">{{ 'dcma.details.strictLogic' | transloco }}</div> }
    <div mat-dialog-content class="content">
      @switch (data.check) {
        @case (1) {
          <p><strong>{{ 'dcma.c1.missingAny' | transloco }}</strong> {{ data.result?.percentMissingAny }}%</p>
          <p><strong>{{ 'dcma.c1.missingTriplet' | transloco }}</strong> {{ data.result?.missingPredecessor }}/{{ data.result?.missingSuccessor }}/{{ data.result?.missingBoth }}</p>
@if (data.result?.details?.missingPredList?.length || data.result?.details?.missingSuccList?.length) {
  <mat-tab-group  mat-stretch-tabs="false" mat-align-tabs="start">
    @if (data.result?.details?.missingPredList?.length) {
      <mat-tab label="{{ 'dcma.c1.missingPred' | transloco }} ({{ data.result.details.missingPredList.length }})">
        <cdk-virtual-scroll-viewport class="table-viewport" itemSize="48">
          <table mat-table [dataSource]="data.result.details.missingPredList" class="mat-elevation-z1 sticky-header">
            <ng-container matColumnDef="task_code">
              <th mat-header-cell *matHeaderCellDef>Code/ID</th>
              <td mat-cell *matCellDef="let i">{{ i.task_code || i.task_id }}</td>
            </ng-container>
            <ng-container matColumnDef="task_name">
              <th mat-header-cell *matHeaderCellDef>Name</th>
              <td mat-cell *matCellDef="let i">{{ i.task_name }}</td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="['task_code','task_name']"></tr>
            <tr mat-row *matRowDef="let row; columns: ['task_code','task_name']"></tr>
          </table>
    </cdk-virtual-scroll-viewport>
      </mat-tab>
    }
    @if (data.result?.details?.missingSuccList?.length) {
      <mat-tab label="{{ 'dcma.c1.missingSucc' | transloco }} ({{ data.result.details.missingSuccList.length }})">
        <cdk-virtual-scroll-viewport class="table-viewport" itemSize="48">
          <table mat-table [dataSource]="data.result.details.missingSuccList" class="mat-elevation-z1 sticky-header">
            <ng-container matColumnDef="task_code">
              <th mat-header-cell *matHeaderCellDef>Code/ID</th>
              <td mat-cell *matCellDef="let i">{{ i.task_code || i.task_id }}</td>
            </ng-container>
            <ng-container matColumnDef="task_name">
              <th mat-header-cell *matHeaderCellDef>Name</th>
              <td mat-cell *matCellDef="let i">{{ i.task_name }}</td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="['task_code','task_name']"></tr>
            <tr mat-row *matRowDef="let row; columns: ['task_code','task_name']"></tr>
          </table>
    </cdk-virtual-scroll-viewport>
      </mat-tab>
    }
  </mat-tab-group>
}
        }
        @case (2) {
          <p><strong>{{ 'dcma.c2.leads' | transloco }}</strong> {{ data.result?.leadCount }} / {{ data.result?.totalRelationships }} ({{ data.result?.leadPercent }}%)</p>
          @if (data.result?.details?.leads?.length) {
            <cdk-virtual-scroll-viewport class="table-viewport" itemSize="48">
              <table mat-table [dataSource]="data.result.details.leads" class="mat-elevation-z1 sticky-header">
                <ng-container matColumnDef="pred">
                  <th mat-header-cell *matHeaderCellDef>Pred</th>
                  <td mat-cell *matCellDef="let l">{{ l.predecessor_code || l.predecessor_task_id }}</td>
                </ng-container>
                <ng-container matColumnDef="succ">
                  <th mat-header-cell *matHeaderCellDef>Succ</th>
                  <td mat-cell *matCellDef="let l">{{ l.successor_code || l.successor_task_id }}</td>
                </ng-container>
                <ng-container matColumnDef="type">
                  <th mat-header-cell *matHeaderCellDef>Type</th>
                  <td mat-cell *matCellDef="let l">{{ l.link_type }}</td>
                </ng-container>
                <ng-container matColumnDef="lag">
                  <th mat-header-cell *matHeaderCellDef>Lag (d)</th>
                  <td mat-cell *matCellDef="let l">{{ l.lag_days_8h }}</td>
                </ng-container>

                <tr mat-header-row *matHeaderRowDef="['pred','succ','type','lag']"></tr>
                <tr mat-row *matRowDef="let row; columns: ['pred','succ','type','lag']"></tr>
              </table>
            </cdk-virtual-scroll-viewport>
          }
        }
        @case (3) {
          <p><strong>{{ 'dcma.c3.lags' | transloco }}</strong> {{ data.result?.lagCount }} / {{ data.result?.totalRelationships }} ({{ data.result?.lagPercent }}%)</p>
          @if (data.result?.details?.lags?.length) {
           <cdk-virtual-scroll-viewport class="table-viewport" itemSize="48">
              <table mat-table [dataSource]="data.result.details.lags" class="mat-elevation-z1 sticky-header">
                <ng-container matColumnDef="pred">
                  <th mat-header-cell *matHeaderCellDef>Pred</th>
                  <td mat-cell *matCellDef="let l">{{ l.predecessor_code || l.predecessor_task_id }}</td>
                </ng-container>
                <ng-container matColumnDef="succ">
                  <th mat-header-cell *matHeaderCellDef>Succ</th>
                  <td mat-cell *matCellDef="let l">{{ l.successor_code || l.successor_task_id }}</td>
                </ng-container>
                <ng-container matColumnDef="type">
                  <th mat-header-cell *matHeaderCellDef>Type</th>
                  <td mat-cell *matCellDef="let l">{{ l.link_type }}</td>
                </ng-container>
                <ng-container matColumnDef="lag">
                  <th mat-header-cell *matHeaderCellDef>Lag (d)</th>
                  <td mat-cell *matCellDef="let l">{{ l.lag_days_8h }}</td>
                </ng-container>
                <tr mat-header-row *matHeaderRowDef="['pred','succ','type','lag']"></tr>
                <tr mat-row *matRowDef="let row; columns: ['pred','succ','type','lag']"></tr>
              </table>
           </cdk-virtual-scroll-viewport>
          }
        }
        @case (4) {
          <p><strong>{{ 'dcma.c4.fsPercent' | transloco }}</strong> {{ data.result?.percentFS }}%</p>
          @if (data.result?.details?.nonFsList?.length) {
            <cdk-virtual-scroll-viewport class="table-viewport" itemSize="48">
              <table mat-table [dataSource]="data.result.details.nonFsList" class="mat-elevation-z1 sticky-header">
                <ng-container matColumnDef="pred">
                  <th mat-header-cell *matHeaderCellDef>Pred</th>
                  <td mat-cell *matCellDef="let x">{{ x.predecessor_code || x.predecessor_task_id }}</td>
                </ng-container>
                <ng-container matColumnDef="succ">
                  <th mat-header-cell *matHeaderCellDef>Succ</th>
                  <td mat-cell *matCellDef="let x">{{ x.successor_code || x.successor_task_id }}</td>
                </ng-container>
                <ng-container matColumnDef="type">
                  <th mat-header-cell *matHeaderCellDef>Type</th>
                  <td mat-cell *matCellDef="let x">{{ x.link_type }}</td>
                </ng-container>
                <tr mat-header-row *matHeaderRowDef="['pred','succ','type']"></tr>
                <tr mat-row *matRowDef="let row; columns: ['pred','succ','type']"></tr>
              </table>
            </cdk-virtual-scroll-viewport>
          }
        }
        @case (5) {
          <p><strong>{{ 'dcma.c5.hard' | transloco }}</strong> {{ data.result?.hardCount }} / {{ data.result?.totalWithConstraints }} ({{ data.result?.hardPercent }}%)</p>
          @if (data.result?.details?.hardList?.length) {
            <cdk-virtual-scroll-viewport class="table-viewport" itemSize="48">
              <table mat-table [dataSource]="data.result.details.hardList" class="mat-elevation-z1 sticky-header">
                <ng-container matColumnDef="code">
                  <th mat-header-cell *matHeaderCellDef>Code/ID</th>
                  <td mat-cell *matCellDef="let i">{{ i.task_code || i.task_id }}</td>
                </ng-container>
                <ng-container matColumnDef="name">
                  <th mat-header-cell *matHeaderCellDef>Name</th>
                  <td mat-cell *matCellDef="let i">{{ i.task_name }}</td>
                </ng-container>
                <ng-container matColumnDef="type">
                  <th mat-header-cell *matHeaderCellDef>Type</th>
                  <td mat-cell *matCellDef="let i">{{ i.cstr_type }}</td>
                </ng-container>
                <ng-container matColumnDef="date">
                  <th mat-header-cell *matHeaderCellDef>Date</th>
                  <td mat-cell *matCellDef="let i">{{ i.cstr_date ? (i.cstr_date | date:'mediumDate') : '—' }}</td>
                </ng-container>
                <tr mat-header-row *matHeaderRowDef="['code','name','type','date']"></tr>
                <tr mat-row *matRowDef="let row; columns: ['code','name','type','date']"></tr>
              </table>
          </cdk-virtual-scroll-viewport>
          }
        }
        @case (6) {
          <p><strong>{{ 'dcma.c6.highFloat' | transloco }}</strong> {{ data.result?.highFloatCount }} / {{ data.result?.totalEligible }} ({{ data.result?.highFloatPercent }}%)</p>
          
            <mat-tab-group mat-stretch-tabs="false" mat-align-tabs="start">
          @if (data.result?.details?.items?.length) {
             <mat-tab label="{{ 'dcma.c6.highFloat' | transloco }}">
            <cdk-virtual-scroll-viewport class="table-viewport" itemSize="48">
              <table mat-table [dataSource]="data.result.details.items" class="mat-elevation-z1 sticky-header">
                <ng-container matColumnDef="code">
                  <th mat-header-cell *matHeaderCellDef>Code/ID</th>
                  <td mat-cell *matCellDef="let i">{{ i.task_code || i.task_id }}</td>
                </ng-container>
                <ng-container matColumnDef="name">
                  <th mat-header-cell *matHeaderCellDef>Name</th>
                  <td mat-cell *matCellDef="let i">{{ i.task_name }}</td>
                </ng-container>
                <ng-container matColumnDef="tfh">
                  <th mat-header-cell *matHeaderCellDef>TF (h)</th>
                  <td mat-cell *matCellDef="let i">{{ i.total_float_hr_cnt }}</td>
                </ng-container>
                <ng-container matColumnDef="tfd">
                  <th mat-header-cell *matHeaderCellDef>TF (d)</th>
                  <td mat-cell *matCellDef="let i">{{ i.total_float_days_8h }}</td>
                </ng-container>
                <ng-container matColumnDef="hpd">
                  <th mat-header-cell *matHeaderCellDef>hpd</th>
                  <td mat-cell *matCellDef="let i">{{ i.hours_per_day_used || '—' }}</td>
                </ng-container>
                <tr mat-header-row *matHeaderRowDef="['code','name','tfh','tfd','hpd']"></tr>
                <tr mat-row *matRowDef="let row; columns: ['code','name','tfh','tfd','hpd']"></tr>
              </table>
            </cdk-virtual-scroll-viewport>
            </mat-tab>
          }
          @if (data.result?.details?.dq) {
              <mat-tab label="{{ 'common.dq' | transloco }}">
                <table mat-table [dataSource]="(data.result.details.dq | keyvalue)" class="mat-elevation-z1 sticky-header dq-table">
                  <ng-container matColumnDef="metric">
                    <th mat-header-cell *matHeaderCellDef>Metric</th>
                    <td mat-cell *matCellDef="let k">{{ k.key }}</td>
                  </ng-container>
                  <ng-container matColumnDef="value">
                    <th mat-header-cell *matHeaderCellDef>Value</th>
                    <td mat-cell *matCellDef="let k">{{ k.value }}</td>
                  </ng-container>
                  <tr mat-header-row *matHeaderRowDef="['metric','value']"></tr>
                  <tr mat-row *matRowDef="let row; columns: ['metric','value']"></tr>
                </table>
              </mat-tab>
            
          }
          </mat-tab-group>
        }
        @case (7) {
          <p><strong>{{ 'dcma.c7.negativeFloat' | transloco }}</strong> {{ data.result?.negativeFloatCount }}</p>
          
          <mat-tab-group mat-stretch-tabs="false" mat-align-tabs="start">
            @if (data.result?.details?.items?.length) {
              <mat-tab label="{{ 'dcma.c7.negativeFloat' | transloco }}">
            <cdk-virtual-scroll-viewport class="table-viewport" itemSize="48">
              <table mat-table [dataSource]="data.result.details.items" class="mat-elevation-z1 sticky-header">
                <ng-container matColumnDef="code">
                  <th mat-header-cell *matHeaderCellDef>Code/ID</th>
                  <td mat-cell *matCellDef="let i">{{ i.task_code || i.task_id }}</td>
                </ng-container>
                <ng-container matColumnDef="name">
                  <th mat-header-cell *matHeaderCellDef>Name</th>
                  <td mat-cell *matCellDef="let i">{{ i.task_name }}</td>
                </ng-container>
                <ng-container matColumnDef="tfh">
                  <th mat-header-cell *matHeaderCellDef>TF (h)</th>
                  <td mat-cell *matCellDef="let i">{{ i.total_float_hr_cnt }}</td>
                </ng-container>
                <ng-container matColumnDef="hpd">
                  <th mat-header-cell *matHeaderCellDef>hpd</th>
                  <td mat-cell *matCellDef="let i">{{ i.hours_per_day_used || '—' }}</td>
                </ng-container>
                <tr mat-header-row *matHeaderRowDef="['code','name','tfh','hpd']"></tr>
                <tr mat-row *matRowDef="let row; columns: ['code','name','tfh','hpd']"></tr>
              </table>
            </cdk-virtual-scroll-viewport>
            </mat-tab>
          }
          @if (data.result?.details?.dq) {
            
              <mat-tab label="{{ 'common.dq' | transloco }}">
                <table mat-table [dataSource]="(data.result.details.dq | keyvalue)" class="mat-elevation-z1 sticky-header dq-table">
                  <ng-container matColumnDef="metric">
                    <th mat-header-cell *matHeaderCellDef>Metric</th>
                    <td mat-cell *matCellDef="let k">{{ k.key }}</td>
                  </ng-container>
                  <ng-container matColumnDef="value">
                    <th mat-header-cell *matHeaderCellDef>Value</th>
                    <td mat-cell *matCellDef="let k">{{ k.value }}</td>
                  </ng-container>
                  <tr mat-header-row *matHeaderRowDef="['metric','value']"></tr>
                  <tr mat-row *matRowDef="let row; columns: ['metric','value']"></tr>
                </table>
              </mat-tab>
            
          }
        </mat-tab-group>
        }
        @case (8) {
          <p><strong>{{ 'dcma.c8.highDuration' | transloco }}</strong> {{ data.result?.highDurationCount }} / {{ data.result?.totalEligible }} ({{ data.result?.highDurationPercent }}%)</p>
          
          <mat-tab-group mat-stretch-tabs="false" mat-align-tabs="start">
             @if (data.result?.details?.items?.length) {
               <mat-tab label="{{ 'dcma.c8.highDuration' | transloco }}">
            <cdk-virtual-scroll-viewport class="table-viewport" itemSize="48">
              <table mat-table [dataSource]="data.result.details.items" class="mat-elevation-z1 sticky-header">
                <ng-container matColumnDef="code">
                  <th mat-header-cell *matHeaderCellDef>Code/ID</th>
                  <td mat-cell *matCellDef="let i">{{ i.task_code || i.task_id }}</td>
                </ng-container>
                <ng-container matColumnDef="name">
                  <th mat-header-cell *matHeaderCellDef>Name</th>
                  <td mat-cell *matCellDef="let i">{{ i.task_name }}</td>
                </ng-container>
                <ng-container matColumnDef="remh">
                  <th mat-header-cell *matHeaderCellDef>Remain (h)</th>
                  <td mat-cell *matCellDef="let i">{{ i.remain_dur_hr_cnt }}</td>
                </ng-container>
                <ng-container matColumnDef="remd">
                  <th mat-header-cell *matHeaderCellDef>Remain (d)</th>
                  <td mat-cell *matCellDef="let i">{{ i.remain_dur_days_8h }}</td>
                </ng-container>
                <ng-container matColumnDef="hpd">
                  <th mat-header-cell *matHeaderCellDef>hpd</th>
                  <td mat-cell *matCellDef="let i">{{ i.hours_per_day_used || '—' }}</td>
                </ng-container>
                <tr mat-header-row *matHeaderRowDef="['code','name','remh','remd','hpd']"></tr>
                <tr mat-row *matRowDef="let row; columns: ['code','name','remh','remd','hpd']"></tr>
              </table>
          </cdk-virtual-scroll-viewport>
          </mat-tab>
          }
          @if (data.result?.details?.dq) {
            
              <mat-tab label="{{ 'common.dq' | transloco }}">
                <table mat-table [dataSource]="(data.result.details.dq | keyvalue)" class="mat-elevation-z1 sticky-header dq-table">
                  <ng-container matColumnDef="metric">
                    <th mat-header-cell *matHeaderCellDef>Metric</th>
                    <td mat-cell *matCellDef="let k">{{ k.key }}</td>
                  </ng-container>
                  <ng-container matColumnDef="value">
                    <th mat-header-cell *matHeaderCellDef>Value</th>
                    <td mat-cell *matCellDef="let k">{{ k.value }}</td>
                  </ng-container>
                  <tr mat-header-row *matHeaderRowDef="['metric','value']"></tr>
                  <tr mat-row *matRowDef="let row; columns: ['metric','value']"></tr>
                </table>
              </mat-tab>
          }
            </mat-tab-group>
        }
        @case (9) {
          <p><strong>{{ 'dcma.c9.invalidForecast' | transloco }}</strong> {{ data.result?.invalidForecastCount }} • <strong>{{ 'dcma.c9.invalidActual' | transloco }}</strong> {{ data.result?.invalidActualCount }}</p>
          @if (data.result?.details?.forecast?.length || data.result?.details?.actual?.length) {
            <mat-tab-group mat-stretch-tabs="false" mat-align-tabs="start">
              @if (data.result?.details?.forecast?.length) {
                <mat-tab label="{{ 'dcma.c9.forecastList' | transloco }} ({{ data.result.details.forecast.length }})">
                  <cdk-virtual-scroll-viewport class="table-viewport" itemSize="48">
                    <table mat-table [dataSource]="data.result.details.forecast" class="mat-elevation-z1 sticky-header">
                      <ng-container matColumnDef="code">
                        <th mat-header-cell *matHeaderCellDef>Code/ID</th>
                        <td mat-cell *matCellDef="let i">{{ i.task_code || i.task_id }}</td>
                      </ng-container>
                      <ng-container matColumnDef="es">
                        <th mat-header-cell *matHeaderCellDef>ES</th>
                        <td mat-cell *matCellDef="let i">{{ i.early_start_date ? (i.early_start_date | date:'mediumDate') : '—' }}</td>
                      </ng-container>
                      <ng-container matColumnDef="ef">
                        <th mat-header-cell *matHeaderCellDef>EF</th>
                        <td mat-cell *matCellDef="let i">{{ i.early_end_date ? (i.early_end_date | date:'mediumDate') : '—' }}</td>
                      </ng-container>
                      <ng-container matColumnDef="ls">
                        <th mat-header-cell *matHeaderCellDef>LS</th>
                        <td mat-cell *matCellDef="let i">{{ i.late_start_date ? (i.late_start_date | date:'mediumDate') : '—' }}</td>
                      </ng-container>
                      <ng-container matColumnDef="lf">
                        <th mat-header-cell *matHeaderCellDef>LF</th>
                        <td mat-cell *matCellDef="let i">{{ i.late_end_date ? (i.late_end_date | date:'mediumDate') : '—' }}</td>
                      </ng-container>
                      <tr mat-header-row *matHeaderRowDef="['code','es','ef','ls','lf']"></tr>
                      <tr mat-row *matRowDef="let row; columns: ['code','es','ef','ls','lf']"></tr>
                    </table>
                  </cdk-virtual-scroll-viewport>
                </mat-tab>
              }
              @if (data.result?.details?.actual?.length) {
                <mat-tab label="{{ 'dcma.c9.actualList' | transloco }} ({{ data.result.details.actual.length }})">
                  <cdk-virtual-scroll-viewport class="table-viewport" itemSize="48">
                    <table mat-table [dataSource]="data.result.details.actual" class="mat-elevation-z1 sticky-header">
                      <ng-container matColumnDef="code">
                        <th mat-header-cell *matHeaderCellDef>Code/ID</th>
                        <td mat-cell *matCellDef="let i">{{ i.task_code || i.task_id }}</td>
                      </ng-container>
                      <ng-container matColumnDef="as">
                        <th mat-header-cell *matHeaderCellDef>AS</th>
                        <td mat-cell *matCellDef="let i">{{ i.act_start_date ? (i.act_start_date | date:'mediumDate') : '—' }}</td>
                      </ng-container>
                      <ng-container matColumnDef="af">
                        <th mat-header-cell *matHeaderCellDef>AF</th>
                        <td mat-cell *matCellDef="let i">{{ i.act_end_date ? (i.act_end_date | date:'mediumDate') : '—' }}</td>
                      </ng-container>
                      <tr mat-header-row *matHeaderRowDef="['code','as','af']"></tr>
                      <tr mat-row *matRowDef="let row; columns: ['code','as','af']"></tr>
                    </table>
                  </cdk-virtual-scroll-viewport>
                </mat-tab>
              }
            </mat-tab-group>
          }
        }
        @case (10) {
          <p><strong>{{ 'dcma.c10.withoutResources' | transloco }}</strong> {{ data.result?.withoutResourceCount }} / {{ data.result?.totalEligible }} ({{ data.result?.percentWithoutResource }}%)</p>
          <mat-tab-group mat-stretch-tabs="false" mat-align-tabs="start">
          @if (data.result?.details?.items?.length) {
             <mat-tab label="{{ 'dcma.c10.withoutResources' | transloco }}">
            <cdk-virtual-scroll-viewport class="table-viewport" itemSize="48">
              <table mat-table [dataSource]="data.result.details.items" class="mat-elevation-z1 sticky-header">
                <ng-container matColumnDef="code">
                  <th mat-header-cell *matHeaderCellDef>Code/ID</th>
                  <td mat-cell *matCellDef="let i">{{ i.task_code || i.task_id }}</td>
                </ng-container>
                <ng-container matColumnDef="name">
                  <th mat-header-cell *matHeaderCellDef>Name</th>
                  <td mat-cell *matCellDef="let i">{{ i.task_name }}</td>
                </ng-container>
                <ng-container matColumnDef="effh">
                  <th mat-header-cell *matHeaderCellDef>Eff (h)</th>
                  <td mat-cell *matCellDef="let i">{{ i.eff_dur_hr_cnt }}</td>
                </ng-container>
                <ng-container matColumnDef="effd">
                  <th mat-header-cell *matHeaderCellDef>Eff (d)</th>
                  <td mat-cell *matCellDef="let i">{{ i.eff_dur_days }}</td>
                </ng-container>
                <ng-container matColumnDef="hpd">
                  <th mat-header-cell *matHeaderCellDef>hpd</th>
                  <td mat-cell *matCellDef="let i">{{ i.hours_per_day_used || '—' }}</td>
                </ng-container>
                <tr mat-header-row *matHeaderRowDef="['code','name','effh','effd','hpd']"></tr>
                <tr mat-row *matRowDef="let row; columns: ['code','name','effh','effd','hpd']"></tr>
              </table>
            </cdk-virtual-scroll-viewport>
            </mat-tab>
          }
          @if (data.result?.details?.dq) {
   
              <mat-tab label="{{ 'common.dq' | transloco }}">
                <table mat-table [dataSource]="(data.result.details.dq | keyvalue)" class="mat-elevation-z1 sticky-header dq-table">
                  <ng-container matColumnDef="metric">
                    <th mat-header-cell *matHeaderCellDef>Metric</th>
                    <td mat-cell *matCellDef="let k">{{ k.key }}</td>
                  </ng-container>
                  <ng-container matColumnDef="value">
                    <th mat-header-cell *matHeaderCellDef>Value</th>
                    <td mat-cell *matCellDef="let k">{{ k.value }}</td>
                  </ng-container>
                  <tr mat-header-row *matHeaderRowDef="['metric','value']"></tr>
                  <tr mat-row *matRowDef="let row; columns: ['metric','value']"></tr>
                </table>
              </mat-tab>
            
          }
          </mat-tab-group>
        }
        @case (11) {
          <p><strong>{{ 'dcma.c11.missed' | transloco }}</strong> {{ data.result?.missedCount }} / {{ data.result?.totalCompleted }} ({{ data.result?.missedPercent }}%)</p>
          @if (data.result?.details?.items?.length) {
           <cdk-virtual-scroll-viewport class="table-viewport" itemSize="48">
              <table mat-table [dataSource]="data.result.details.items" class="mat-elevation-z1 sticky-header">
                <ng-container matColumnDef="code">
                  <th mat-header-cell *matHeaderCellDef>Code/ID</th>
                  <td mat-cell *matCellDef="let i">{{ i.task_code || i.task_id }}</td>
                </ng-container>
                <ng-container matColumnDef="name">
                  <th mat-header-cell *matHeaderCellDef>Name</th>
                  <td mat-cell *matCellDef="let i">{{ i.task_name }}</td>
                </ng-container>
                <ng-container matColumnDef="af">
                  <th mat-header-cell *matHeaderCellDef>AF</th>
                  <td mat-cell *matCellDef="let i">{{ i.act_finish ? (i.act_finish | date:'mediumDate') : '—' }}</td>
                </ng-container>
                <ng-container matColumnDef="bl">
                  <th mat-header-cell *matHeaderCellDef>BL</th>
                  <td mat-cell *matCellDef="let i">{{ i.baseline_finish ? (i.baseline_finish | date:'mediumDate') : '—' }}</td>
                </ng-container>
                <tr mat-header-row *matHeaderRowDef="['code','name','af','bl']"></tr>
                <tr mat-row *matRowDef="let row; columns: ['code','name','af','bl']"></tr>
              </table>
           </cdk-virtual-scroll-viewport>
          }
        }
        @case (12) {
          <p><strong>{{ 'dcma.c12.criticalTasks' | transloco }}</strong> {{ data.result?.criticalCount }} • <strong>{{ 'dcma.c12.singleChain' | transloco }}</strong> {{ data.result?.isSingleChain ? 'Да' : 'Нет' }} • <strong>{{ 'dcma.c12.endsAtPf' | transloco }}</strong> {{ data.result?.reachedProjectFinish ? 'Да' : 'Нет' }}</p>
          <p><strong>{{ 'dcma.c12.startNodes' | transloco }}</strong> {{ data.result?.startNodesOnCP }} • <strong>{{ 'dcma.c12.endNodes' | transloco }}</strong> {{ data.result?.endNodesOnCP }}</p>
          @if (data.result?.details?.dq) {
            <mat-tab-group mat-stretch-tabs="false" mat-align-tabs="start">
              <mat-tab label="{{ 'common.dq' | transloco }}">
                <table mat-table [dataSource]="(data.result.details.dq | keyvalue)" class="mat-elevation-z1 sticky-header dq-table">
                  <ng-container matColumnDef="metric">
                    <th mat-header-cell *matHeaderCellDef>Metric</th>
                    <td mat-cell *matCellDef="let k">{{ k.key }}</td>
                  </ng-container>
                  <ng-container matColumnDef="value">
                    <th mat-header-cell *matHeaderCellDef>Value</th>
                    <td mat-cell *matCellDef="let k">{{ k.value }}</td>
                  </ng-container>
                  <tr mat-header-row *matHeaderRowDef="['metric','value']"></tr>
                  <tr mat-row *matRowDef="let row; columns: ['metric','value']"></tr>
                </table>
              </mat-tab>
            </mat-tab-group>
          }
        }
        @case (13) {
          <p><strong>{{ 'dcma.c13.cpl' | transloco }}</strong> {{ data.result?.criticalPathLengthDays }} дн • <strong>{{ 'dcma.c13.ptf' | transloco }}</strong> {{ data.result?.projectTotalFloatDays }} дн • <strong>{{ 'dcma.c13.cpli' | transloco }}</strong> {{ data.result?.cpli }}</p>
        }
        @case (14) {
          <p><strong>{{ 'dcma.c14.bei' | transloco }}</strong> {{ data.result?.bei }} • <strong>{{ 'dcma.c14.ge095' | transloco }}</strong> {{ data.result?.beiWithin95pct ? 'Да' : 'Нет' }}</p>
          @if (data.result?.details?.plannedButNotCompleted?.length || data.result?.details?.completedAheadOfPlan?.length) {
            <mat-tab-group mat-stretch-tabs="false" mat-align-tabs="start">
              @if (data.result?.details?.plannedButNotCompleted?.length) {
                <mat-tab label="{{ 'dcma.c14.plannedNotCompleted' | transloco }} ({{ data.result.details.plannedButNotCompleted.length }})">
                  <cdk-virtual-scroll-viewport class="table-viewport" itemSize="48">
                    <table mat-table [dataSource]="data.result.details.plannedButNotCompleted" class="mat-elevation-z1 sticky-header">
                      <ng-container matColumnDef="code">
                        <th mat-header-cell *matHeaderCellDef>Code/ID</th>
                        <td mat-cell *matCellDef="let i">{{ i.task_code || i.task_id }}</td>
                      </ng-container>
                      <ng-container matColumnDef="name">
                        <th mat-header-cell *matHeaderCellDef>Name</th>
                        <td mat-cell *matCellDef="let i">{{ i.task_name }}</td>
                      </ng-container>
                      <ng-container matColumnDef="bl">
                        <th mat-header-cell *matHeaderCellDef>BL</th>
                        <td mat-cell *matCellDef="let i">{{ i.baseline_finish ? (i.baseline_finish | date:'mediumDate') : '—' }}</td>
                      </ng-container>
                      <tr mat-header-row *matHeaderRowDef="['code','name','bl']"></tr>
                      <tr mat-row *matRowDef="let row; columns: ['code','name','bl']"></tr>
                    </table>
              </cdk-virtual-scroll-viewport>
                </mat-tab>
              }
              @if (data.result?.details?.completedAheadOfPlan?.length) {
                <mat-tab label="{{ 'dcma.c14.completedAhead' | transloco }} ({{ data.result.details.completedAheadOfPlan.length }})">
                  <cdk-virtual-scroll-viewport class="table-viewport" itemSize="48">
                    <table mat-table [dataSource]="data.result.details.completedAheadOfPlan" class="mat-elevation-z1 sticky-header">
                      <ng-container matColumnDef="code">
                        <th mat-header-cell *matHeaderCellDef>Code/ID</th>
                        <td mat-cell *matCellDef="let i">{{ i.task_code || i.task_id }}</td>
                      </ng-container>
                      <ng-container matColumnDef="name">
                        <th mat-header-cell *matHeaderCellDef>Name</th>
                        <td mat-cell *matCellDef="let i">{{ i.task_name }}</td>
                      </ng-container>
                      <ng-container matColumnDef="af">
                        <th mat-header-cell *matHeaderCellDef>AF</th>
                        <td mat-cell *matCellDef="let i">{{ i.act_finish ? (i.act_finish | date:'mediumDate') : '—' }}</td>
                      </ng-container>
                      <ng-container matColumnDef="bl">
                        <th mat-header-cell *matHeaderCellDef>BL</th>
                        <td mat-cell *matCellDef="let i">{{ i.baseline_finish ? (i.baseline_finish | date:'mediumDate') : '—' }}</td>
                      </ng-container>
                      <tr mat-header-row *matHeaderRowDef="['code','name','af','bl']"></tr>
                      <tr mat-row *matRowDef="let row; columns: ['code','name','af','bl']"></tr>
                    </table>
                  </cdk-virtual-scroll-viewport>
                </mat-tab>
              }
            </mat-tab-group>
          }
        }
      }
    </div>
    <div mat-dialog-actions>
      <button mat-button mat-dialog-close> {{ 'common.close' | transloco }}</button>
    </div>
  `,
  styleUrls: ['./dcma-dialog.component.scss'], 
})
export class DcmaDetailsDialogComponent {
  constructor(@Inject(MAT_DIALOG_DATA) public data: any) {}
}