import {
  Component, inject, signal, computed,
  ViewChild, ElementRef, AfterViewInit, OnDestroy,
  ViewChildren,
  QueryList
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { MatTabChangeEvent, MatTabsModule } from '@angular/material/tabs';
import { CdkVirtualScrollViewport, ScrollingModule } from '@angular/cdk/scrolling';

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

import { DcmaSettingsService, DcmaCheckId } from './services/adv/dcma-settings.service';
import { getZoneByPercent, Grade, ZONE_COLORS } from './services/adv/dcma-checks.config';
import { CdkTableModule } from '@angular/cdk/table';

interface DcmaRow {
  check: DcmaCheckId;
  metric: string;
  description: string;
  percent?: number | null;
  passed: boolean;
  result: any;
  grade?: Grade;
  color?: string;
}

@Component({
  standalone: true,
  selector: 'app-dcma-checks',
  imports: [
    CommonModule,
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

  @ViewChildren(CdkVirtualScrollViewport)
  private viewports!: QueryList<CdkVirtualScrollViewport>;

  // --- UI state
  animFlip = signal<boolean>(false);

  zone = {
    poor: ZONE_COLORS.poor,
    average: ZONE_COLORS.average,
    great: ZONE_COLORS.great,
  };

  // reactive ViewChild для блока summary (есть в каждой вкладке Summary)
  private _c1El?: ElementRef<HTMLElement>;
  private summaryRO?: ResizeObserver;

  @ViewChild('c1Summary', { read: ElementRef })
  set c1Summary(el: ElementRef<HTMLElement> | undefined) {
    if (this._c1El?.nativeElement === el?.nativeElement) return;

    // снять старого наблюдателя
    this.summaryRO?.disconnect();
    this._c1El = el;

    if (el) {
      // первичный замер и наблюдатель
      this.measureSummary(el.nativeElement);
      this.summaryRO = new ResizeObserver(() => this.measureSummary(el.nativeElement));
      this.summaryRO.observe(el.nativeElement);

      // перезапуск анимации после появления DOM
      this.restartBorderAnimation();
    }
  }

  // фактические размеры summary для построения svg-пути (padding-box!)
  sumW = signal(0);
  sumH = signal(0);
  readonly ITEM_SIZE = 44;
  trackTask = (_: number, i: any) =>
    i?.task_id ?? i?.task_code ?? i?.id ?? i;
  trackLink = (_: number, l: any) =>
    l?.id ?? `${l?.predecessor_task_id || l?.predecessor_code}->${l?.successor_task_id || l?.successor_code}:${l?.link_type}:${l?.lag_days_8h}`;
  trackNonFs = (_: number, x: any) =>
    x?.id ?? `${x?.predecessor_task_id || x?.predecessor_code}->${x?.successor_task_id || x?.successor_code}:${x?.link_type}`;
  trackHard = (_: number, i: any) =>
    i?.id
    ?? `${i?.task_id || i?.task_code || ''}|${i?.cstr_type || ''}|${i?.cstr_date || ''}`;
  trackC7 = (_: number, i: any) =>
    i?.task_id ?? i?.task_code ?? i?.id ?? `${i?.task_name}|${i?.total_float_hr_cnt}|${i?.hours_per_day_used}`;
  trackC8 = (_: number, i: any) =>
    i?.task_id ?? i?.task_code ?? i?.id ??
      `${i?.task_name}|${i?.remain_dur_hr_cnt}|${i?.remain_dur_days_8h}|${i?.hours_per_day_used}`;
  trackC9Forecast = (_: number, i: any) =>
    i?.task_id ?? i?.task_code ?? `${i?.early_start_date}|${i?.early_end_date}|${i?.late_start_date}|${i?.late_end_date}`;
  trackC9Actual = (_: number, i: any) =>
    i?.task_id ?? i?.task_code ?? `${i?.act_start_date}|${i?.act_end_date}`;
  trackDetailsItems = (_: number, i: any) =>
    i?.task_id ?? i?.task_code ?? `${i?.task_name}|${i?.act_finish}|${i?.baseline_finish}`;


trackC14Planned = (_: number, i: any) => i?.task_id ?? i?.task_code ?? i?.task_name ?? _;
trackC14Ahead   = (_: number, i: any) => i?.task_id ?? i?.task_code ?? i?.task_name ?? _;
  // параметры должны совпадать с CSS
  private readonly strokePx = 2;   // stroke-width
  private readonly radiusPx = 12;  // border-radius

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

  private i18n = inject(TranslocoService);
  
  greatPerfText(row: { check: number }): string {
  switch (row.check) {
    // lower is better → ≤ %
    case 1:  return this.i18n.translate('dcma.greatPerf.percentLE', { value: this.cfg.adv1().thresholds.greatPct });
    case 2:  return this.i18n.translate('dcma.greatPerf.percentLE', { value: this.cfg.adv2().thresholds.greatPct });
    case 3:  return this.i18n.translate('dcma.greatPerf.percentLE', { value: this.cfg.adv3().thresholds.greatPct });
    case 5:  return this.i18n.translate('dcma.greatPerf.percentLE', { value: this.cfg.adv5().thresholds.greatMaxPct });
    case 6:  return this.i18n.translate('dcma.greatPerf.percentLE', { value: this.cfg.adv6().thresholds.greatMaxPct });
    case 7:  return this.i18n.translate('dcma.greatPerf.percentLE', { value: this.cfg.adv7().mode.thresholds.greatMaxPct });
    case 8:  return this.i18n.translate('dcma.greatPerf.percentLE', { value: this.cfg.adv8().thresholds.greatMaxPct });
    case 10: return this.i18n.translate('dcma.greatPerf.percentLE', { value: this.cfg.adv10().thresholds.greatMaxPct });
    case 11: return this.i18n.translate('dcma.greatPerf.percentLE', { value: this.cfg.adv11().thresholds.greatMaxPct });

    // higher is better → ≥ %
    case 4:  return this.i18n.translate('dcma.greatPerf.percentGE', { value: this.cfg.adv4().thresholds.greatPct });

    // BEI (без %)
    case 14: return this.i18n.translate('dcma.greatPerf.beiGE',     { value: this.cfg.adv14().thresholds.greatMinBei });

    // нет числового «great»-порога
    case 9:
    case 12:
    case 13:
    default: return this.i18n.translate('dcma.greatPerf.na');
  }
}

/** Какие чеки показываем как PASS/FAIL вместо процентов */
shouldShowPassLabel(row: DcmaRow): boolean {
  switch (row.check as number) {
    // нет численного порога → PASS/FAIL
    case 9:
    case 12:
    case 13:
      return true;
    default:
      return false;
  }
}

/** Локализованный ярлык PASS/FAIL */
passLabel(row: DcmaRow): string {
  return row.passed
    ? this.i18n.translate('common.pass')
    : this.i18n.translate('common.fail');
}

  constructor() {
    this.cfg.ensureInitialized();
    this.run();
  }

  // фильтрация строки по видимости в настройках
  filteredRows = computed(() => {
    const map = this.cfg.settings();
    return this.rows().filter(r => (map[r.check]?.showInTable ?? true));
  });

  // --- утилиты процентов и сегментов
  private clampPct(n: number): number {
    const x = Number(n);
    return Number.isFinite(x) ? Math.max(0, Math.min(100, Math.round(x))) : 0;
  }

  private segBGLower(gp: number, ap: number): string {
    const g = '#4CAF50', y = '#FFC107', r = '#EF5350';
    const G = this.clampPct(gp);
    const A = this.clampPct(ap);
    const lo = Math.min(G, A), hi = Math.max(G, A);
    return `linear-gradient(to right, ${g} 0 ${lo}%, ${y} ${lo}% ${hi}%, ${r} ${hi}% 100%)`;
  }
  private segBGHigher(gp: number, ap: number): string {
    const g = '#4CAF50', y = '#FFC107', r = '#EF5350';
    const G = this.clampPct(gp);
    const A = this.clampPct(ap);
    const lo = Math.min(G, A), hi = Math.max(G, A);
    return `linear-gradient(to right, ${r} 0 ${lo}%, ${y} ${lo}% ${hi}%, ${g} ${hi}% 100%)`;
  }
  private segBGDefault(): string {
    return this.segBGLower(33, 66);
  }

  segmentBgFor(row: DcmaRow): string {
    switch (row.check as number) {
      case 1:  { const t = this.cfg.adv1().thresholds;  return this.segBGLower(t.greatPct, t.averagePct); }
      case 2:  { const t = this.cfg.adv2().thresholds;  return this.segBGLower(t.greatPct, t.averagePct); }
      case 3:  { const t = this.cfg.adv3().thresholds;  return this.segBGLower(t.greatPct, t.averagePct); }
      case 4:  { const t = this.cfg.adv4().thresholds;  return this.segBGHigher(t.greatPct, t.averagePct); }
      case 5:  { const t = this.cfg.adv5().thresholds;  return this.segBGLower(t.greatMaxPct, t.averageMaxPct); }
      case 6:  { const t = this.cfg.adv6().thresholds;  return this.segBGLower(t.greatMaxPct, t.averageMaxPct); }
      case 7:  { const t = this.cfg.adv7().mode.thresholds; return this.segBGLower(t.greatMaxPct, t.averageMaxPct); }
      case 8:  { const t = this.cfg.adv8().thresholds;  return this.segBGLower(t.greatMaxPct, t.averageMaxPct); }
      case 9:  { return this.segBGDefault(); }
      case 10: { const t = this.cfg.adv10().thresholds; return this.segBGLower(t.greatMaxPct, t.averageMaxPct); }
      case 11: { const t = this.cfg.adv11().thresholds; return this.segBGLower(t.greatMaxPct, t.averageMaxPct); }
      case 12: { return this.segBGDefault(); }
      case 13: { return this.segBGDefault(); }
      case 14: { const t = this.cfg.adv14().thresholds; return this.segBGHigher(t.greatMinBei * 100, t.averageMinBei * 100); }
      default: return this.segBGDefault();
    }
  }

  getMarkerPos(row: DcmaRow): number {
    const p = typeof row.percent === 'number' ? row.percent : null;
    if (p == null) return 0;
    return Math.max(0, Math.min(100, p));
  }

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

  // --- загрузка данных
  async run() {
    this.loading.set(true);
    try {
      const s = self.crypto ? this.cfg.settings() : this.cfg.settings(); // (просто чтобы не ругался линтер на self)
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

  // lifecycle
  ngAfterViewInit(): void {
    // ViewChild-сеттер сам сработает, когда появится #c1Summary
        // когда набор вьюпортов меняется (переключили вкладку/кейсы) — «пнуть» их
    this.viewports.changes.subscribe(() => this.resetVirtualScrollSoon());
    // и сразу после первого рендера тоже
    this.resetVirtualScrollSoon();
  }
  ngOnDestroy(): void {
    this.summaryRO?.disconnect();
  }
  /** дернуть пересчёт, скролл в начало — с задержкой, чтобы контент вкладки уже был виден */
  private resetVirtualScrollSoon(): void {
    requestAnimationFrame(() => {
      this.viewports?.forEach(vp => {
        try {
          vp.checkViewportSize();    // пересчитать размеры контейнера
          vp.scrollToIndex(0, 'auto'); // в начало (можно 'smooth' если хотите анимацию)
        } catch {}
      });
    });
  }

  /** вызывать при смене вкладки mat-tab */
  onTabChange(_e: MatTabChangeEvent) {
    this.resetVirtualScrollSoon();
  }

  // --- измерения и путь рамки
  /**
   * Измеряем padding-box: getBoundingClientRect() даёт border-box,
   * поэтому вычитаем толщины бордеров, чтобы SVG (inset:0) совпадал по размеру.
   */
  private measureSummary(el?: HTMLElement): void {
    const node = el ?? this._c1El?.nativeElement;
    if (!node) return;

    const rect = node.getBoundingClientRect();         // border-box
    const cs = getComputedStyle(node);
    const bl = parseFloat(cs.borderLeftWidth)  || 0;
    const br = parseFloat(cs.borderRightWidth) || 0;
    const bt = parseFloat(cs.borderTopWidth)   || 0;
    const bb = parseFloat(cs.borderBottomWidth)|| 0;

    // padding-box размеры (то, что занимает абсолютный SVG с inset:0)
    const w = Math.max(1, Math.round(rect.width  - bl - br));
    const h = Math.max(1, Math.round(rect.height - bt - bb));

    this.sumW.set(w);
    this.sumH.set(h);
  }

  private restartBorderAnimation(): void {
    this.animFlip.set(false);
    requestAnimationFrame(() => {
      this.measureSummary();
      this.animFlip.set(true);
    });
  }

  /** D-путь прямоугольника со скруглением, старт в 12:00, обход по часовой, строго внутри padding-box */
  summaryBorderPath(): string {
    const w = this.sumW(), h = this.sumH();
    if (!w || !h) return '';

    const s = this.strokePx / 2; // держим штрих полностью внутри
    const r = Math.min(this.radiusPx, (w / 2) - s, (h / 2) - s);

    const x1 = s,       y1 = s;
    const x2 = w - s,   y2 = h - s;

    const topL = x1 + r, topR = x2 - r;
    const botL = x1 + r, botR = x2 - r;
    const midX = (x1 + x2) / 2;

    return [
      `M ${midX} ${y1}`,
      `H ${topR}`,
      `A ${r} ${r} 0 0 1 ${x2} ${y1 + r}`,
      `V ${y2 - r}`,
      `A ${r} ${r} 0 0 1 ${botR} ${y2}`,
      `H ${botL}`,
      `A ${r} ${r} 0 0 1 ${x1} ${y2 - r}`,
      `V ${y1 + r}`,
      `A ${r} ${r} 0 0 1 ${topL} ${y1}`,
      `H ${midX}`
    ].join(' ');
  }

  // --- утилиты таблицы
  trackRow = (_: number, r: DcmaRow) => r.check;

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
