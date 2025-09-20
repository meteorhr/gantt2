import { Component, inject, signal, computed } from '@angular/core'; 
import { CommonModule } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { TranslocoModule } from '@jsverse/transloco';

import { AppStateService } from '../../state/app-state.service';
import {
  DcmaCheck1Service, DcmaCheck2Service, DcmaCheck3Service, DcmaCheck4Service,
  DcmaCheck5Service, DcmaCheck6Service, DcmaCheck7Service, DcmaCheck8Service,
  DcmaCheck9Service, DcmaCheck10Service, DcmaCheck11Service, DcmaCheck12Service,
  DcmaCheck13Service, DcmaCheck14Service,
} from '../../p6/services/dcma';

import {
  DcmaCheck10Result, DcmaCheck11Result, DcmaCheck12Result, DcmaCheck13Result, DcmaCheck14Result,
  DcmaCheck2Result, DcmaCheck3Result, DcmaCheck4Result, DcmaCheck5Result, DcmaCheck6Result,
  DcmaCheck7Result, DcmaCheck8Result, DcmaCheck9Result
} from '../../p6/services/dcma/models/dcma.model';
import { DcmaDetailsDialogComponent } from './dialog/details/dcma-dialog.component';
import { DcmaInfoDialogComponent } from './dialog/info/dcma-dialog-info.component';
import { DcmaSettingsDialogComponent } from './dialog/settings/dcma-settings-dialog.component';

import { DcmaCheck1Result } from '../../p6/services/dcma/models/check1.model';

