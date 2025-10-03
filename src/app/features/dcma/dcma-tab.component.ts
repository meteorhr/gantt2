import {
  Component, inject, signal, computed,
  ViewChild, ElementRef, AfterViewInit, OnDestroy, ViewChildren, QueryList, Type, ViewEncapsulation
} from '@angular/core';
import { CommonModule, NgComponentOutlet } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { MatTabsModule } from '@angular/material/tabs';
import { CdkVirtualScrollViewport, ScrollingModule } from '@angular/cdk/scrolling';
import { CdkTableModule } from '@angular/cdk/table';

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

import { DcmaCheck1Result } from '../../p6/services/dcma/models/check1.model';
import { DcmaInfoDialogComponent } from './dialog/info/dcma-dialog-info.component';
import { DcmaSettingsDialogComponent } from './dialog/settings/dcma-settings-dialog.component';

import { DcmaSettingsService, DcmaCheckId } from './services/adv/dcma-settings.service';
import { getZoneByPercent, Grade, ZONE_COLORS } from './services/adv/dcma-checks.config';

// НОВОЕ: общий интерфейс строки вынесен в отдельный файл
import { DcmaRow } from './details/models/dcma-row.model';

// НОВОЕ: импорт компонентов деталей
import { DcmaCheck1DetailsComponent }  from './details/dcma-check1-details.component';
import { DcmaCheck2DetailsComponent }  from './details/dcma-check2-details.component';
import { DcmaCheck3DetailsComponent }  from './details/dcma-check3-details.component';
import { DcmaCheck4DetailsComponent }  from './details/dcma-check4-details.component';
import { DcmaCheck5DetailsComponent }  from './details/dcma-check5-details.component';
import { DcmaCheck6DetailsComponent }  from './details/dcma-check6-details.component';
import { DcmaCheck7DetailsComponent }  from './details/dcma-check7-details.component';
import { DcmaCheck8DetailsComponent }  from './details/dcma-check8-details.component';
import { DcmaCheck9DetailsComponent }  from './details/dcma-check9-details.component';
import { DcmaCheck10DetailsComponent } from './details/dcma-check10-details.component';
import { DcmaCheck11DetailsComponent } from './details/dcma-check11-details.component';
import { DcmaCheck12DetailsComponent } from './details/dcma-check12-details.component';
import { DcmaCheck13DetailsComponent } from './details/dcma-check13-details.component';
import { DcmaCheck14DetailsComponent } from './details/dcma-check14-details.component';

@Component({
  standalone: true,
  selector: 'app-dcma-checks',
  imports: [
    CommonModule,
    NgComponentOutlet,
    MatTableModule,
    MatIconModule,
    MatButtonModule,
    MatDialogModule,
    TranslocoModule,
    MatTabsModule,
    ScrollingModule,
    CdkTableModule
  ],
  styleUrls: ['./dcma-tab.component.scss'],
  templateUrl: './dcma-tab.component.html',
  encapsulation: ViewEncapsulation.Emulated
})
export class DcmaChecksComponent implements AfterViewInit, OnDestroy {
  // --- сервисы
  private svc1  = inject(DcmaCheck1Service);
  private svc2  = inject(DcmaCheck2Service);
  private svc3  = inject(DcmaCheck3Service);
  private svc4  = inject(DcmaCheck4Service);
  private svc5  = inject(DcmaCheck5Service);
  private svc6  = inject(DcmaCheck6Service);
  private svc7  = inject(DcmaCheck7Service);
  private svc8  = inject(DcmaCheck8Service);
  private svc9  = inject(DcmaCheck9Service);
  private svc10 = inject(DcmaCheck10Service);
  private svc11 = inject(DcmaCheck11Service);
  private svc12 = inject(DcmaCheck12Service);
  private svc13 = inject(DcmaCheck13Service);
  private svc14 = inject(DcmaCheck14Service);

