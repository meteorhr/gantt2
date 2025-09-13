import { CommonModule } from "@angular/common";
import { Component, Inject } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MAT_DIALOG_DATA, MatDialogModule } from "@angular/material/dialog";
import { MatIconModule } from "@angular/material/icon";
import { TranslocoModule } from "@jsverse/transloco";

@Component({
  standalone: true,
  selector: 'app-dcma-details-dialog',
  imports: [CommonModule, MatDialogModule, MatIconModule, MatButtonModule, TranslocoModule],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    @if (data.strictLogic) { <div class="badge">{{ 'dcma.details.strictLogic' | transloco }}</div> }
    <div mat-dialog-content class="content">
      @switch (data.check) {
        @case (1) {
          <p><strong>{{ 'dcma.c1.missingAny' | transloco }}</strong> {{ data.result?.percentMissingAny }}%</p>
          <p><strong>{{ 'dcma.c1.missingTriplet' | transloco }}</strong> {{ data.result?.missingPredecessor }}/{{ data.result?.missingSuccessor }}/{{ data.result?.missingBoth }}</p>
          @if (data.result?.details?.missingPredList?.length) {
            <details>
              <summary>{{ 'dcma.c1.missingPred' | transloco }} ({{ data.result.details.missingPredList.length }})</summary>
              <ul>
                @for (i of data.result.details.missingPredList; track i.task_id) {
                  <li>{{ i.task_code || i.task_id }} — {{ i.task_name }}</li>
                }
              </ul>
            </details>
          }
          @if (data.result?.details?.missingSuccList?.length) {
            <details>
              <summary>{{ 'dcma.c1.missingSucc' | transloco }} ({{ data.result.details.missingSuccList.length }})</summary>
              <ul>
                @for (i of data.result.details.missingSuccList; track i.task_id) {
                  <li>{{ i.task_code || i.task_id }} — {{ i.task_name }}</li>
                }
              </ul>
            </details>
          }
        }
        @case (2) {
          <p><strong>{{ 'dcma.c2.leads' | transloco }}</strong> {{ data.result?.leadCount }} / {{ data.result?.totalRelationships }} ({{ data.result?.leadPercent }}%)</p>
          @if (data.result?.details?.leads?.length) {
            <details>
              <summary>{{ 'dcma.c2.leadsList' | transloco }} ({{ data.result.details.leads.length }})</summary>
              <ul>
                @for (l of data.result.details.leads; track l.link_id) {
                  <li>{{ l.predecessor_code || l.predecessor_task_id }} → {{ l.successor_code || l.successor_task_id }} ({{ l.link_type }} {{ l.lag_days_8h }}д)</li>
                }
              </ul>
            </details>
          }
        }
        @case (3) {
          <p><strong>{{ 'dcma.c3.lags' | transloco }}</strong> {{ data.result?.lagCount }} / {{ data.result?.totalRelationships }} ({{ data.result?.lagPercent }}%)</p>
          @if (data.result?.details?.lags?.length) {
            <details>
              <summary>{{ 'dcma.c3.lagsList' | transloco }} ({{ data.result.details.lags.length }})</summary>
              <ul>
                @for (l of data.result.details.lags; track l.link_id) {
                  <li>{{ l.predecessor_code || l.predecessor_task_id }} → {{ l.successor_code || l.successor_task_id }} ({{ l.link_type }} +{{ l.lag_days_8h }}д)</li>
                }
              </ul>
            </details>
          }
        }
        @case (4) {
          <p><strong>{{ 'dcma.c4.fsPercent' | transloco }}</strong> {{ data.result?.percentFS }}%</p>
          @if (data.result?.details?.nonFsList?.length) {
            <details>
              <summary>{{ 'dcma.c4.nonFs' | transloco }} ({{ data.result.details.nonFsList.length }})</summary>
              <ul>
                @for (x of data.result.details.nonFsList; track x.link_id) {
                  <li>{{ x.predecessor_code || x.predecessor_task_id }} → {{ x.successor_code || x.successor_task_id }} ({{ x.link_type }})</li>
                }
              </ul>
            </details>
          }
        }
        @case (5) {
          <p><strong>{{ 'dcma.c5.hard' | transloco }}</strong> {{ data.result?.hardCount }} / {{ data.result?.totalWithConstraints }} ({{ data.result?.hardPercent }}%)</p>
          @if (data.result?.details?.hardList?.length) {
            <details>
              <summary>{{ 'dcma.c5.hardList' | transloco }} ({{ data.result.details.hardList.length }})</summary>
              <ul>
                @for (i of data.result.details.hardList; track i.task_id) {
                  <li>{{ i.task_code || i.task_id }} — {{ i.cstr_type }} {{ i.cstr_date || '' }}</li>
                }
              </ul>
            </details>
          }
        }
        @case (6) {
          <p><strong>{{ 'dcma.c6.highFloat' | transloco }}</strong> {{ data.result?.highFloatCount }} / {{ data.result?.totalEligible }} ({{ data.result?.highFloatPercent }}%)</p>
          @if (data.result?.details?.items?.length) {
            <details>
              <summary>{{ 'dcma.common.list' | transloco }} ({{ data.result.details.items.length }})</summary>
              <ul>
                @for (i of data.result.details.items; track i.task_id) {
                  <li>
                    {{ i.task_code || i.task_id }} — TF {{ i.total_float_hr_cnt }} ч ≈ {{ i.total_float_days_8h }} дн
                    @if (i.hours_per_day_used) { <span> (hpd={{ i.hours_per_day_used }})</span> }
                  </li>
                }
              </ul>
            </details>
          }
          @if (data.result?.details?.dq) {
            <details>
              <summary>{{ 'dcma.common.dq' | transloco }}</summary>
              <ul>
                @for (k of (data.result.details.dq | keyvalue); track k.key) {
                  <li>{{ k.key }}: {{ k.value }}</li>
                }
              </ul>
            </details>
          }
        }
        @case (7) {
          <p><strong>{{ 'dcma.c7.negativeFloat' | transloco }}</strong> {{ data.result?.negativeFloatCount }}</p>
          @if (data.result?.details?.items?.length) {
            <details>
              <summary>{{ 'dcma.common.list' | transloco }} ({{ data.result.details.items.length }})</summary>
              <ul>
                @for (i of data.result.details.items; track i.task_id) {
                  <li>
                    {{ i.task_code || i.task_id }} — TF {{ i.total_float_hr_cnt }} ч
                    @if (i.hours_per_day_used) { <span> (hpd={{ i.hours_per_day_used }})</span> }
                  </li>
                }
              </ul>
            </details>
          }
          @if (data.result?.details?.dq) {
            <details>
              <summary>{{ 'dcma.common.dq' | transloco }}</summary>
              <ul>
                @for (k of (data.result.details.dq | keyvalue); track k.key) {
                  <li>{{ k.key }}: {{ k.value }}</li>
                }
              </ul>
            </details>
          }
        }
        @case (8) {
          <p><strong>{{ 'dcma.c8.highDuration' | transloco }}</strong> {{ data.result?.highDurationCount }} / {{ data.result?.totalEligible }} ({{ data.result?.highDurationPercent }}%)</p>
          @if (data.result?.details?.items?.length) {
            <details>
              <summary>{{ 'dcma.common.list' | transloco }} ({{ data.result.details.items.length }})</summary>
              <ul>
                @for (i of data.result.details.items; track i.task_id) {
                  <li>
                    {{ i.task_code || i.task_id }} — Remain {{ i.remain_dur_hr_cnt }} ч (≈ {{ i.remain_dur_days_8h }} дн)
                    @if (i.hours_per_day_used) { <span> (hpd={{ i.hours_per_day_used }})</span> }
                  </li>
                }
              </ul>
            </details>
          }
          @if (data.result?.details?.dq) {
            <details>
              <summary>{{ 'dcma.common.dq' | transloco }}</summary>
              <ul>
                @for (k of (data.result.details.dq | keyvalue); track k.key) {
                  <li>{{ k.key }}: {{ k.value }}</li>
                }
              </ul>
            </details>
          }
        }
        @case (9) {
          <p><strong>{{ 'dcma.c9.invalidForecast' | transloco }}</strong> {{ data.result?.invalidForecastCount }} • <strong>{{ 'dcma.c9.invalidActual' | transloco }}</strong> {{ data.result?.invalidActualCount }}</p>
          @if (data.result?.details?.forecast?.length) {
            <details>
              <summary>{{ 'dcma.c9.forecastList' | transloco }} ({{ data.result.details.forecast.length }})</summary>
              <ul>
                @for (i of data.result.details.forecast; track i.task_id) {
                  <li>{{ i.task_code || i.task_id }} — ES {{ i.early_start_date || '—' }}, EF {{ i.early_end_date || '—' }}, LS {{ i.late_start_date || '—' }}, LF {{ i.late_end_date || '—' }}</li>
                }
              </ul>
            </details>
          }
          @if (data.result?.details?.actual?.length) {
            <details>
              <summary>{{ 'dcma.c9.actualList' | transloco }} ({{ data.result.details.actual.length }})</summary>
              <ul>
                @for (i of data.result.details.actual; track i.task_id) {
                  <li>{{ i.task_code || i.task_id }} — AS {{ i.act_start_date || '—' }}, AF {{ i.act_end_date || '—' }}</li>
                }
              </ul>
            </details>
          }
        }
        @case (10) {
          <p><strong>{{ 'dcma.c10.withoutResources' | transloco }}</strong> {{ data.result?.withoutResourceCount }} / {{ data.result?.totalEligible }} ({{ data.result?.percentWithoutResource }}%)</p>
          @if (data.result?.details?.items?.length) {
            <details>
              <summary>{{ 'dcma.common.list' | transloco }} ({{ data.result.details.items.length }})</summary>
              <ul>
                @for (i of data.result.details.items; track i.task_id) {
                  <li>
                    {{ i.task_code || i.task_id }} — {{ i.eff_dur_hr_cnt }} ч (≈ {{ i.eff_dur_days }} дн)
                    @if (i.hours_per_day_used) { <span> (hpd={{ i.hours_per_day_used }})</span> }
                  </li>
                }
              </ul>
            </details>
          }
          @if (data.result?.details?.dq) {
            <details>
              <summary>{{ 'dcma.common.dq' | transloco }}</summary>
              <ul>
                @for (k of (data.result.details.dq | keyvalue); track k.key) {
                  <li>{{ k.key }}: {{ k.value }}</li>
                }
              </ul>
            </details>
          }
        }
        @case (11) {
          <p><strong>{{ 'dcma.c11.missed' | transloco }}</strong> {{ data.result?.missedCount }} / {{ data.result?.totalCompleted }} ({{ data.result?.missedPercent }}%)</p>
          @if (data.result?.details?.items?.length) {
            <details>
              <summary>{{ 'dcma.common.list' | transloco }} ({{ data.result.details.items.length }})</summary>
              <ul>
                @for (i of data.result.details.items; track i.task_id) {
                  <li>{{ i.task_code || i.task_id }} — AF {{ i.act_finish || '—' }}, BL {{ i.baseline_finish || '—' }}</li>
                }
              </ul>
            </details>
          }
        }
        @case (12) {
          <p><strong>{{ 'dcma.c12.criticalTasks' | transloco }}</strong> {{ data.result?.criticalCount }} • <strong>{{ 'dcma.c12.singleChain' | transloco }}</strong> {{ data.result?.isSingleChain ? 'Да' : 'Нет' }} • <strong>{{ 'dcma.c12.endsAtPf' | transloco }}</strong> {{ data.result?.reachedProjectFinish ? 'Да' : 'Нет' }}</p>
          <p><strong>{{ 'dcma.c12.startNodes' | transloco }}</strong> {{ data.result?.startNodesOnCP }} • <strong>{{ 'dcma.c12.endNodes' | transloco }}</strong> {{ data.result?.endNodesOnCP }}</p>
          @if (data.result?.details?.dq) {
            <details>
              <summary>{{ 'dcma.common.dq' | transloco }}</summary>
              <ul>
                @for (k of (data.result.details.dq | keyvalue); track k.key) {
                  <li>{{ k.key }}: {{ k.value }}</li>
                }
              </ul>
            </details>
          }
        }
        @case (13) {
          <p><strong>{{ 'dcma.c13.cpl' | transloco }}</strong> {{ data.result?.criticalPathLengthDays }} дн • <strong>{{ 'dcma.c13.ptf' | transloco }}</strong> {{ data.result?.projectTotalFloatDays }} дн • <strong>{{ 'dcma.c13.cpli' | transloco }}</strong> {{ data.result?.cpli }}</p>
        }
        @case (14) {
          <p><strong>{{ 'dcma.c14.bei' | transloco }}</strong> {{ data.result?.bei }} • <strong>{{ 'dcma.c14.ge095' | transloco }}</strong> {{ data.result?.beiWithin95pct ? 'Да' : 'Нет' }}</p>
          @if (data.result?.details?.plannedButNotCompleted?.length) {
            <details>
              <summary>{{ 'dcma.c14.plannedNotCompleted' | transloco }} ({{ data.result.details.plannedButNotCompleted.length }})</summary>
              <ul>
                @for (i of data.result.details.plannedButNotCompleted; track i.task_id) {
                  <li>{{ i.task_code || i.task_id }} — BL {{ i.baseline_finish || '—' }}</li>
                }
              </ul>
            </details>
          }
          @if (data.result?.details?.completedAheadOfPlan?.length) {
            <details>
              <summary>{{ 'dcma.c14.completedAhead' | transloco }} ({{ data.result.details.completedAheadOfPlan.length }})</summary>
              <ul>
                @for (i of data.result.details.completedAheadOfPlan; track i.task_id) {
                  <li>{{ i.task_code || i.task_id }} — AF {{ i.act_finish || '—' }}, BL {{ i.baseline_finish || '—' }}</li>
                }
              </ul>
            </details>
          }
        }
      }
    </div>
    <div mat-dialog-actions>
      <button mat-button mat-dialog-close><mat-icon>close</mat-icon> {{ 'dcma.common.close' | transloco }}</button>
    </div>
  `,
  styles: [
    `.content { max-height: 70vh; overflow: auto; }`,
    `.badge { display:inline-block; margin: 4px 0 8px; padding: 2px 8px; border-radius: 12px; background:#e3f2fd; color:#0d47a1; font-size:12px; }`
  ]
})
export class DcmaDetailsDialogComponent {
  constructor(@Inject(MAT_DIALOG_DATA) public data: any) {}
}