// ВАЖНО: теперь типы и сервис берём отсюда
import { DcmaSettingsService, DcmaCheckId } from './services/dcma-settings.service';

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
        <button mat-button (click)="openSettings()" aria-label="Настройки DCMA">
          <mat-icon>settings</mat-icon>
          <span>{{ 'common.settings' | transloco }}</span>
        </button>
      </div>

      @if (loading()) { <p>{{ 'common.loading' | transloco }}</p> } @else {
        <table mat-table [dataSource]="filteredRows()" class="mat-elevation-z1 fullw">
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
            <td mat-cell *matCellDef="let r">{{ (r.percent === null || r.percent === undefined) ? '—' : (r.percent | number:'1.0-2') }}</td>
          </ng-container>

          <ng-container matColumnDef="passed">
            <th mat-header-cell *matHeaderCellDef>{{ 'dcma.table.passed' | transloco }}</th>
            <td mat-cell *matCellDef="let r">
              <mat-icon [ngClass]="r.passed ? 'ok' : 'bad'">
                {{ r.passed ? 'check_circle' : 'cancel' }}
              </mat-icon>
            </td>
          </ng-container>

          <ng-container matColumnDef="details">
            <th mat-header-cell *matHeaderCellDef>{{ 'dcma.table.details' | transloco }}</th>
            <td mat-cell *matCellDef="let r">
              <button mat-button (click)="openDetails(r)">
                <mat-icon>list</mat-icon> {{ 'dcma.table.btnDetails' | transloco }}
              </button>
            </td>
          </ng-container>

          <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
          <tr mat-row *matRowDef="let row; columns: displayedColumns"></tr>
        </table>
      }
    </div>
  `,
})
export class DcmaChecksComponent {
  private svc1 = inject(DcmaCheck1Service);
  private svc2 = inject(DcmaCheck2Service);
  private svc3 = inject(DcmaCheck3Service);
  private svc4 = inject(DcmaCheck4Service);
  private svc5 = inject(DcmaCheck5Service);
  private svc6 = inject(DcmaCheck6Service);
  private svc7 = inject(DcmaCheck7Service);
  private svc8 = inject(DcmaCheck8Service);
  private svc9 = inject(DcmaCheck9Service);
  private svc10 = inject(DcmaCheck10Service);
  private svc11 = inject(DcmaCheck11Service);
  private svc12 = inject(DcmaCheck12Service);
  private svc13 = inject(DcmaCheck13Service);
  private svc14 = inject(DcmaCheck14Service);

  private wm = inject(AppStateService);
  private cfg = inject(DcmaSettingsService);
  private dialog = inject(MatDialog);

  displayedColumns = ['check', 'metric', 'description', 'percent', 'passed', 'details'];
  rows = signal<DcmaRow[]>([]);
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

  constructor() {
    // 1) гарантируем дефолты в localStorage и загрузку настроек
    this.cfg.ensureInitialized();
    // 2) сразу запускаем расчеты с учетом включенности чеков
    this.run();
  }

  filteredRows = computed(() => {
    const map = this.cfg.settings();
    return this.rows().filter(r => (map[r.check]?.showInTable ?? true));
  });

  async run() {
    this.loading.set(true);
    try {
      const s = this.cfg.settings();
      const id = this.projId();

      const p1  = s[1].enabled  ? this.svc1.analyzeCheck1(id, this.cfg.buildCheck1Options()) : Promise.resolve(null);
      const p2  = s[2].enabled ? this.svc2.analyzeCheck2(id, true, this.cfg.buildCheck2Options()) : Promise.resolve(null);
      const p3  = s[3].enabled ? this.svc3.analyzeCheck3(id, true, this.cfg.buildCheck3Options()) : Promise.resolve(null);
      const p4  = s[4].enabled ? this.svc4.analyzeCheck4(id, true, this.cfg.buildCheck4Options()) : Promise.resolve(null);

      const p5  = s[5].enabled  ? this.svc5.analyzeCheck5(id, true) : Promise.resolve(null);
      const p6  = s[6].enabled  ? this.svc6.analyzeCheck6(id, true) : Promise.resolve(null);
      const p7  = s[7].enabled  ? this.svc7.analyzeCheck7(id, true) : Promise.resolve(null);
      const p8  = s[8].enabled  ? this.svc8.analyzeCheck8(id, true) : Promise.resolve(null);
      const p9  = s[9].enabled  ? this.svc9.analyzeCheck9(id, true) : Promise.resolve(null);
      const p10 = s[10].enabled ? this.svc10.analyzeCheck10(id, true, 8) : Promise.resolve(null);
      const p11 = s[11].enabled ? this.svc11.analyzeCheck11(id, true) : Promise.resolve(null);
      const p12 = s[12].enabled ? this.svc12.analyzeCheck12(id, true, { hoursPerDay: 8 }) : Promise.resolve(null);
      const p13 = s[13].enabled ? this.svc13.analyzeCheck13(id, { hoursPerDay: 8 }) : Promise.resolve(null);
      const p14 = s[14].enabled ? this.svc14.analyzeCheck14(id, true) : Promise.resolve(null);

      const [
        check1, check2, check3, check4, check5, check6, check7, check8, check9,
        check10, check11, check12, check13, check14
      ] = await Promise.all([p1,p2,p3,p4,p5,p6,p7,p8,p9,p10,p11,p12,p13,p14]);

      this.r1.set(check1);   this.r2.set(check2);   this.r3.set(check3);   this.r4.set(check4);
      this.r5.set(check5);   this.r6.set(check6);   this.r7.set(check7);   this.r8.set(check8);
      this.r9.set(check9);   this.r10.set(check10); this.r11.set(check11); this.r12.set(check12);
      this.r13.set(check13); this.r14.set(check14);

      this.buildRows();
    } finally {
      this.loading.set(false);
    }
  }

  openDetails(row: any) {
    const strictLogic = row.check === 1;
    this.dialog.open(DcmaDetailsDialogComponent, {
      width: '900px',
      maxWidth: '900px',
      data: { title: `DCMA Check ${row.check} — ${row.metric}`, check: row.check, result: row.result, strictLogic },
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
      if (res?.saved) this.run(); // настройки изменились — пересчитать
      else this.buildRows();      // могли поменять только видимость
    });
  }

  private buildRows() {
    type RowT = { check: DcmaCheckId; metric: string; description: string; percent: number | null; passed: boolean; result: any };
    const rows: RowT[] = [];
    const push = (check: DcmaCheckId, metric: string, description: string, percent: number | null, passed: boolean, result: any) =>
      rows.push({ check, metric, description, percent, passed, result });

    const r1 = this.r1(); if (r1) push(1 as DcmaCheckId, 'Logic', `Missing any: ${r1.uniqueMissingAny}/${r1.totalEligible}`, r1.percentMissingAny, r1.percentMissingAny <= 5, r1);
    const r2 = this.r2();
    if (r2) {
      const grade = this.cfg.evaluateCheck2Grade(r2.leadPercent);
      const label = grade === 'great' ? 'Great' : grade === 'average' ? 'Average' : 'Poor';
      push(2 as DcmaCheckId, 'Leads',
        `Lead links: ${r2.leadCount}/${r2.totalRelationships} • ${label}`,
        r2.leadPercent,
        this.cfg.evaluateCheck2Pass(r2),
        r2);
    }
    const r3 = this.r3();
    if (r3) {
      const grade3 = this.cfg.evaluateCheck3Grade(r3.lagPercent);
      const label3 = grade3 === 'great' ? 'Great' : grade3 === 'average' ? 'Average' : 'Poor';
      push(3 as DcmaCheckId, 'Lags',
        `Lag links: ${r3.lagCount}/${r3.totalRelationships} • ${label3}`,
        r3.lagPercent,
        this.cfg.evaluateCheck3Pass(r3 as any),
        r3);
    }
    const r4 = this.r4();
    if (r4) {
      const grade4 = this.cfg.evaluateCheck4Grade(r4.percentFS);
      const label4 = grade4 === 'great' ? 'Great' : grade4 === 'average' ? 'Average' : 'Poor';
      push(4 as DcmaCheckId, 'Relationship Types',
        `FS: ${r4.countFS} (of ${r4.totalRelationships}) • ${label4}`,
        r4.percentFS,
        this.cfg.evaluateCheck4Pass(r4.percentFS),
        r4);
    }
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