  private wm = inject(AppStateService);
  private cfg = inject(DcmaSettingsService);
  private dialog = inject(MatDialog);
  private i18n = inject(TranslocoService);

  @ViewChildren(CdkVirtualScrollViewport)
  private viewports!: QueryList<CdkVirtualScrollViewport>;

  // --- UI state
  animFlip = signal<boolean>(false);

  zone = {
    poor: ZONE_COLORS.poor,
    average: ZONE_COLORS.average,
    great: ZONE_COLORS.great,
  };

  readonly ITEM_SIZE = 44;

  displayedColumns = ['check', 'metric', 'percent'];
  selectedRow = signal<DcmaRow | null>(null);
  @ViewChild('rightPane') rightPane?: ElementRef<HTMLElement>;
  rows = signal<DcmaRow[]>([]);
  projId = signal<number>(this.wm.selectedProjectId()!);
  loading = signal<boolean>(false);

  // результаты чеков
  r1  = signal<DcmaCheck1Result | null>(null);
  r2  = signal<DcmaCheck2Result | null>(null);
  r3  = signal<DcmaCheck3Result | null>(null);
  r4  = signal<DcmaCheck4Result | null>(null);
  r5  = signal<DcmaCheck5Result | null>(null);
  r6  = signal<DcmaCheck6Result | null>(null);
  r7  = signal<DcmaCheck7Result | null>(null);
  r8  = signal<DcmaCheck8Result | null>(null);
  r9  = signal<DcmaCheck9Result | null>(null);
  r10 = signal<DcmaCheck10Result | null>(null);
  r11 = signal<DcmaCheck11Result | null>(null);
  r12 = signal<DcmaCheck12Result | null>(null);
  r13 = signal<DcmaCheck13Result | null>(null);
  r14 = signal<DcmaCheck14Result | null>(null);

  constructor() {
    this.cfg.ensureInitialized();
    this.run();
  }

  // --- динамический выбор компонента по checkId
  private readonly detailsMap: Record<number, Type<any>> = {
    1:  DcmaCheck1DetailsComponent,
    2:  DcmaCheck2DetailsComponent,
    3:  DcmaCheck3DetailsComponent,
    4:  DcmaCheck4DetailsComponent,
    5:  DcmaCheck5DetailsComponent,
    6:  DcmaCheck6DetailsComponent,
    7:  DcmaCheck7DetailsComponent,
    8:  DcmaCheck8DetailsComponent,
    9:  DcmaCheck9DetailsComponent,
    10: DcmaCheck10DetailsComponent,
    11: DcmaCheck11DetailsComponent,
    12: DcmaCheck12DetailsComponent,
    13: DcmaCheck13DetailsComponent,
    14: DcmaCheck14DetailsComponent,
  };

  detailsComponentFor(check: number | null | undefined): Type<any> | null {
    if (!check) return null;
    return this.detailsMap[check] ?? null;
  }

  // фильтрация строки по видимости в настройках
  filteredRows = computed(() => {
    const map = this.cfg.settings();
    return this.rows().filter(r => (map[r.check]?.showInTable ?? true));
  });

  // утилиты зон/меток
  greatPerfText(row: { check: number }): string {
    switch (row.check) {
      case 1:  return this.i18n.translate('dcma.greatPerf.percentLE', { value: this.cfg.adv1().thresholds.greatPct });
      case 2:  return this.i18n.translate('dcma.greatPerf.percentLE', { value: this.cfg.adv2().thresholds.greatPct });
      case 3:  return this.i18n.translate('dcma.greatPerf.percentLE', { value: this.cfg.adv3().thresholds.greatPct });
      case 5:  return this.i18n.translate('dcma.greatPerf.percentLE', { value: this.cfg.adv5().thresholds.greatMaxPct });
      case 6:  return this.i18n.translate('dcma.greatPerf.percentLE', { value: this.cfg.adv6().thresholds.greatMaxPct });
      case 7:  return this.i18n.translate('dcma.greatPerf.percentLE', { value: this.cfg.adv7().mode.thresholds.greatMaxPct });
      case 8:  return this.i18n.translate('dcma.greatPerf.percentLE', { value: this.cfg.adv8().thresholds.greatMaxPct });
      case 10: return this.i18n.translate('dcma.greatPerf.percentLE', { value: this.cfg.adv10().thresholds.greatMaxPct });
      case 11: return this.i18n.translate('dcma.greatPerf.percentLE', { value: this.cfg.adv11().thresholds.greatMaxPct });
      case 4:  return this.i18n.translate('dcma.greatPerf.percentGE', { value: this.cfg.adv4().thresholds.greatPct });
      case 14: return this.i18n.translate('dcma.greatPerf.beiGE',     { value: this.cfg.adv14().thresholds.greatMinBei });
      case 9:
      case 12:
      case 13:
      default: return this.i18n.translate('dcma.greatPerf.na');
    }
  }

