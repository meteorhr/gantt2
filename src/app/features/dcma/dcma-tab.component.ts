import { Component, inject, signal, Inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialog, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import {
  DcmaCheck1Result,
  DcmaCheck2Result,
  DcmaCheck3Result,
  DcmaCheck4Result,
  DcmaCheck5Result,
  DcmaCheck6Result,
  DcmaCheck7Result,
  DcmaCheck8Result,
  DcmaCheck9Result,
  DcmaCheck10Result,
  DcmaCheck11Result,
  DcmaCheck12Result,
  DcmaCheck13Result,
  DcmaCheck14Result,
} from '../../p6/services/dcma.model';
import { DcmaCheck1Service } from '../../p6/services/dcma.service';
import { AppStateService } from '../../state/app-state.service';
import { TranslocoModule } from '@jsverse/transloco';
import { DcmaDetailsDialogComponent } from './dialog/dcma-dialog.component';
import { DcmaInfoDialogComponent } from './dialog/dcma-dialog-info.component';
import { DcmaSettingsDialogComponent } from './dialog/dcma-settings-dialog.component';
import { DcmaCheckId } from './services/dcma-settings.service';



interface DcmaRow {
  check: DcmaCheckId;
  metric: string;
  description: string;
  percent?: number | null;
  passed: boolean;
  result: any;
}

@Component({
  standalone: true,
  selector: 'app-dcma-checks',
  imports: [CommonModule, MatTableModule, MatIconModule, MatButtonModule, MatDialogModule, TranslocoModule],
  styleUrls: ['./dcma-tab.component.scss'],
  template: `
    <div class="dash-viewport">
      <div class="dcma-header">
        <h3>{{ 'dcma.summary.title' | transloco }}</h3>
        <span class="fx"></span>
        <button mat-stroked-button (click)="openSettings()" aria-label="Настройки DCMA">
          <mat-icon>settings</mat-icon>
          <span>{{ 'common.settings' | transloco }}</span>
        </button>
      </div>

      @if (loading()) { <p>{{ 'common.loading' | transloco }}</p> } @else {
        <table mat-table [dataSource]="rows()" class="mat-elevation-z1 fullw">
          <ng-container matColumnDef="check">
            <th mat-header-cell *matHeaderCellDef>{{ 'dcma.table.check' | transloco }}</th>
            <td mat-cell *matCellDef="let r">{{ r.check }}</td>
            
          </ng-container>
          <ng-container matColumnDef="metric">
            <th mat-header-cell *matHeaderCellDef>{{ 'dcma.table.metric' | transloco }}</th>
            <td mat-cell *matCellDef="let r">
              <button mat-button aria-label="Info" (click)="openInfo(r)">
                {{ r.metric }}
                <mat-icon>info</mat-icon>
              </button>
            </td>
          </ng-container>
          <ng-container matColumnDef="description">
            <th mat-header-cell *matHeaderCellDef>{{ 'dcma.table.description' | transloco }}</th>
            <td mat-cell *matCellDef="let r">{{ r.description }}</td>
          </ng-container>
          <ng-container matColumnDef="percent">
            <th mat-header-cell *matHeaderCellDef>{{ 'dcma.table.percent' | transloco }}</th>
            <td mat-cell *matCellDef="let r">{{ r.percent === null || r.percent === undefined ? '—' : r.percent }}</td>
          </ng-container>
          <ng-container matColumnDef="passed">
            <th mat-header-cell *matHeaderCellDef>{{ 'dcma.table.passed' | transloco }}</th>
            <td mat-cell *matCellDef="let r"><mat-icon [ngClass]="r.passed ? 'ok' : 'bad'">{{ r.passed ? 'check_circle' : 'cancel' }}</mat-icon></td>
          </ng-container>

          <ng-container matColumnDef="details">
            <th mat-header-cell *matHeaderCellDef>{{ 'dcma.table.details' | transloco }}</th>
            <td mat-cell *matCellDef="let r">
              <button mat-button (click)="openDetails(r)"><mat-icon>list</mat-icon> {{ 'dcma.table.btnDetails' | transloco }}
            </button></td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
          <tr mat-row *matRowDef="let row; columns: displayedColumns"></tr>
        </table>
      }
    </div>
  `,
})
export class DcmaChecksComponent {

  private svc = inject(DcmaCheck1Service);
  private wm = inject(AppStateService);
  displayedColumns = ['check', 'metric', 'description', 'percent', 'passed', 'details'];
  rows = signal<DcmaRow[]>([]);
  private dialog = inject(MatDialog);

  projId = signal<number>(this.wm.selectedProjectId()!);
  loading = signal<boolean>(false);
  r1 = signal<DcmaCheck1Result | null>(null);
  r2 = signal<DcmaCheck2Result | null>(null);
  r3 = signal<DcmaCheck3Result | null>(null);
  r4 = signal<DcmaCheck4Result | null>(null);
  r5 = signal<DcmaCheck5Result | null>(null);
  r6 = signal<DcmaCheck6Result | null>(null);
  r7 = signal<DcmaCheck7Result | null>(null);
  r8 = signal<DcmaCheck8Result | null>(null);
  r9 = signal<DcmaCheck9Result | null>(null);
  r10 = signal<DcmaCheck10Result | null>(null);
  r11 = signal<DcmaCheck11Result | null>(null);
  r12 = signal<DcmaCheck12Result | null>(null);
  r13 = signal<DcmaCheck13Result | null>(null);
  r14 = signal<DcmaCheck14Result | null>(null);
  constructor() { this.run(); }
  


  async run() {
    this.loading.set(true);
    try {
      const [check1, check2, check3, check4, check5, check6, check7, check8, check9, check10, check11, check12, check13, check14] = await Promise.all([
        this.svc.analyzeCheck1(this.projId(), {
          excludeCompleted: true,
          excludeLoEAndHammock: true,
          ignoreLoEAndHammockLinksInLogic: true, 
          treatMilestonesAsExceptions: true,
          includeLists: true,
          includeDQ: true,
        }),
        this.svc.analyzeCheck2(this.projId(), true),
        this.svc.analyzeCheck3(this.projId(), true),
        this.svc.analyzeCheck4(this.projId(), true),
        this.svc.analyzeCheck5(this.projId(), true),
        this.svc.analyzeCheck6(this.projId(), true),
        this.svc.analyzeCheck7(this.projId(), true),
        this.svc.analyzeCheck8(this.projId(), true),
        this.svc.analyzeCheck9(this.projId(), true),
        this.svc.analyzeCheck10(this.projId(), true, 8),
        this.svc.analyzeCheck11(this.projId(), true),
        this.svc.analyzeCheck12(this.projId(), true, { hoursPerDay: 8 }),
        this.svc.analyzeCheck13(this.projId(), { hoursPerDay: 8 }),
        this.svc.analyzeCheck14(this.projId(), true),
      ]);
      this.r1.set(check1);
      this.r2.set(check2);
      this.r3.set(check3);
      this.r4.set(check4);
      this.r5.set(check5);
      this.r6.set(check6);
      this.r7.set(check7);
      this.r8.set(check8);
      this.r9.set(check9);
      this.r10.set(check10);
      this.r11.set(check11);
      this.r12.set(check12);
      this.r13.set(check13);
      this.r14.set(check14);
      this.buildRows();
    } finally {
      this.loading.set(false);
    }
  }



  openDetails(row: any) {
    this.dialog.open(DcmaDetailsDialogComponent, {
      width: '900px',
      maxWidth: '900px',
      data: { title: `DCMA Check ${row.check} — ${row.metric}`, check: row.check, result: row.result, strictLogic: row.check === 1 },
    });
  }

  openInfo(row: any) {
    this.dialog.open(DcmaInfoDialogComponent, {
      width: '640px',
      maxWidth: '80vw',
      data: { check: row.check },
    });
  }

  openSettings() {
    const ref = this.dialog.open(DcmaSettingsDialogComponent, {
      width: '940px',
      maxWidth: '90vw',
      data: { startCheckId: 1 },
    });
    ref.afterClosed().subscribe(res => {
      // Если настройки изменились — пересчёт
      if (res?.saved) this.run();
      else this.buildRows(); // на случай, если меняли только видимость
    });
  }

  filteredRows = computed(() => {
    const map = this.cfg.settings();
    return this.rows().filter(r => map[r.check].showInTable !== false);
  });

  private buildRows() {
    type RowT = { check: DcmaCheckId; metric: string; description: string; percent: number | null; passed: boolean; result: any };
    const rows: RowT[] = [];
    const push = (check: DcmaCheckId, metric: string, description: string, percent: number | null, passed: boolean, result: any) =>
      rows.push({ check, metric, description, percent, passed, result });

    const r1 = this.r1(); if (r1) push(1 as DcmaCheckId, 'Logic', `Missing any: ${r1.uniqueMissingAny}/${r1.totalEligible}`, r1.percentMissingAny, r1.percentMissingAny <= 5, r1);
    const r2 = this.r2(); if (r2) push(2 as DcmaCheckId, 'Leads', `Lead links: ${r2.leadCount}/${r2.totalRelationships}`, r2.leadPercent, r2.leadCount === 0, r2);
    const r3 = this.r3(); if (r3) push(3 as DcmaCheckId, 'Lags', `Lag links: ${r3.lagCount}/${r3.totalRelationships}`, r3.lagPercent, r3.lagPercent <= 5, r3);
    const r4 = this.r4(); if (r4) push(4 as DcmaCheckId, 'Relationship Types', `FS: ${r4.countFS} (of ${r4.totalRelationships})`, r4.percentFS, r4.percentFS >= 90, r4);
    const r5 = this.r5(); if (r5) push(5 as DcmaCheckId, 'Hard Constraints', `Hard: ${r5.hardCount}/${r5.totalWithConstraints}`, r5.hardPercent, r5.hardPercent <= 5, r5);
    const r6 = this.r6(); if (r6) push(6 as DcmaCheckId, 'High Float', `High TF: ${r6.highFloatCount}/${r6.totalEligible}`, r6.highFloatPercent, r6.highFloatPercent <= 5, r6);
    const r7 = this.r7(); if (r7) push(7 as DcmaCheckId, 'Negative Float', `Neg TF count: ${r7.negativeFloatCount}`, null, !r7.hasNegativeFloat, r7);
    const r8 = this.r8(); if (r8) push(8 as DcmaCheckId, 'High Duration', `>44d remain: ${r8.highDurationCount}/${r8.totalEligible}`, r8.highDurationPercent, r8.highDurationPercent <= 5, r8);
    const r9 = this.r9(); if (r9) push(9 as DcmaCheckId, 'Invalid Dates', `9a: ${r9.invalidForecastCount} • 9b: ${r9.invalidActualCount}`, null, !r9.hasInvalidDates, r9);
    const r10 = this.r10(); if (r10) push(10 as DcmaCheckId, 'Resources', `No resources: ${r10.withoutResourceCount}/${r10.totalEligible}`, r10.percentWithoutResource, r10.withoutResourceCount === 0, r10);
    const r11 = this.r11(); if (r11) push(11 as DcmaCheckId, 'Missed Tasks', `Missed: ${r11.missedCount}/${r11.totalCompleted}`, r11.missedPercent, r11.missedPercent <= 5, r11);
    const r12 = this.r12(); if (r12) push(12 as DcmaCheckId, 'Critical Path Test', `Single chain & ends at PF: ${r12.isSingleChain && r12.reachedProjectFinish ? 'OK' : 'Issue'}`, null, !!r12.testPassLikely, r12);
    const r13 = this.r13(); if (r13) push(13 as DcmaCheckId, 'CPLI', `CPL: ${r13.criticalPathLengthDays} • PTF: ${r13.projectTotalFloatDays}`, r13.cpli ?? null, !!r13.cpliWithin5pct, r13);
    const r14 = this.r14(); if (r14) push(14 as DcmaCheckId, 'BEI', `Planned/Actual: ${r14.plannedToComplete}/${r14.actuallyCompleted}`, r14.bei ?? null, !!r14.beiWithin95pct, r14);
    this.rows.set(rows);
  }
}