  shouldShowPassLabel(row: DcmaRow): boolean {
    switch (row.check as number) {
      case 9:
      case 12:
      case 13:
        return true;
      default:
        return false;
    }
  }

  passLabel(row: DcmaRow): string {
    return row.passed
      ? this.i18n.translate('common.pass')
      : this.i18n.translate('common.fail');
  }

  // таблица слева
  trackRow = (_: number, r: DcmaRow) => r.check;

  // проценты / зоны
  getZoneColorFor(row: DcmaRow): string {
    if (row.color) return row.color;
    const g = row.grade ?? this.getRowGrade(row);
    if (g === 'great')   return ZONE_COLORS.great;
    if (g === 'average') return ZONE_COLORS.average;
    return ZONE_COLORS.poor;
  }

  private getRowGrade(row: DcmaRow): Grade | null {
    switch (row.check) {
      case 1: {
        if (row.percent == null) return null;
        const adv = this.cfg.adv1().thresholds;
        return getZoneByPercent(row.percent, adv.greatPct, adv.averagePct, true).grade;
      }
      case 2:  return this.cfg.evaluateCheck2Grade(row.result?.leadPercent ?? row.percent ?? 0);
      case 3:  return this.cfg.evaluateCheck3Grade(row.result?.lagPercent ?? row.percent ?? 0);
      case 4:  return this.cfg.evaluateCheck4Grade(row.result?.percentFS ?? row.percent ?? 0);
      case 5:  return this.cfg.evaluateCheck5Grade((row.result?.hardPercent ?? row.result?.percentHard ?? row.result?.percentHardAllActivities) ?? row.percent ?? 0);
      case 6:  return this.cfg.evaluateCheck6Grade(row.result?.highFloatPercent ?? row.percent ?? 0);
      case 7:  return this.cfg.evaluateCheck7Grade({ negativeFloatCount: row.result?.negativeFloatCount ?? 0, totalEligible: row.result?.totalEligible ?? 1 });
      case 8:  return this.cfg.evaluateCheck8Grade(row.result?.highDurationPercent ?? row.percent ?? 0);
      case 9:  return this.cfg.evaluateCheck9Grade((row.result?.invalidForecastCount ?? 0) + (row.result?.invalidActualCount ?? 0));
      case 10: return this.cfg.evaluateCheck10Grade(row.result?.percentWithoutResource ?? row.percent ?? 0);
      case 11: return this.cfg.evaluateCheck11Grade(row.result?.missedPercent ?? row.percent ?? 0);
      case 12: return this.cfg.evaluateCheck12Grade(!!row.result?.testPassLikely);
      case 13: return this.cfg.evaluateCheck13Grade(row.result?.cpli ?? null);
      case 14: return this.cfg.evaluateCheck14Grade(row.result?.bei ?? null);
      default: return null;
    }
  }

  formatPercent(p: number | null | undefined): string {
    return (p === null || p === undefined) ? '—' : `${(p as number).toFixed(2)}`;
  }

  // загрузка
  async run() {
    this.loading.set(true);
    try {
      const s = this.cfg.settings();
      const id = this.projId();

      const p1  = s[1].enabled  ? this.svc1.analyzeCheck1(id, this.cfg.buildCheck1Options()) : Promise.resolve(null);
      const p2  = s[2].enabled  ? this.svc2.analyzeCheck2(id, true, this.cfg.buildCheck2Options()) : Promise.resolve(null);
      const p3  = s[3].enabled  ? this.svc3.analyzeCheck3(id, true, this.cfg.buildCheck3Options()) : Promise.resolve(null);
      const p4  = s[4].enabled  ? this.svc4.analyzeCheck4(id, true, this.cfg.buildCheck4Options()) : Promise.resolve(null);
      const p5  = s[5].enabled  ? this.svc5.analyzeCheck5(id, true, this.cfg.buildCheck5Options()) : Promise.resolve(null);
      const o6  = this.cfg.buildCheck6Options();
      const p6  = s[6].enabled  ? this.svc6.analyzeCheck6(id, o6.includeDetails) : Promise.resolve(null);
      const p7  = s[7].enabled  ? this.svc7.analyzeCheck7(id, true, this.cfg.buildCheck7Options()) : Promise.resolve(null);
      const p8  = s[8].enabled  ? this.svc8.analyzeCheck8(id, true, this.cfg.buildCheck8Options()) : Promise.resolve(null);
      const p9  = s[9].enabled  ? this.svc9.analyzeCheck9(id, true, this.cfg.buildCheck9Options()) : Promise.resolve(null);
      const o10 = this.cfg.buildCheck10Options();
      const p10 = s[10].enabled ? this.svc10.analyzeCheck10(id, o10.includeDetails) : Promise.resolve(null);
      const p11 = s[11].enabled ? this.svc11.analyzeCheck11(id, true, this.cfg.buildCheck11Options()) : Promise.resolve(null);
      const p12 = s[12].enabled ? this.svc12.analyzeCheck12(id, true, this.cfg.buildCheck12Options()) : Promise.resolve(null);
      const p13 = s[13].enabled ? this.svc13.analyzeCheck13(id, this.cfg.buildCheck13Options()) : Promise.resolve(null);
      const p14 = s[14].enabled ? this.svc14.analyzeCheck14(id, true, this.cfg.buildCheck14Options()) : Promise.resolve(null);

      const [
        check1, check2, check3, check4, check5, check6, check7, check8,
        check9, check10, check11, check12, check13, check14
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

  openInfo(row: any) {
    this.dialog.open(DcmaInfoDialogComponent, {
      width: '740px',
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
      if (res?.saved) this.run();
      else this.buildRows();
    });
  }

  selectRow(row: DcmaRow) {
    this.selectedRow.set(row);
    this.restartBorderAnimation();
    queueMicrotask(() => {
      const el = this.rightPane?.nativeElement;
      if (el) el.scrollTo({ top: 0, behavior: 'smooth' });
      this.resetVirtualScrollSoon();
    });
  }

  ngAfterViewInit(): void {
    this.viewports.changes.subscribe(() => this.resetVirtualScrollSoon());
    this.resetVirtualScrollSoon();
  }
  ngOnDestroy(): void {}

  private resetVirtualScrollSoon(): void {
    requestAnimationFrame(() => {
      this.viewports?.forEach(vp => {
        try {
          vp.checkViewportSize();
          vp.scrollToIndex(0, 'auto');
        } catch {}
      });
    });
  }

  private restartBorderAnimation(): void {
    this.animFlip.set(false);
    requestAnimationFrame(() => {
      this.animFlip.set(true);
    });
  }

  private buildRows() {
    type RowT = {
      check: DcmaCheckId; metric: string; description: string;
      percent: number | null; passed: boolean; result: any
    };
    const rows: RowT[] = [];
    const push = (check: DcmaCheckId, metric: string, description: string, percent: number | null, passed: boolean, result: any) =>
      rows.push({ check, metric, description, percent, passed, result });

    const r1 = this.r1();
    if (r1) push(1 as DcmaCheckId, 'Logic',
      `Missing any: ${r1.uniqueMissingAny}/${r1.totalEligible}`,
      r1.percentMissingAny, r1.percentMissingAny <= 5, r1);

    const r2 = this.r2();
    if (r2) {
      const grade = this.cfg.evaluateCheck2Grade(r2.leadPercent);
      const label = grade === 'great' ? 'Great' : grade === 'average' ? 'Average' : 'Poor';
      push(2 as DcmaCheckId, 'Leads',
        `Lead links: ${r2.leadCount}/${r2.totalRelationships} • ${label}`,
        r2.leadPercent, this.cfg.evaluateCheck2Pass(r2), r2);
    }

    const r3 = this.r3();
    if (r3) {
      const grade3 = this.cfg.evaluateCheck3Grade(r3.lagPercent);
      const label3 = grade3 === 'great' ? 'Great' : grade3 === 'average' ? 'Average' : 'Poor';
      push(3 as DcmaCheckId, 'Lags',
        `Lag links: ${r3.lagCount}/${r3.totalRelationships} • ${label3}`,
        r3.lagPercent, this.cfg.evaluateCheck3Pass(r3 as any), r3);
    }

    const r4 = this.r4();
    if (r4) {
      const grade4 = this.cfg.evaluateCheck4Grade(r4.percentFS);
      const label4 = grade4 === 'great' ? 'Great' : grade4 === 'average' ? 'Average' : 'Poor';
      push(4 as DcmaCheckId, 'Relationship Types',
        `FS: ${r4.countFS} (of ${r4.totalRelationships}) • ${label4}`,
        r4.percentFS, this.cfg.evaluateCheck4Pass(r4.percentFS), r4);
    }

    const r5 = this.r5();
    if (r5) {
      const pctAll = (r5 as any).percentHardAllActivities ?? (r5 as any).percentHard ?? (r5 as any).hardPercent;
      const cnt = (r5 as any).countHard ?? (r5 as any).hardCount;
      const tot = (r5 as any).totalActivities ?? (r5 as any).totalWithConstraints;
      const grade5 = this.cfg.evaluateCheck5Grade(pctAll);
      const label5 = grade5 === 'great' ? 'Great' : grade5 === 'average' ? 'Average' : 'Poor';
      push(5 as DcmaCheckId, 'Hard Constraints',
        `Hard constraints: ${cnt} (of ${tot}) • ${label5}`,
        pctAll, this.cfg.evaluateCheck5Pass(pctAll), r5);
    }

    const r6 = this.r6();
    if (r6) {
      const grade6 = this.cfg.evaluateCheck6Grade(r6.highFloatPercent);
      const label6 = grade6 === 'great' ? 'Great' : grade6 === 'average' ? 'Average' : 'Poor';
      push(6 as DcmaCheckId, 'High Float',
        `High TF: ${r6.highFloatCount}/${r6.totalEligible} • ${label6}`,
        r6.highFloatPercent, this.cfg.evaluateCheck6Pass(r6.highFloatPercent), r6);
    }

    const r7 = this.r7();
    if (r7) {
      const pct = r7.totalEligible > 0 ? (r7.negativeFloatCount / r7.totalEligible) * 100 : 0;
      const grade7 = this.cfg.evaluateCheck7Grade({ negativeFloatCount: r7.negativeFloatCount, totalEligible: r7.totalEligible });
      const label7 = grade7 === 'great' ? 'Great' : grade7 === 'average' ? 'Average' : 'Poor';
      push(7 as DcmaCheckId, 'Negative Float',
        `Neg TF count: ${r7.negativeFloatCount} • ${label7}`,
        pct, this.cfg.evaluateCheck7Pass({ negativeFloatCount: r7.negativeFloatCount, totalEligible: r7.totalEligible }), r7);
    }

    const r8 = this.r8();
    if (r8) {
      const grade8 = this.cfg.evaluateCheck8Grade(r8.highDurationPercent);
      const label8 = grade8 === 'great' ? 'Great' : grade8 === 'average' ? 'Average' : 'Poor';
      push(8 as DcmaCheckId, 'High Duration',
        `>44d remain: ${r8.highDurationCount}/${r8.totalEligible} • ${label8}`,
        r8.highDurationPercent, this.cfg.evaluateCheck8Pass(r8.highDurationPercent), r8);
    }

    const r9 = this.r9();
    if (r9) {
      const invalidCount = (r9.invalidForecastCount ?? 0) + (r9.invalidActualCount ?? 0);
      const grade9 = this.cfg.evaluateCheck9Grade(invalidCount);
      const label9 = grade9 === 'great' ? 'Great' : grade9 === 'average' ? 'Average' : 'Poor';
      push(9 as DcmaCheckId, 'Invalid Dates',
        `9a: ${r9.invalidForecastCount} • 9b: ${r9.invalidActualCount} • ${label9}`,
        null, this.cfg.evaluateCheck9Pass(invalidCount), r9);
    }

    const r10 = this.r10();
    if (r10) {
      const grade10 = this.cfg.evaluateCheck10Grade(r10.percentWithoutResource);
      const label10 = grade10 === 'great' ? 'Great' : grade10 === 'average' ? 'Average' : 'Poor';
      push(10 as DcmaCheckId, 'Resources',
        `No resources: ${r10.withoutResourceCount}/${r10.totalEligible} • ${label10}`,
        r10.percentWithoutResource, this.cfg.evaluateCheck10Pass(r10.percentWithoutResource), r10);
    }

    const r11 = this.r11();
    if (r11) {
      const grade11 = this.cfg.evaluateCheck11Grade(r11.missedPercent);
      const label11 = grade11 === 'great' ? 'Great' : grade11 === 'average' ? 'Average' : 'Poor';
      push(11 as DcmaCheckId, 'Missed Tasks',
        `Missed: ${r11.missedCount}/${r11.totalCompleted} • ${label11}`,
        r11.missedPercent, this.cfg.evaluateCheck11Pass(r11.missedPercent), r11);
    }

    const r12 = this.r12();
    if (r12) {
      const grade12 = this.cfg.evaluateCheck12Grade(!!r12.testPassLikely);
      const label12 = grade12 === 'great' ? 'Great' : grade12 === 'average' ? 'Average' : 'Poor';
      push(12 as DcmaCheckId, 'Critical Path Test',
        `Single chain & ends at PF: ${r12.isSingleChain && r12.reachedProjectFinish ? 'OK' : 'Issue'} • ${label12}`,
        null, this.cfg.evaluateCheck12Pass(!!r12.testPassLikely), r12);
    }

    const r13 = this.r13();
    if (r13) {
      const grade13 = this.cfg.evaluateCheck13Grade(r13.cpli ?? null);
      const label13 = grade13 === 'great' ? 'Great' : grade13 === 'average' ? 'Average' : 'Poor';
      push(13 as DcmaCheckId, 'CPLI',
        `CPL: ${r13.criticalPathLengthDays} • PTF: ${r13.projectTotalFloatDays} • ${label13}`,
        null, this.cfg.evaluateCheck13Pass(r13.cpli ?? null), r13);
    }

    const r14 = this.r14();
    if (r14) {
      const grade14 = this.cfg.evaluateCheck14Grade(r14.bei ?? null);
      const label14 = grade14 === 'great' ? 'Great' : grade14 === 'average' ? 'Average' : 'Poor';
      push(14 as DcmaCheckId, 'BEI',
        `Planned/Actual: ${r14.plannedToComplete}/${r14.actuallyCompleted} • ${label14}`,
        r14.bei ?? null, this.cfg.evaluateCheck14Pass(r14.bei ?? null), r14);
    }

    this.rows.set(rows);
  }
}
