// file: wbs-canvas-table.component.ts
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
  inject,
  ChangeDetectorRef,
  NgZone
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { select, Selection } from 'd3-selection';
import { zoom, ZoomBehavior, ZoomTransform } from 'd3-zoom';
import { BarColor, ColumnDef, FlatRow, RefLine, Node } from './models/gantt.model';
import { BarColorName, DropMode, GanttScale, IsoDate, TimeUnit } from './models/gantt.types';

import {
  startOfUnit,
  nextUnitStart,
  formatLabel,
  formatTopLabel,
  startOfISOWeek,
  getISOWeek,
  msToIso,
  toMs,
  snapMsToDay,
  MS_PER_DAY
} from './utils/date-utils';
import { hexToRgba } from './utils/color-utils';
import {
  deepClone,
  flattenWbs,
  findParentListAndIndex,
  findNode as findNodeUtil,
  isDescendant as isDescendantUtil
} from './utils/tree-utils';


@Component({
  selector: 'gantt-canvas',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './gantt-canvas.component.html',
  styleUrls: ['./gantt-canvas.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GanttCanvasComponent implements AfterViewInit, OnChanges, OnDestroy {

  // ===== Ссылки на DOM (таблица) =====
  @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('headerCanvas', { static: true }) headerCanvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('bodyWrapper', { static: true }) bodyWrapperRef!: ElementRef<HTMLDivElement>;
  @ViewChild('host', { static: true }) hostRef!: ElementRef<HTMLDivElement>;

  // ===== Ссылки на DOM (гантт) =====
  @ViewChild('ganttCanvas', { static: true }) ganttCanvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('ganttHeaderCanvas', { static: true }) ganttHeaderCanvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('ganttWrapper', { static: true }) ganttWrapperRef!: ElementRef<HTMLDivElement>;
  @ViewChild('ganttHost', { static: true }) ganttHostRef!: ElementRef<HTMLDivElement>;

  // ===== Корень сплита =====
  @ViewChild('splitRoot', { static: true }) splitRootRef!: ElementRef<HTMLDivElement>;

  @Input() refLines: RefLine[] = [];

  // ===== Вводные данные =====
  @Input() set data(value: Node[] | null) {
    this._externalData = value;
    if (this._initialized) {
      this.workingData = deepClone(value && value.length ? value : this.demoData);
      if (this.collapsedByDefault) this.collapseAllWithChildren();
      this.prepareData();
      this.computeGanttRange();
      this.resizeAllCanvases();
      this.syncHeaderToBodyScroll();
      this.syncGanttHeaderToScroll();
      this.renderAll();
    }
  }
  get data(): Node[] | null { return this._externalData; }
  private _externalData: Node[] | null = null;

  @Input() toggleOnRowClick = true;
  @Input() collapsedByDefault = false;
  @Input() barcolor: BarColor[] = [
    { name: 'actual',        color: '#3498DB' },
    { name: 'baseline',      color: '#F1C40F' },
    { name: 'criticalpatch', color: '#E74C3C' },
    { name: 'group',         color: '#7A8288' },
  ];

  // внутренняя карта для быстрого доступа
  private colorMap: Record<BarColorName, string> = {
    actual: '#3498DB',
    baseline: '#F1C40F',
    criticalpatch: '#E74C3C',
    group: '#7A8288',
  };

  private destroyRef = inject(DestroyRef);
  private cdr = inject(ChangeDetectorRef);
  private ngZone = inject(NgZone);

  private rebuildColorMap() {
    const next = { ...this.colorMap };
    for (const c of this.barcolor || []) {
      if (!c?.name || !c?.color) continue;
      if (['actual','baseline','criticalpatch','group'].includes(c.name)) {
        next[c.name as BarColorName] = c.color;
      }
    }
    this.colorMap = next;
  }

  // ===== Сплит-панель =====
  leftPct = 55;
  private isResizingSplit = false;
  private splitStartX = 0;
  private splitStartLeftPct = 55;

  private splitRafId: number | null = null;   // rAF для сплит-перерисовки
  private renderRafId: number | null = null;  // rAF для общего рендера

  // ===== Визуальные параметры =====
  private headerHeight = 36;
  private rowHeight = 28;
  private font = '12px system-ui, -apple-system, Segoe UI, Roboto, Arial';
  private headerFont = '600 12px system-ui, -apple-system, Segoe UI, Roboto, Arial';
  private zebraColor = '#fafafa';
  private gridColor = '#e6e6e6';
  private textColor = '#000'; // весь текст — чёрный
  private headerBg = '#f5f7fb';
  private headerBorder = '#dcdfe6';
  private lastClientX = 0;

  ganttScale: GanttScale = 'month-week';

  private levelColors = [
    '#F2BE90', '#F8E187', '#96E5B8', '#F58EA8',
    '#B07EFB', '#FF8C69', '#64C2C8', '#C29FFF'
  ];
  private getLevelColor(levelIndex: number) {
    const arr = this.levelColors;
    return arr[(levelIndex % arr.length + arr.length) % arr.length];
  }
  private toggleIndentPerLevel = 12;
  private baseToggleWidth = 28;

  private colGrip = 28;
  private colToggle = 28;

  public showGantt = true;
  private prevLeftPct = this.leftPct;

  // ===== Динамические столбцы (после Grip+Toggle) =====
  private nodeIndex = new Map<string, Node>();
  private columns: ColumnDef[] = [
    { key: 'wbs',    title: 'WBS',    width: 120, minWidth: 60 },
    { key: 'name',   title: 'Name',   width: 420, minWidth: 120 },
    { key: 'start',  title: 'Start',  width: 120, minWidth: 80 },
    { key: 'finish', title: 'Finish', width: 120, minWidth: 80 },
    { key: 'baselineStart',  title: 'B.Start',  width: 120, minWidth: 80 },
    { key: 'baselineFinish', title: 'B.Finish', width: 120, minWidth: 80 },
    { key: 'owner', title: 'Owner', width: 140, minWidth: 80 },
  ];

  // ===== D3 (для таблицы) =====
  private d3Canvas!: Selection<HTMLCanvasElement, unknown, null, undefined>;
  private zoomBehavior!: ZoomBehavior<HTMLCanvasElement, unknown>;
  private zoomTransform: ZoomTransform = { x: 0, y: 0, k: 1 } as ZoomTransform;

  // ===== Данные =====
  private workingData: Node[] = [];
  private flatRows: FlatRow[] = [];
  private collapsed = new Set<string>();
  // row lookups
  private rowIndexById = new Map<string, number>();
  private rowIndexByWbs = new Map<string, number>();

  // ===== DnD (таблица) =====
  private isDragging = false;
  private dragRowIndex: number = -1;
  private dragMouseDx = 0;
  private dragMouseDy = 0;
  private lastMouseX = 0;
  private lastMouseY = 0;
  private dropMode: DropMode = { kind: 'none' };

  // ===== Resize колонок (таблица) =====
  private isResizingCol = false;
  private resizeStartX = 0;
  private initialWidth = 0;
  private resizeTargetIndex: number | null = null; // индекс в this.columns
  private hoverColIndex: number | null = null;
  private hitTol = 10;
  private hoverDividerX: number | null = null;
  private snapTol = 22;

  // ===== Ручка (grip) =====
  private gripSize = 14;
  private gripPad = 2;
  private gripDotBox = 12;

  // ===== Гантт: диапазон времени =====
  public ganttPxPerDay = 14;        // масштаб (px/день)
  private ganttStartMs = 0;
  private ganttEndMs = 0;

  // ===== Синхронизация скролла между панелями =====
  private syncingScroll = false;

  // ===== Демоданные =====
  private demoData: Node[] = [];

  private _initialized = false;

  // ===== DnD (гантт) =====
  private ganttDragMode: 'none' | 'move' | 'resize-start' | 'resize-finish' = 'none';
  private ganttDragRowIndex = -1;
  private ganttDragStartMs = 0;
  private ganttDragFinishMs = 0;
  private ganttDragAnchorX = 0;      // пиксельный якорь для move
  private ganttDragStartMouseX = 0;
  private ganttResizeHandlePx = 6;
  private lastGanttClientX = 0;
  private lastGanttClientY = 0;

  private linkMode: 'none' | 'drag' = 'none';
  private linkSourceRow = -1;
  private linkStartX = 0;
  private linkStartY = 0;
  private linkMouseX = 0;
  private linkMouseY = 0;
  private linkHoverTargetRow: number | null = null;
  private linkHandleR = 6; // радиус кружков
  private linkHandleGap = 4;     // зазор между баром и кружком (px)
  private linkHitTol = 6;        // допуск попадания в кружок
  private hoverGanttHitMode: 'move'|'resize-start'|'resize-finish'|null = null;
  private hoverBarRow: number | null = null;
  private leftHandleDownRow: number | null = null;

  

  // ────────────────── Lifecycle ──────────────────
  ngAfterViewInit(): void {
    this.workingData = deepClone(this._externalData && this._externalData.length ? this._externalData : this.demoData);
    if (this.collapsedByDefault) this.collapseAllWithChildren();

    this.ngZone.runOutsideAngular(() => {
      this.initD3();
    });
    this.prepareData();
    this.computeGanttRange();
    this.resizeAllCanvases();
    this.renderAll();
    this.syncHeaderToBodyScroll();
    this.syncGanttHeaderToScroll();

    this.ngZone.runOutsideAngular(() => {
      const bodyWrapper = this.bodyWrapperRef.nativeElement;
      const ganttWrapper = this.ganttWrapperRef.nativeElement;

      // Прокрутка таблицы
      const onScrollTable = () => {
        if (this.syncingScroll) return;
        this.syncingScroll = true;
        this.syncHeaderToBodyScroll();
        ganttWrapper.scrollTop = bodyWrapper.scrollTop;
        this.syncingScroll = false;
        this.scheduleRender();
      };
      bodyWrapper.addEventListener('scroll', onScrollTable);
      this.destroyRef.onDestroy(() => bodyWrapper.removeEventListener('scroll', onScrollTable));

      // Прокрутка гантта
      const onScrollGantt = () => {
        if (this.syncingScroll) return;
        this.syncingScroll = true;
        this.syncGanttHeaderToScroll();
        bodyWrapper.scrollTop = ganttWrapper.scrollTop;
        this.syncingScroll = false;

        if (this.ganttDragMode !== 'none') {
          this.updateGanttDragFromScroll();
        } else {
          this.updateGanttCursorFromLast();
          this.scheduleRender();
        }
      };
      ganttWrapper.addEventListener('scroll', onScrollGantt);
      const onWheelGantt = () => this.updateGanttCursorFromLast();
      ganttWrapper.addEventListener('wheel', onWheelGantt, { passive: true });
      this.destroyRef.onDestroy(() => {
        ganttWrapper.removeEventListener('scroll', onScrollGantt);
        ganttWrapper.removeEventListener('wheel', onWheelGantt);
      });

      // Hover при колесе мыши внутри таблицы
      const onWheel = () => {
        const rect = this.canvasRef.nativeElement.getBoundingClientRect();
        const contentX = this.lastClientX - rect.left;
        this.updateHoverFromContentX(contentX);
        this.syncHeaderToBodyScroll();
        this.renderAll();
      };
      bodyWrapper.addEventListener('wheel', onWheel, { passive: true });
      this.destroyRef.onDestroy(() => bodyWrapper.removeEventListener('wheel', onWheel));

      // Слушатели для сплита
      const onSplitMove = (e: MouseEvent) => {
        if (!this.isResizingSplit) return;
        const rootRect = this.splitRootRef.nativeElement.getBoundingClientRect();
        const dx = e.clientX - this.splitStartX;
        const dxPct = (dx / rootRect.width) * 100;
        this.leftPct = Math.min(85, Math.max(15, this.splitStartLeftPct + dxPct));
        this.queueSplitReflow();
      };

      const onSplitUp = () => {
        if (!this.isResizingSplit) return;
        this.isResizingSplit = false;
        this.queueSplitReflow();
        this.splitRootRef.nativeElement.classList.remove('splitting');
        document.body.style.cursor = '';
      };

      window.addEventListener('mousemove', onSplitMove, { passive: true });
      window.addEventListener('mouseup', onSplitUp, { passive: true });
      this.destroyRef.onDestroy(() => {
        window.removeEventListener('mousemove', onSplitMove);
        window.removeEventListener('mouseup', onSplitUp);
      });

      // --- Gantt DnD ---
      const ganttCanvas = this.ganttCanvasRef.nativeElement;
      const onGanttDown = (ev: MouseEvent) => this.onGanttMouseDown(ev);
      const onGanttMove = (ev: MouseEvent) => this.onGanttMouseMove(ev);
      const onGanttUp   = (ev: MouseEvent) => this.onGanttMouseUp(ev);

      ganttCanvas.addEventListener('mousedown', onGanttDown);
      const onGanttHover = (ev: MouseEvent) => {
        this.lastGanttClientX = ev.clientX;
        this.lastGanttClientY = ev.clientY;
        this.updateGanttCursor(ev);
        this.renderGanttBody();
      };
      const onGanttLeave = () => this.resetGanttCursor();

      ganttCanvas.addEventListener('mousemove', onGanttHover, { passive: true });
      ganttCanvas.addEventListener('mouseleave', onGanttLeave);

      this.destroyRef.onDestroy(() => {
        ganttCanvas.removeEventListener('mousedown', onGanttDown);
        ganttCanvas.removeEventListener('mousemove', onGanttHover);
        ganttCanvas.removeEventListener('mouseleave', onGanttLeave);
      });
      window.addEventListener('mousemove', onGanttMove, { passive: true });
      window.addEventListener('mouseup',   onGanttUp,   { passive: true });
      this.destroyRef.onDestroy(() => {
        window.removeEventListener('mousemove', onGanttMove);
        window.removeEventListener('mouseup',   onGanttUp);
      });
    });

    this._initialized = true;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ('collapsedByDefault' in changes && this._initialized) {
      this.collapseAllWithChildren();
      this.prepareData();
      this.computeGanttRange();
      this.resizeAllCanvases();
      this.syncHeaderToBodyScroll();
      this.syncGanttHeaderToScroll();
      this.renderAll();
    }

    if ('barcolor' in changes) {
      this.rebuildColorMap();
      if (this._initialized) {
        this.renderGanttHeader();
        this.renderGanttBody();
      }
    }

    if ('refLines' in changes && this._initialized) {
      this.renderGanttHeader();
      this.renderGanttBody();
    }
  }

  ngOnDestroy(): void {
    // Remove D3 handlers (including zoom namespace)
    if (this.d3Canvas) {
      this.d3Canvas.on('click', null);
      this.d3Canvas.on('mousedown', null);
      this.d3Canvas.on('mousemove', null);
      this.d3Canvas.on('.zoom', null as any);
    }

    // Cancel scheduled animation frames
    if (this.splitRafId != null) {
      cancelAnimationFrame(this.splitRafId);
      this.splitRafId = null;
    }
    if (this.renderRafId != null) {
      cancelAnimationFrame(this.renderRafId);
      this.renderRafId = null;
    }
  }

  @HostListener('window:resize')
  onResize() {
    this.resizeAllCanvases();
    this.syncHeaderToBodyScroll();
    this.syncGanttHeaderToScroll();
    this.renderAll();
  }

  onScaleChange(e: Event) {
    this.ganttScale = (e.target as HTMLSelectElement).value as GanttScale;
    this.resizeGanttCanvases();
    this.renderGanttHeader();
    this.renderGanttBody();
  }

  onTimescaleInput(e: Event) {
    const v = Number((e.target as HTMLInputElement).value || 14);
    this.setTimescale(v, 'center');
  }

  bumpScale(step: number) {
    this.setTimescale(this.ganttPxPerDay + step, 'center');
  }

  public expandAll(): void {
    this.collapsed.clear();
    this.prepareData();
    this.computeGanttRange();
    this.resizeAllCanvases();
    this.syncHeaderToBodyScroll();
    this.syncGanttHeaderToScroll();
    this.renderAll();
  }

  public collapseAll(): void {
    this.collapseAllWithChildren();
    this.prepareData();
    this.computeGanttRange();
    this.resizeAllCanvases();
    this.syncHeaderToBodyScroll();
    this.syncGanttHeaderToScroll();
    this.renderAll();
  }

  public toggleGantt(): void {
    if (this.showGantt) {
      this.prevLeftPct = this.leftPct;
      this.showGantt = false;
      this.leftPct = 100;
    } else {
      this.showGantt = true;
      this.leftPct = this.prevLeftPct ?? 55;
    }

    this.cdr.detectChanges();
    requestAnimationFrame(() => {
      this.bodyWrapperRef.nativeElement.scrollLeft = 0;
      this.resizeAllCanvases();
      this.syncHeaderToBodyScroll();
      this.syncGanttHeaderToScroll();
      this.renderAll();
    });
  }

  // ────────────────── Утилиты компонента ──────────────────
  private colorOf(n: BarColorName): string { return this.colorMap[n]; }
  private rgba(hex: string, a: number): string { return hexToRgba(hex, a); }

  private toGanttContentCoords(e: MouseEvent) {
    const wrap = this.ganttWrapperRef.nativeElement;
    const wrect = wrap.getBoundingClientRect();
    const x = (e.clientX - wrect.left) + wrap.scrollLeft;
    const y = (e.clientY - wrect.top)  + wrap.scrollTop;
    return { x, y };
  }

  private xToMs(x: number): number {
    return this.ganttStartMs + (x / this.ganttPxPerDay) * MS_PER_DAY;
  }

  // ────────────────── Пересчёт дат суммарных задач ──────────────────
  private recalcParentDatesFromChildren(parentId: string): void {
    const parent = this.nodeIndex.get(parentId);
    if (!parent || !parent.children || parent.children.length === 0) return;

    let minStart = Number.POSITIVE_INFINITY;
    let maxFinish = Number.NEGATIVE_INFINITY;

    for (const ch of parent.children) {
      const s = new Date(ch.start  + 'T00:00:00').getTime();
      const f = new Date(ch.finish + 'T00:00:00').getTime();
      if (!isNaN(s)) minStart = Math.min(minStart, s);
      if (!isNaN(f)) maxFinish = Math.max(maxFinish, f);
    }

    if (isFinite(minStart) && isFinite(maxFinish)) {
      parent.start  = msToIso(minStart);
      parent.finish = msToIso(maxFinish);

      const idx = this.rowIndexById.get(parentId);
      if (idx !== undefined) {
        this.flatRows[idx].start  = parent.start;
        this.flatRows[idx].finish = parent.finish;
      }
    }
  }

  private recalcAncestorsFrom(rowId: string): void {
    const fr = this.flatRows.find(r => r.id === rowId);
    if (!fr) return;
    const ancestors = fr.path.slice(0, -1);
    for (let i = ancestors.length - 1; i >= 0; i--) {
      this.recalcParentDatesFromChildren(ancestors[i]);
    }
  }

  private recalcAllSummaryDates(): void {
    const walk = (n: Node): { startMs: number, finishMs: number } => {
      let s = new Date(n.start  + 'T00:00:00').getTime();
      let f = new Date(n.finish + 'T00:00:00').getTime();

      if (n.children && n.children.length) {
        let minS = Number.POSITIVE_INFINITY;
        let maxF = Number.NEGATIVE_INFINITY;
        for (const ch of n.children) {
          const r = walk(ch);
          if (r.startMs  < minS) minS = r.startMs;
          if (r.finishMs > maxF) maxF = r.finishMs;
        }
        if (isFinite(minS) && isFinite(maxF)) {
          s = minS; f = maxF;
          n.start  = msToIso(s);
          n.finish = msToIso(f);
        }
      }
      return { startMs: s, finishMs: f };
    };

    for (const root of this.workingData) walk(root);

    for (let i = 0; i < this.flatRows.length; i++) {
      const id = this.flatRows[i].id;
      const node = this.nodeIndex.get(id);
      if (node) {
        this.flatRows[i].start  = node.start;
        this.flatRows[i].finish = node.finish;
      }
    }
  }

  private revealExtend() { return this.linkHandleR + this.linkHandleGap; }

  private barRevealRowAt(x: number, y: number): number | null {
    const i = Math.floor(y / this.rowHeight);
    if (i < 0 || i >= this.flatRows.length) return null;
    const p = this.barPixelsForRowIndex(i);
    const ext = this.revealExtend();
    const yTop = i * this.rowHeight;
    const yBot = yTop + this.rowHeight;
    if (y < yTop || y > yBot) return null;
    return (x >= p.x0 - ext && x <= p.x1 + ext) ? i : null;
  }

private rightHandleCenter(i: number) {
  const p = this.barPixelsForRowIndex(i);
  const offset = this.linkHandleR + this.linkHandleGap;
  return { x: p.x1 + offset, y: p.yMid };
}
private leftHandleCenter(i: number) {
  const p = this.barPixelsForRowIndex(i);
  const offset = this.linkHandleR + this.linkHandleGap;
  return { x: p.x0 - offset, y: p.yMid }; 
}

private drawHandleWithStem(
  ctx: CanvasRenderingContext2D,
  barEdgeX: number, cx: number, cy: number,
  side: 'left'|'right', active = false
){
  ctx.save();
  ctx.strokeStyle = active ? '#2563eb' : '#94a3b8';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(barEdgeX + 0.5, cy + 0.5);
  ctx.lineTo(cx + 0.5,      cy + 0.5);
  ctx.stroke();
  ctx.restore();
  this.drawHandle(ctx, cx, cy, side, active);
}

private isInCircle(px: number, py: number, cx: number, cy: number, r: number) {
  const dx = px - cx, dy = py - cy;
  return (dx*dx + dy*dy) <= r*r;
}
private barRightHandleHit(x: number, y: number): number | null {
  const i = Math.floor(y / this.rowHeight);
  if (i < 0 || i >= this.flatRows.length) return null;
  const p = this.barPixelsForRowIndex(i);
  const { x: cx, y: cy } = this.rightHandleCenter(i);
  // требуем, чтобы курсор был правее края бара
  if (x <= p.x1 + this.linkHandleGap * 0.5) return null;
  return this.isInCircle(x, y, cx, cy, this.linkHandleR + this.linkHitTol) ? i : null;
}
private barLeftHandleHit(x: number, y: number): number | null {
  const i = Math.floor(y / this.rowHeight);
  if (i < 0 || i >= this.flatRows.length) return null;
  const p = this.barPixelsForRowIndex(i);
  const { x: cx, y: cy } = this.leftHandleCenter(i);
  // требуем, чтобы курсор был левее края бара
  if (x >= p.x0 - this.linkHandleGap * 0.5) return null;
  return this.isInCircle(x, y, cx, cy, this.linkHandleR + this.linkHitTol) ? i : null;
}
private drawHandle(ctx: CanvasRenderingContext2D, x: number, y: number, side: 'left'|'right', active = false) {
  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = active ? '#2563eb' : '#3b82f6';
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(x, y, this.linkHandleR, 0, Math.PI*2);
  ctx.fill();
  ctx.stroke();
  // маленькая стрелка-иконка внутри (по желанию)
  ctx.beginPath();
  if (side === 'right') {
    ctx.moveTo(x-3, y-3); ctx.lineTo(x+2, y); ctx.lineTo(x-3, y+3);
  } else {
    ctx.moveTo(x+3, y-3); ctx.lineTo(x-2, y); ctx.lineTo(x+3, y+3);
  }
  ctx.stroke();
  ctx.restore();
}


private updateGanttCursor(ev: MouseEvent) {
  if (this.ganttDragMode !== 'none') return;
  const el = this.ganttCanvasRef.nativeElement;
  if (this.linkMode === 'drag') { el.style.cursor = 'crosshair'; return; }

  const { x, y } = this.toGanttContentCoords(ev);

  const hit = this.hitGanttBarAt(x, y);
  this.hoverGanttHitMode = hit ? hit.mode : null;

  // показывать кружки, если мышь в расширенной зоне
  const revealRow = this.barRevealRowAt(x, y);
  this.hoverBarRow = revealRow;

  if (!hit) { el.style.cursor = 'default'; return; }
  el.style.cursor = hit.mode === 'move' ? 'grab' : 'ew-resize';
}

  private resetGanttCursor() {
    if (this.ganttDragMode !== 'none') return;
    this.hoverBarRow = null;
    const el = this.ganttCanvasRef.nativeElement;
    el.style.cursor = this.linkMode === 'drag' ? 'crosshair' : 'default';
    this.renderGanttBody();
  }

  private updateGanttCursorFromLast() {
    if (!this.ganttCanvasRef || this.ganttDragMode !== 'none') return;
    const el = this.ganttCanvasRef.nativeElement;
    if (this.linkMode === 'drag') { el.style.cursor = 'crosshair'; return; }
  
    const wrap = this.ganttWrapperRef.nativeElement;
    const wrect = wrap.getBoundingClientRect();
    const x = (this.lastGanttClientX - wrect.left) + wrap.scrollLeft;
    const y = (this.lastGanttClientY - wrect.top)  + wrap.scrollTop;
  
    const hit = this.hitGanttBarAt(x, y);
    this.hoverGanttHitMode = hit ? hit.mode : null;
  
    const revealRow = this.barRevealRowAt(x, y);
    this.hoverBarRow = revealRow;
  
    if (!hit) { el.style.cursor = 'default'; return; }
    el.style.cursor = hit.mode === 'move' ? 'grab' : 'ew-resize';
  }


private hitGanttBarAt(x: number, y: number): { rowIndex: number, mode: 'move'|'resize-start'|'resize-finish' } | null {
  const rowIndex = Math.floor(y / this.rowHeight);
  if (rowIndex < 0 || rowIndex >= this.flatRows.length) return null;

  const row = this.flatRows[rowIndex];
  // Берём актуальные даты из nodeIndex (чтобы видеть live-изменения)
  const node = this.nodeIndex.get(row.id);
  const startStr  = node?.start  ?? row.start;
  const finishStr = node?.finish ?? row.finish;

  const s = new Date(startStr  + 'T00:00:00').getTime();
  const f = new Date(finishStr + 'T00:00:00').getTime();
  const x0 = Math.round(((s - this.ganttStartMs) / MS_PER_DAY) * this.ganttPxPerDay);
  const x1 = Math.round(((f - this.ganttStartMs) / MS_PER_DAY) * this.ganttPxPerDay);

  // верт. зону считаем по всей высоте строки — проще попадать
  const yTop = rowIndex * this.rowHeight;
  const yBot = yTop + this.rowHeight;

  if (y < yTop || y > yBot) return null;

  const h = this.ganttResizeHandlePx;
  if (Math.abs(x - x0) <= h) return { rowIndex, mode: 'resize-start' };
  if (Math.abs(x - x1) <= h) return { rowIndex, mode: 'resize-finish' };
  if (x >= Math.min(x0, x1) && x <= Math.max(x0, x1)) return { rowIndex, mode: 'move' };

  return null;
}

public zoomToFit(): void {
  // Обновим диапазон по текущим данным (метод уже добавляет недельный запас)
  this.computeGanttRange();

  const wrap = this.ganttWrapperRef.nativeElement;
  const viewport = Math.max(0, wrap.clientWidth - 16); // небольшой отступ по краям
  const totalDays = Math.max(
    1,
    Math.ceil((this.ganttEndMs - this.ganttStartMs) / MS_PER_DAY)
  );

  // Желаемое px/день: чтобы totalDays * pxPerDay <= viewport
  const desiredPxPerDay = viewport > 0 ? viewport / totalDays : this.ganttPxPerDay;

  // Используем уже существующую логику масштабирования с клампом и ререндером
  this.setTimescale(desiredPxPerDay, 'left');

  // Покажем начало диапазона
  wrap.scrollLeft = 0;

  // На всякий случай синхронизируем шапку и перерисуем
  this.syncGanttHeaderToScroll();
  this.renderGanttHeader();
  this.renderGanttBody();
}

private onGanttMouseDown(ev: MouseEvent) {
  const { x, y } = this.toGanttContentCoords(ev);
  this.lastGanttClientX = ev.clientX;
  this.lastGanttClientY = ev.clientY;

  
  // 0) клик по ЛЕВОМУ кружку — ничего не двигаем, просто «держим»
  const lHit = this.barLeftHandleHit(x, y);
  if (lHit != null) {
    this.leftHandleDownRow = lHit;
    this.ganttCanvasRef.nativeElement.style.cursor = 'default';
    this.renderGanttBody();
    return;
  }

    // 1) сначала проверяем клик по правому кружку (старт соединения)
    const rHit = this.barRightHandleHit(x, y);
    if (rHit != null) {
      this.linkMode = 'drag';
      this.linkSourceRow = rHit;
      const p = this.barPixelsForRowIndex(rHit);
      this.linkStartX = p.x1; this.linkStartY = p.yMid;
      this.linkMouseX = x; this.linkMouseY = y;
      this.linkHoverTargetRow = null;
      this.ganttCanvasRef.nativeElement.style.cursor = 'crosshair';
      this.renderGanttBody();
      return;
    }
  
    // 2) иначе — обычный DnD/resize баров
  const hit = this.hitGanttBarAt(x, y);
  if (!hit) return;

  const row = this.flatRows[hit.rowIndex];
  const node = this.nodeIndex.get(row.id);
  const startStr  = node?.start  ?? row.start;
  const finishStr = node?.finish ?? row.finish;

  this.ganttDragMode = hit.mode;
  this.ganttDragRowIndex = hit.rowIndex;
  this.ganttDragStartMs  = new Date(startStr  + 'T00:00:00').getTime();
  this.ganttDragFinishMs = new Date(finishStr + 'T00:00:00').getTime();
  this.ganttDragStartMouseX = x;

  // для move: запоминаем, насколько курсор смещён от левой границы
const barLeftX = Math.round(((this.ganttDragStartMs - this.ganttStartMs) / MS_PER_DAY) * this.ganttPxPerDay);
this.ganttDragAnchorX = x - barLeftX;
  this.ganttCanvasRef.nativeElement.style.cursor =
  this.ganttDragMode === 'move' ? 'grabbing' : 'ew-resize';
  this.scheduleRender();
}

// ПРОВЕРЬТЕ, ЧТО ВАШ МЕТОД ВЫГЛЯДИТ ИМЕННО ТАК
private onGanttMouseMove(ev: MouseEvent) {
  // Эти строки ОБЯЗАТЕЛЬНЫ для синхронизации со скроллом
  this.lastGanttClientX = ev.clientX;
  this.lastGanttClientY = ev.clientY;
 // --- протяжка зависимости ---
 if (this.linkMode === 'drag') {
  const { x, y } = this.toGanttContentCoords(ev);
  this.linkMouseX = x;
  this.linkMouseY = y;

  // подсветка потенциальной цели: наведение на левый кружок
  const lHit = this.barLeftHandleHit(x, y);
  this.linkHoverTargetRow = (lHit != null && lHit !== this.linkSourceRow) ? lHit : null;

  this.ganttCanvasRef.nativeElement.style.cursor = 'crosshair';
  this.renderGanttBody();
  return;
}

    // --- обычный DnD/resize баров ---
    if (this.ganttDragMode === 'none') {
      // обновление hover, курсора и кружка справа
      this.updateGanttCursor(ev);
      this.renderGanttBody();
      return;
    }
  
  const { x } = this.toGanttContentCoords(ev);

  let newStartMs = 0;
  let newFinishMs = 0;
  const durationMs = this.ganttDragFinishMs - this.ganttDragStartMs;

  if (this.ganttDragMode === 'move') {
  const newBarLeftX = x - this.ganttDragAnchorX;
  // 3. Конвертируем пиксели в миллисекунды
  newStartMs = this.xToMs(newBarLeftX);
  newFinishMs = newStartMs + durationMs;

  } else if (this.ganttDragMode === 'resize-start') {
    newStartMs = this.xToMs(x);
    newFinishMs = this.ganttDragFinishMs;
    if (newStartMs > newFinishMs - MS_PER_DAY) {
      newStartMs = newFinishMs - MS_PER_DAY;
    }
  } else if (this.ganttDragMode === 'resize-finish') {
    newStartMs = this.ganttDragStartMs;
    newFinishMs = this.xToMs(x);
    if (newFinishMs < newStartMs + MS_PER_DAY) {
      newFinishMs = newStartMs + MS_PER_DAY;
    }
  }

  const rowId = this.flatRows[this.ganttDragRowIndex].id;
  this.commitGanttDates(rowId, newStartMs, newFinishMs);

  this.renderBody();
  
  this.ganttCanvasRef.nativeElement.style.cursor =
    this.ganttDragMode === 'move' ? 'grabbing' : 'ew-resize';

  this.renderGanttBody();
  this.renderGanttHeader();
}

private onGanttMouseUp(_ev: MouseEvent) {
    // завершение протяжки зависимости
    if (this.linkMode === 'drag') {
      if (this.linkHoverTargetRow != null && this.linkSourceRow >= 0) {
        const sourceId = this.flatRows[this.linkSourceRow].id;
        const targetId = this.flatRows[this.linkHoverTargetRow].id;
        if (sourceId !== targetId) {
          const targetNode = this.nodeIndex.get(targetId);
          if (targetNode) {
            targetNode.dependency ??= [];
            if (!targetNode.dependency.includes(sourceId)) {
              targetNode.dependency.push(sourceId);
            }
          }
        }
      }
      // сброс состояния линковки
      this.linkMode = 'none';
      this.linkSourceRow = -1;
      this.linkHoverTargetRow = null;
      this.ganttCanvasRef.nativeElement.style.cursor = 'default';
      // перерисовка с основной линией
      this.renderGanttHeader();
      this.renderGanttBody();
      return;
    }
  
    // завершение DnD баров
  if (this.ganttDragMode === 'none') return;

  this.ganttDragMode = 'none';
  this.ganttDragRowIndex = -1;
this.ganttCanvasRef.nativeElement.style.cursor = 'default';
  // Финал: если бар ушёл за пределы — обновим диапазон, размеры и перерисуем всё
  this.computeGanttRange();
  this.resizeGanttCanvases();
  this.syncGanttHeaderToScroll();
  this.renderGanttHeader();
  this.renderGanttBody();

  this.renderBody();
}

// Обновить даты узла + отражать их в flatRows (чтобы таблица сразу видела изменения)
private commitGanttDates(rowId: string, startMs: number, finishMs: number) {
  startMs  = snapMsToDay(startMs);
  finishMs = snapMsToDay(finishMs);
  if (finishMs < startMs + MS_PER_DAY) finishMs = startMs + MS_PER_DAY;

  const node = this.nodeIndex.get(rowId);
  if (node) {
    node.start  = msToIso(startMs);
    node.finish = msToIso(finishMs);
  }
  const fr = this.flatRows.find(r => r.id === rowId);
  if (fr) {
    fr.start  = msToIso(startMs);
    fr.finish = msToIso(finishMs);
  }

  this.recalcAncestorsFrom(rowId);
}
  
  /** Устанавливает px/день и сохраняет якорь (центр/лево/право) на том же времени */
  private setTimescale(pxPerDay: number, anchor: 'center'|'left'|'right') {
    const wrapper = this.ganttWrapperRef.nativeElement;
  
    // 1) вычисляем "якорную" дату (по текущему скроллу и старому масштабу)
    const anchorPx =
      anchor === 'left'  ? wrapper.scrollLeft :
      anchor === 'right' ? wrapper.scrollLeft + wrapper.clientWidth :
                           wrapper.scrollLeft + wrapper.clientWidth / 2;
  
    const anchorDateMs =
      this.ganttStartMs + (anchorPx / this.ganttPxPerDay) * MS_PER_DAY;
  
    // 2) применяем новый масштаб в допустимых пределах
    this.ganttPxPerDay = Math.max(2, Math.min(96, Math.round(pxPerDay)));
  
    // 3) пересчёт размеров канвасов
    this.resizeGanttCanvases();
  
    // 4) восстанавливаем скролл так, чтобы та же дата осталась на якоре
    const newAnchorPx =
      ((anchorDateMs - this.ganttStartMs) / MS_PER_DAY) * this.ganttPxPerDay;
  
    const desiredScrollLeft =
      anchor === 'left'  ? newAnchorPx
      : anchor === 'right' ? newAnchorPx - wrapper.clientWidth
      : newAnchorPx - wrapper.clientWidth / 2;
  
    wrapper.scrollLeft = Math.max(
      0,
      Math.min(wrapper.scrollWidth - wrapper.clientWidth, desiredScrollLeft)
    );

    if (this.ganttDragMode !== 'none') {
  this.updateGanttDragFromScroll();
}
  
    // 5) дорисовка
    this.syncGanttHeaderToScroll();
    this.renderGanttHeader();
    this.renderGanttBody();
  }

  /** Троттлинг тяжёлой перерисовки при сплите/ресайзе колонок */
  private queueSplitReflow() {
    if (this.splitRafId != null) return;
    this.splitRafId = requestAnimationFrame(() => {
      this.splitRafId = null;
  
      // ВАЖНО: применить [style.flex-basis.%]="leftPct" до измерений
      this.cdr.detectChanges();
  
      this.resizeAllCanvases();
      this.syncHeaderToBodyScroll();
      this.syncGanttHeaderToScroll();
      this.renderAll();
    });
  }
/** Троттлинг обычного renderAll (hover, drag и т.п.) */
private scheduleRender() {
  if (this.renderRafId != null) return;
  this.renderRafId = requestAnimationFrame(() => {
    this.renderRafId = null;
    this.renderAll();
  });
}


  // ============ Хелперы для сегментов времени ===============



  

  


  // Line Gentt
  private dateToX(ms: number): number {
    // переводим миллисекунды в пиксели с шагом pxPerDay
    return Math.round(((ms - this.ganttStartMs) / MS_PER_DAY) * this.ganttPxPerDay) + 0.5;
  }


  // ==================== СПЛИТ ====================
  onSplitMouseDown(e: MouseEvent) {
    e.preventDefault();
    if (!this.showGantt) return;
    this.isResizingSplit = true;
    this.splitStartX = e.clientX;
    this.splitStartLeftPct = this.leftPct;

    this.splitRootRef.nativeElement.classList.add('splitting');
    document.body.style.cursor = 'col-resize';
  }

  // ==================== Табличная часть: ресайз колонок (live) ====================
  private applyLiveResizeAtContentX(contentX: number) {
    if (!this.isResizingCol || this.resizeTargetIndex == null) return;
    const dx = contentX - this.resizeStartX;
    const next = this.initialWidth + dx;
    this.setWidthAt(this.resizeTargetIndex, next);
    this.queueSplitReflow();
  }

  // -------------------- Data helpers --------------------
  private autoScrollIfNearEdge(contentX: number) {
    const host = this.bodyWrapperRef.nativeElement;
    const leftEdge = host.scrollLeft;
    const rightEdge = host.scrollLeft + host.clientWidth;

    const threshold = 24;
    const step = 24;

    if (contentX > rightEdge - threshold) {
      host.scrollLeft = Math.min(host.scrollWidth - host.clientWidth, host.scrollLeft + step);
    } else if (contentX < leftEdge + threshold) {
      host.scrollLeft = Math.max(0, host.scrollLeft - step);
    }
  }

  private cloneTree(src: Node[]): Node[] {
    return JSON.parse(JSON.stringify(src)) as Node[];
  }

  private collapseAllWithChildren() {
    this.collapsed.clear();
    const walk = (nodes: Node[]) => {
      for (const n of nodes) {
        if (n.children && n.children.length) {
          this.collapsed.add(n.id);
          walk(n.children);
        }
      }
    };
    walk(this.workingData);
  }

  private prepareData() {
    this.flatRows = flattenWbs(this.workingData, this.collapsed);
    const maxLevel = this.flatRows.reduce((m, r) => Math.max(m, r.level), 0);
    this.colToggle = this.baseToggleWidth + maxLevel * this.toggleIndentPerLevel;

    // индекс узлов по id
    this.nodeIndex.clear();
    const walkIndex = (nodes: Node[]) => {
      for (const n of nodes) {
        this.nodeIndex.set(n.id, n);
        if (n.children?.length) walkIndex(n.children);
      }
    };
    walkIndex(this.workingData);

    // row lookups by id / wbs for connectors
    this.rowIndexById.clear();
    this.rowIndexByWbs.clear();
    for (let i = 0; i < this.flatRows.length; i++) {
      const fr = this.flatRows[i];
      this.rowIndexById.set(fr.id, i);
      this.rowIndexByWbs.set(fr.wbs, i);
    }
  }

  private getCellValue(row: FlatRow, key: string): string {
    const alias: Record<string, string> = { end: 'finish' };
    const realKey = alias[key] ?? key;

    const direct = (row as any)[realKey];
    if (direct !== undefined && direct !== null && String(direct) !== '') {
      return String(direct);
    }
    const node = this.nodeIndex.get(row.id);
    const v = node ? (node as any)[realKey] : undefined;
    return (v !== undefined && v !== null && String(v) !== '') ? String(v) : '-';
  }

  // ---- Геометрия столбцов ----
  private dataStartX(): number {
    return this.colGrip + this.colToggle;
  }
  /** Правая кромка каждого столбца (последовательно) в координатах канваса */
  private columnEdges(): number[] {
    let x = this.dataStartX();
    const edges: number[] = [];
    for (const c of this.columns) { x += c.width; edges.push(x); }
    return edges;
  }
  private leftOfColumnByIndex(i: number): number {
    return this.dataStartX() + this.columns.slice(0, i).reduce((s, c) => s + c.width, 0);
  }
  private leftOfColumn(key: string): number {
    const idx = this.columns.findIndex(c => c.key === key || (key === 'end' && c.key === 'finish'));
    return idx >= 0 ? this.leftOfColumnByIndex(idx) : this.dataStartX();
  }
  private getWidthAt(i: number): number { return this.columns[i].width; }
  private setWidthAt(i: number, value: number) {
    const c = this.columns[i];
    c.width = Math.max(c.minWidth, value);
  }
  /** хит-тест правых кромок данных-столбцов */
  private hitResizableDivider(x: number): { index: number | null } {
    const edges = this.columnEdges();
    const dpr = (typeof window !== 'undefined' && (window.devicePixelRatio || 1)) || 1;
    const tol = this.hitTol + (dpr > 1 ? 2 : 0);
    for (let i = 0; i < edges.length; i++) {
      if (Math.abs(x - edges[i]) <= tol) return { index: i };
    }
    return { index: null };
  }
  private nearestDivider(x: number): { index: number, x: number, dist: number } | null {
    const edges = this.columnEdges();
    let best: { index: number, x: number, dist: number } | null = null;
    for (let i = 0; i < edges.length; i++) {
      const dist = Math.abs(x - edges[i]);
      if (!best || dist < best.dist) best = { index: i, x: edges[i], dist };
    }
    return best;
  }

  private moveNode(nodeId: string, newParentId: string | null, indexInParent: number) {
    if (newParentId === nodeId) return;
    if (newParentId && isDescendantUtil(this.flatRows, newParentId, nodeId)) return;

    const found = findParentListAndIndex(this.workingData, nodeId);
    if (!found) return;
    const { parentList, index } = found;
    const [node] = parentList.splice(index, 1);

    let newParentChildren: Node[];
    if (!newParentId) {
      newParentChildren = this.workingData;
    } else {
      const newParentNode = findNodeUtil(this.workingData, newParentId);
      if (!newParentNode) return;
      if (!newParentNode.children) newParentNode.children = [];
      newParentChildren = newParentNode.children;
      this.collapsed.delete(newParentId);
    }

    if (indexInParent < 0) indexInParent = 0;
    if (indexInParent > newParentChildren.length) indexInParent = newParentChildren.length;
    newParentChildren.splice(indexInParent, 0, node);
  }

  // -------------------- D3 / Events (таблица) --------------------
  private initD3() {
    const canvas = this.canvasRef.nativeElement;
    this.d3Canvas = select(canvas);

    this.zoomBehavior = zoom<HTMLCanvasElement, unknown>()
      .filter((ev: any) => ev.type === 'wheel')
      .scaleExtent([1, 1])
      .on('zoom', (ev) => {
        this.zoomTransform = ev.transform;
      });

    this.d3Canvas.call(this.zoomBehavior as any);

    // Click (toggle collapse) по телу
    this.d3Canvas.on('click', (event: MouseEvent) => {
      if (this.isDragging) return;
      const { x, y } = this.toContentCoords(event);

      const rowIndex = Math.floor(y / this.rowHeight);
      if (rowIndex < 0 || rowIndex >= this.flatRows.length) return;
      const row = this.flatRows[rowIndex];

      const xToggle = this.colGrip;
      const triSize = 12;
      const triX = xToggle + 8 + this.toggleIndentPerLevel * row.level;
      const triY = rowIndex * this.rowHeight + (this.rowHeight - triSize) / 2;
      const hitPad = 4;

      const inTriangle =
        x >= (triX - hitPad) && x <= (triX + triSize + hitPad) &&
        y >= (triY - hitPad) && y <= (triY + triSize + hitPad);

      if (row.hasChildren && inTriangle) {
        if (this.collapsed.has(row.id)) this.collapsed.delete(row.id);
        else this.collapsed.add(row.id);
        this.prepareData();
        this.computeGanttRange();
        this.resizeAllCanvases();
        this.renderAll();
      }
    });

    // DnD
    this.d3Canvas.on('mousedown', (event: MouseEvent) => this.onMouseDown(event));
    window.addEventListener('mousemove', this.onMouseMoveBound, { passive: true });
    window.addEventListener('mouseup', this.onMouseUpBound, { passive: true });

    // Hover/resize/grab в теле
    this.d3Canvas.on('mousemove', (event: MouseEvent) => {
      this.lastClientX = event.clientX;
      const { x } = this.toContentCoords(event);

      if (this.isResizingCol) {
        this.canvasRef.nativeElement.style.cursor = 'col-resize';
        return;
      }
      if (this.isDragging) {
        this.canvasRef.nativeElement.style.cursor = 'grabbing';
        return;
      }

      this.updateHoverFromContentX(x);
      this.scheduleRender();
    });

    this.destroyRef.onDestroy(() => {
      window.removeEventListener('mousemove', this.onMouseMoveBound);
      window.removeEventListener('mouseup', this.onMouseUpBound);
    });
  }

  private onMouseMoveBound = (e: MouseEvent) => this.onMouseMove(e);
  private onMouseUpBound = (_e: MouseEvent) => this.onMouseUp(_e);

  private toContentCoords(event: MouseEvent) {
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    return { x, y };
  }

  private updateHoverFromContentX(contentX: number) {
    if (this.isDragging) return;

    const hit = this.hitResizableDivider(contentX);
    if (hit.index != null) {
      this.hoverColIndex = hit.index;
      const edges = this.columnEdges();
      this.hoverDividerX = edges[hit.index];
      this.canvasRef.nativeElement.style.cursor = 'col-resize';
    } else {
      const near = this.nearestDivider(contentX);
      if (near && near.dist <= this.snapTol) {
        this.hoverColIndex = near.index;
        this.hoverDividerX = near.x;
        this.canvasRef.nativeElement.style.cursor = 'col-resize';
      } else {
        this.hoverColIndex = null;
        this.hoverDividerX = null;
        this.canvasRef.nativeElement.style.cursor = 'default';
      }
    }
  }

  private gripRectForRow(rowIndex: number) {
    const xGrip = 0;
    const gx = xGrip + 10 - this.gripPad;
    const gy = rowIndex * this.rowHeight + (this.rowHeight - this.gripDotBox) / 2 - this.gripPad;
    const gw = this.gripSize + this.gripPad * 2;
    const gh = this.gripDotBox + this.gripPad * 2;
    return { gx, gy, gw, gh };
  }

  private isInsideGrip(x: number, y: number, rowIndex: number) {
    const { gx, gy, gw, gh } = this.gripRectForRow(rowIndex);
    return x >= gx && x <= gx + gw && y >= gy && y <= gy + gh;
  }

  private isOverGrip(event: MouseEvent) {
    const { x, y } = this.toContentCoords(event);
    const rowIndex = Math.floor(y / this.rowHeight);
    if (rowIndex < 0 || rowIndex >= this.flatRows.length) return false;
    return this.isInsideGrip(x, y, rowIndex);
  }

  private onMouseDown(event: MouseEvent) {
    event.preventDefault();

    const { x, y } = this.toContentCoords(event);
    this.lastClientX = event.clientX;
    this.lastMouseX = x;
    this.lastMouseY = y;

    const hit = this.hitResizableDivider(x);
    if (hit.index != null) {
      this.isResizingCol = true;
      this.resizeStartX = x;
      this.resizeTargetIndex = hit.index;
      this.initialWidth = this.getWidthAt(hit.index);
      this.canvasRef.nativeElement.style.cursor = 'col-resize';
      return;
    }

    const rowIndex = Math.floor(y / this.rowHeight);
    if (rowIndex < 0 || rowIndex >= this.flatRows.length) return;

    if (!this.isInsideGrip(x, y, rowIndex)) return;

    const { gx } = this.gripRectForRow(rowIndex);
    this.isDragging = true;
    this.canvasRef.nativeElement.style.cursor = 'grabbing';
    this.dragRowIndex = rowIndex;
    this.dragMouseDx = x - gx;
    this.dragMouseDy = y - (rowIndex * this.rowHeight);
    this.dropMode = { kind: 'none' };

    this.renderAll();
  }

  private onMouseMove(event: MouseEvent) {
    this.lastClientX = event.clientX;
    const { x, y } = this.toContentCoords(event);
    this.lastMouseX = x;
    this.lastMouseY = y;

    if (this.isResizingCol && this.resizeTargetIndex != null) {
      this.autoScrollIfNearEdge(x);
      this.applyLiveResizeAtContentX(x);
      return;
    }

    if (!this.isDragging) return;

    this.dropMode = this.calculateDropMode(x, y);
    this.scheduleRender();
  }

  private onMouseUp(_event: MouseEvent) {
    if (this.isResizingCol) {
      this.isResizingCol = false;
      this.resizeTargetIndex = null;
      this.canvasRef.nativeElement.style.cursor = 'default';
      this.resizeAllCanvases();
      this.syncHeaderToBodyScroll();
      this.renderAll();
      return;
    }

    if (!this.isDragging) return;

    const srcIndex = this.dragRowIndex;
    const srcRow = this.flatRows[srcIndex];
    const srcId = srcRow.id;

    if (this.dropMode.kind === 'insert') {
      const beforeIdx = this.dropMode.beforeRowIndex;
      const { newParentId, insertIndex } = this.computeInsertParentAndIndex(beforeIdx, srcId);
      this.moveNode(srcId, newParentId, insertIndex);
    } else if (this.dropMode.kind === 'child') {
      const targetIdx = this.dropMode.targetRowIndex;
      const targetRow = this.flatRows[targetIdx];
      if (targetRow.id !== srcId && !isDescendantUtil(this.flatRows, targetRow.id, srcId)) {
        const targetNode = findNodeUtil(this.workingData, targetRow.id);
        const newIndex = (targetNode?.children?.length ?? 0);
        this.moveNode(srcId, targetRow.id, newIndex);
      }
    }

    this.isDragging = false;
    this.canvasRef.nativeElement.style.cursor = 'default';
    this.dragRowIndex = -1;
    this.dropMode = { kind: 'none' };

    this.prepareData();
    this.recalcAllSummaryDates();
    this.computeGanttRange();
    this.resizeAllCanvases();
    this.syncHeaderToBodyScroll();
    this.renderAll();
  }

  private calculateDropMode(x: number, y: number): DropMode {
    const rowIndex = Math.floor(y / this.rowHeight);
    if (rowIndex < 0) return { kind: 'none' };
    if (rowIndex >= this.flatRows.length) {
      return { kind: 'insert', beforeRowIndex: this.flatRows.length };
    }

    const overRowTop = rowIndex * this.rowHeight;
    const offsetWithin = y - overRowTop;

    const margin = 6;
    if (offsetWithin <= margin) {
      return { kind: 'insert', beforeRowIndex: rowIndex };
    }
    if (offsetWithin >= this.rowHeight - margin) {
      return { kind: 'insert', beforeRowIndex: rowIndex + 1 };
    }

    const xNameStart = this.leftOfColumn('name'); // если name нет — вернётся начало зоны данных
    const minXForChild = xNameStart + 10;
    if (x >= minXForChild) {
      return { kind: 'child', targetRowIndex: rowIndex };
    }
    return { kind: 'insert', beforeRowIndex: rowIndex };
  }

  private computeInsertParentAndIndex(beforeFlatIndex: number, movingId: string): { newParentId: string | null, insertIndex: number } {
    if (beforeFlatIndex >= this.flatRows.length) {
      return { newParentId: null, insertIndex: this.workingData.length };
    }

    const target = this.flatRows[beforeFlatIndex];
    const newParentId = target.parentId;

    const parentList = (newParentId === null)
      ? this.workingData
      : (findNodeUtil(this.workingData, newParentId)?.children ?? []);

    let insertIndex = 0;
    for (let i = 0; i < parentList.length; i++) {
      if (parentList[i].id === target.id) {
        insertIndex = i;
        break;
      }
    }

    const movingLoc = findParentListAndIndex(this.workingData, movingId);
    if (movingLoc && movingLoc.parentList === parentList && movingLoc.index < insertIndex) {
      insertIndex = Math.max(0, insertIndex - 1);
    }

    return { newParentId, insertIndex };
  }

  // ==================== Resize & Render (все панели) ====================
  private resizeAllCanvases() {
    this.resizeTableCanvases();
    this.resizeGanttCanvases();
  }

  // --- таблица ---
  private resizeTableCanvases() {
    const host = this.hostRef.nativeElement;
    const bodyWrapper = this.bodyWrapperRef.nativeElement;
    const headerCanvas = this.headerCanvasRef.nativeElement;
    const bodyCanvas = this.canvasRef.nativeElement;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

    const contentWidth =
      this.colGrip + this.colToggle +
      this.columns.reduce((s, c) => s + c.width, 0);
    const contentHeight = this.headerHeight + this.flatRows.length * this.rowHeight;

    const headerCssWidth = Math.max(host.clientWidth, contentWidth);
    headerCanvas.width  = Math.floor(headerCssWidth * dpr);
    headerCanvas.height = Math.floor(this.headerHeight * dpr);
    headerCanvas.style.width  = `${headerCssWidth}px`;
    headerCanvas.style.height = `${this.headerHeight}px`;
    const hctx = headerCanvas.getContext('2d')!;
    hctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const bodyCssWidth  = headerCssWidth;
    const bodyCssHeight = Math.max(bodyWrapper.clientHeight, contentHeight - this.headerHeight);
    bodyCanvas.width  = Math.floor(bodyCssWidth * dpr);
    bodyCanvas.height = Math.floor(bodyCssHeight * dpr);
    bodyCanvas.style.width  = `${bodyCssWidth}px`;
    bodyCanvas.style.height = `${bodyCssHeight}px`;
    const bctx = bodyCanvas.getContext('2d')!;
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // --- гантт ---
  private resizeGanttCanvases() {
    if (!this.showGantt) return;
    const host = this.ganttHostRef.nativeElement;
    const wrapper = this.ganttWrapperRef.nativeElement;
    const headerCanvas = this.ganttHeaderCanvasRef.nativeElement;
    const bodyCanvas = this.ganttCanvasRef.nativeElement;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

    const totalDays = Math.max(1, Math.ceil((this.ganttEndMs - this.ganttStartMs) / MS_PER_DAY));
    const contentWidth = totalDays * this.ganttPxPerDay;
    const contentHeight = this.headerHeight + this.flatRows.length * this.rowHeight;

    const headerCssWidth = Math.max(host.clientWidth, contentWidth);
    headerCanvas.width = Math.floor(headerCssWidth * dpr);
    headerCanvas.height = Math.floor(this.headerHeight * dpr);
    headerCanvas.style.width = `${headerCssWidth}px`;
    headerCanvas.style.height = `${this.headerHeight}px`;
    const hctx = headerCanvas.getContext('2d')!;
    hctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const bodyCssWidth = headerCssWidth;
    const bodyCssHeight = Math.max(wrapper.clientHeight, contentHeight - this.headerHeight);
    bodyCanvas.width = Math.floor(bodyCssWidth * dpr);
    bodyCanvas.height = Math.floor(bodyCssHeight * dpr);
    bodyCanvas.style.width = `${bodyCssWidth}px`;
    bodyCanvas.style.height = `${bodyCssHeight}px`;
    const bctx = bodyCanvas.getContext('2d')!;
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /**
   * Computes the visible row index range for a scrollable wrapper (inclusive).
   */
  private visibleRowRange(wrapper: HTMLElement): { startIndex: number; endIndex: number } {
    const rh = this.rowHeight;
    const scrollTop = wrapper.scrollTop;
    const clientH = wrapper.clientHeight;
    const total = this.flatRows.length;

    if (total === 0) return { startIndex: 0, endIndex: -1 };

    let startIndex = Math.floor(scrollTop / rh);
    let endIndex = Math.ceil((scrollTop + clientH) / rh) - 1;

    if (startIndex < 0) startIndex = 0;
    if (endIndex >= total) endIndex = total - 1;

    return { startIndex, endIndex };
  }

  private renderAll() {
    this.renderHeader();
    this.renderBody();
    this.renderGanttHeader();
    this.renderGanttBody();
  }

  // ---------- ТАБЛИЦА: отрисовка ----------
  private renderHeader() {
    const canvas = this.headerCanvasRef.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width  = parseInt(canvas.style.width, 10);
    const height = this.headerHeight;

    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = this.headerBg;
    ctx.fillRect(0, 0, width, height);

    const xGrip = 0;
    const xToggle = xGrip + this.colGrip;
    const xDataStart = xToggle + this.colToggle;

    // Вертикали: после Grip, после Toggle и после каждого data-столбца
    ctx.beginPath();
    ctx.moveTo(this.colGrip + 0.5, 0);                        // после Grip
    ctx.lineTo(this.colGrip + 0.5, height);
    ctx.moveTo((this.colGrip + this.colToggle) + 0.5, 0);     // после Toggle
    ctx.lineTo((this.colGrip + this.colToggle) + 0.5, height);

    let cursor = xDataStart;
    for (const col of this.columns) {
      const right = cursor + col.width;
      ctx.moveTo(right + 0.5, 0);
      ctx.lineTo(right + 0.5, height);
      cursor = right;
    }
    ctx.strokeStyle = this.headerBorder;
    ctx.stroke();

    // Тексты заголовков
    ctx.font = this.headerFont;
    ctx.fillStyle = this.textColor;
    ctx.textBaseline = 'middle';

    cursor = xDataStart;
    for (const col of this.columns) {
      this.drawClippedText(ctx, col.title, cursor, height / 2, col.width, 10);
      cursor += col.width;
    }

    // Нижняя граница хедера
    ctx.strokeStyle = this.headerBorder;
    ctx.beginPath();
    ctx.moveTo(0, height + 0.5);
    ctx.lineTo(width, height + 0.5);
    ctx.stroke();

    // Подсветка наведённого делителя
    if (this.hoverDividerX != null) {
      ctx.save();
      ctx.strokeStyle = '#4c8dff';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(this.hoverDividerX + 0.5, 0);
      ctx.lineTo(this.hoverDividerX + 0.5, height);
      ctx.stroke();
      ctx.restore();
    }
  }

  private renderBody() {
    const canvas = this.canvasRef.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width  = parseInt(canvas.style.width, 10);
    const height = parseInt(canvas.style.height, 10);

    // Compute visible range
    const { startIndex, endIndex } = this.visibleRowRange(this.bodyWrapperRef.nativeElement);

    ctx.clearRect(0, 0, width, height);

    const xGrip = 0;
    const xToggle = xGrip + this.colGrip;
    const xDataStart = xToggle + this.colToggle;

    ctx.font = this.font;

    for (let i = startIndex; i <= endIndex; i++) {
      const y = i * this.rowHeight;

      // зебра
      if (i % 2 === 1) {
        ctx.fillStyle = this.zebraColor;
        ctx.fillRect(0, y, width, this.rowHeight);
      }

      const row = this.flatRows[i];

      // фон уровня для родителя (как у вас было)
      if (row.hasChildren) {
        ctx.fillStyle = this.getLevelColor(row.level);
        ctx.fillRect(this.colGrip, y, width - this.colGrip, this.rowHeight);
      }

      // нижняя линия строки
      ctx.beginPath();
      ctx.moveTo(0, y + this.rowHeight + 0.5);
      ctx.lineTo(width, y + this.rowHeight + 0.5);
      ctx.strokeStyle = this.gridColor;
      ctx.stroke();

      // текст
      ctx.fillStyle = this.textColor;
      ctx.textBaseline = 'middle';

      // grip + уровни + треугольник — без изменений
      this.drawGrip(ctx, xGrip + 10, y + (this.rowHeight - this.gripDotBox) / 2, this.gripDotBox, this.gripDotBox);
      this.drawLevelIndicators(ctx, row.level, y, xToggle);

      if (row.hasChildren) {
        const triSize = 12;
        const triX = xToggle + 8 + this.toggleIndentPerLevel * row.level;
        const triY = y + (this.rowHeight - triSize) / 2;
        ctx.save();
        ctx.beginPath();
        if (this.collapsed.has(row.id)) {
          ctx.moveTo(triX + 2,  triY + 2);
          ctx.lineTo(triX + 10, triY + 6);
          ctx.lineTo(triX + 2,  triY + 10);
        } else {
          ctx.moveTo(triX + 2,  triY + 3);
          ctx.lineTo(triX + 10, triY + 3);
          ctx.lineTo(triX + 6,  triY + 11);
        }
        ctx.closePath();
        ctx.fillStyle = '#666';
        ctx.fill();
        ctx.restore();
      }

      // значения ячеек по columns
      const midY = y + this.rowHeight / 2;
      let cursor = xDataStart;
      for (const col of this.columns) {
        const val = this.getCellValue(row, col.key);
        this.drawClippedText(ctx, val, cursor, midY, col.width, 10);
        cursor += col.width;
      }
    }

    // вертикальные линии сетки (после Grip, после Toggle, после каждого столбца)
    ctx.beginPath();
    ctx.moveTo(this.colGrip + 0.5, 0);
    ctx.lineTo(this.colGrip + 0.5, height);
    ctx.moveTo((this.colGrip + this.colToggle) + 0.5, 0);
    ctx.lineTo((this.colGrip + this.colToggle) + 0.5, height);

    let edge = xDataStart;
    for (const col of this.columns) {
      edge += col.width;
      ctx.moveTo(edge + 0.5, 0);
      ctx.lineTo(edge + 0.5, height);
    }
    ctx.strokeStyle = this.gridColor;
    ctx.stroke();

    // подсветка наведённого делителя
    if (this.hoverDividerX != null) {
      ctx.save();
      ctx.strokeStyle = '#4c8dff';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(this.hoverDividerX + 0.5, 0);
      ctx.lineTo(this.hoverDividerX + 0.5, height);
      ctx.stroke();
      ctx.restore();
    }

    if (this.isDragging && this.dragRowIndex >= 0) {
      const ghostY = this.lastMouseY - this.dragMouseDy;
      this.drawDragGhost(ctx, this.dragRowIndex, ghostY, width);

      if (this.dropMode.kind === 'insert') {
        const insY = this.dropMode.beforeRowIndex * this.rowHeight;
        this.drawInsertLine(ctx, insY, width);
      } else if (this.dropMode.kind === 'child') {
        const rectY = this.dropMode.targetRowIndex * this.rowHeight;
        this.drawDashedRect(ctx, 0, rectY, width, this.rowHeight);
      }
    }
  }

  // ---------- ГАНТТ: диапазон и отрисовка ----------
  private computeGanttRange() {
    if (!this.workingData.length) {
      const now = Date.now();
      this.ganttStartMs = now;
      this.ganttEndMs = now + 30 * MS_PER_DAY;
      return;
    }
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;

    const walk = (nodes: Node[]) => {
      for (const n of nodes) {
        const s = new Date(n.start + 'T00:00:00').getTime();
        const f = new Date(n.finish + 'T00:00:00').getTime();
        if (!isNaN(s)) min = Math.min(min, s);
        if (!isNaN(f)) max = Math.max(max, f);
        if (n.baselineStart) {
          const bs = new Date(n.baselineStart + 'T00:00:00').getTime();
          if (!isNaN(bs)) min = Math.min(min, bs);
        }
        if (n.baselineFinish) {
          const bf = new Date(n.baselineFinish + 'T00:00:00').getTime();
          if (!isNaN(bf)) max = Math.max(max, bf);
        }
        if (n.children?.length) walk(n.children);
      }
    };
    walk(this.workingData);

    if (!isFinite(min) || !isFinite(max)) {
      const now = Date.now();
      min = now; max = now + 30 * MS_PER_DAY;
    }

    // небольшой запас по 7 дней с каждой стороны
    this.ganttStartMs = min - 7 * MS_PER_DAY;
    this.ganttEndMs   = max + 7 * MS_PER_DAY;
  }




private renderGanttHeader() {
  if (!this.showGantt) return;
  const canvas = this.ganttHeaderCanvasRef.nativeElement;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const width  = parseInt(canvas.style.width, 10);
  const height = this.headerHeight;
  const half   = Math.floor(height / 2);

  ctx.clearRect(0, 0, width, height);

  // фон
  ctx.fillStyle = this.headerBg;
  ctx.fillRect(0, 0, width, height);

  const pxPerDay = this.ganttPxPerDay;
  const startMs  = this.ganttStartMs;
  const endMs    = this.ganttEndMs;

  // Разделительная горизонтальная линия между строками заголовка
  ctx.strokeStyle = this.headerBorder;
  ctx.beginPath();
  ctx.moveTo(0, half + 0.5);
  ctx.lineTo(width, half + 0.5);
  ctx.stroke();

  // выбрать пары единиц и сетку из текущего масштаба
  let top: TimeUnit, bottom: TimeUnit, grid: TimeUnit;
  switch (this.ganttScale) {
    case 'week-day':       top = 'week';    bottom = 'day';     grid = 'day';     break;
    case 'month-week':     top = 'month';   bottom = 'week';    grid = 'week';    break;
    case 'quarter-month':  top = 'quarter'; bottom = 'month';   grid = 'month';   break;
    case 'year-month':     top = 'year';    bottom = 'month';   grid = 'month';   break;
    case 'year-quarter':   top = 'year';    bottom = 'quarter'; grid = 'quarter'; break;
  }

  ctx.font = this.headerFont;
  ctx.fillStyle = this.textColor;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';

  // ===== Верхняя строка =====
  {
    let cur = startOfUnit(new Date(startMs), top);
    while (cur.getTime() < endMs) {
      const next = nextUnitStart(cur, top);
      const segStart = Math.max(startMs, cur.getTime());
      const segEnd   = Math.min(endMs, next.getTime());

      const x0 = Math.round(((segStart - startMs) / MS_PER_DAY) * pxPerDay);
      const x1 = Math.round(((segEnd   - startMs) / MS_PER_DAY) * pxPerDay);
      const cx = x0 + (x1 - x0) / 2;

      // подпись в верхней половине
      ctx.fillText(formatTopLabel(cur, top), cx, Math.floor(half / 2));

      // вертикальная граница сегмента верхней строки (только до половины)
      ctx.strokeStyle = this.headerBorder;
      ctx.beginPath();
      ctx.moveTo(x1 + 0.5, 0);
      ctx.lineTo(x1 + 0.5, half);
      ctx.stroke();

      cur = next;
    }
  }

  // ===== Нижняя строка =====
  {
    let cur = startOfUnit(new Date(startMs), bottom);
    const midY = half + Math.floor(half / 2);

    while (cur.getTime() < endMs) {
      const next = nextUnitStart(cur, bottom);
      const segStart = Math.max(startMs, cur.getTime());
      const segEnd   = Math.min(endMs, next.getTime());

      const x0 = Math.round(((segStart - startMs) / MS_PER_DAY) * pxPerDay);
      const x1 = Math.round(((segEnd   - startMs) / MS_PER_DAY) * pxPerDay);
      const cx = x0 + (x1 - x0) / 2;

      // вертикальная линия нижнего сегмента (только нижняя половина)
      ctx.strokeStyle = this.headerBorder;
      ctx.beginPath();
      ctx.moveTo(x0 + 0.5, half);
      ctx.lineTo(x0 + 0.5, height);
      ctx.stroke();

      // подпись в нижней половине (сокращённая)
      ctx.fillStyle = this.textColor;
      ctx.fillText(formatLabel(cur, bottom), cx, midY);

      cur = next;
    }
  }

  // нижняя граница заголовка
  ctx.strokeStyle = this.headerBorder;
  ctx.beginPath();
  ctx.moveTo(0, height + 0.5);
  ctx.lineTo(width, height + 0.5);
  ctx.stroke();

  // стартовая вертикаль для нижней половины
  ctx.beginPath();
  ctx.moveTo(0.5, half);
  ctx.lineTo(0.5, height);
  ctx.stroke();

  if (this.refLines?.length) {
    for (const rl of this.refLines) {
      const ms = toMs(rl.date);
      if (ms < this.ganttStartMs || ms > this.ganttEndMs) continue;
      const x = this.dateToX(ms);
  
      ctx.save();
      if (rl.dash) ctx.setLineDash(rl.dash);
      ctx.strokeStyle = rl.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
  
      // Подпись (необязательная "плашка" наверху)
      if (rl.name) {
        const text = rl.name;
        ctx.font = this.headerFont;
        const tw = ctx.measureText(text).width;
        const pad = 4;
        const bx = Math.min(Math.max(4, x + 4), width - tw - 8);
        const by = 2;
  
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillRect(bx - pad, by - pad, tw + pad * 2, 14 + pad * 2);
  
        ctx.fillStyle = rl.color;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(text, bx, by + 2);
      }
      ctx.restore();
    }
  }
}

  private renderGanttBody() {
    if (!this.showGantt) return;
    const canvas = this.ganttCanvasRef.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const strokeBlack = '#000';
    const width  = parseInt(canvas.style.width, 10);
    const height = parseInt(canvas.style.height, 10);
    const pxPerDay = this.ganttPxPerDay;

    // Compute visible range
    const { startIndex, endIndex } = this.visibleRowRange(this.ganttWrapperRef.nativeElement);

    ctx.clearRect(0, 0, width, height);

    // выбрать "единицу сетки" из текущего масштаба
    let grid: TimeUnit;
    switch (this.ganttScale) {
      case 'week-day':       grid = 'day';     break;
      case 'month-week':     grid = 'week';    break;
      case 'quarter-month':  grid = 'month';   break;
      case 'year-month':     grid = 'month';   break;
      case 'year-quarter':   grid = 'quarter'; break;
    }

    // вертикальные линии сетки по выбранной единице
    ctx.strokeStyle = '#ececec';
    let cur = startOfUnit(new Date(this.ganttStartMs), grid);
    while (cur.getTime() <= this.ganttEndMs) {
      const x = Math.round(((cur.getTime() - this.ganttStartMs) / MS_PER_DAY) * pxPerDay) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
      cur = nextUnitStart(cur, grid);
    }

    // горизонтальные разделители строк
    for (let i = startIndex; i <= endIndex; i++) {
      const y = i * this.rowHeight;
      ctx.beginPath();
      ctx.moveTo(0, y + this.rowHeight + 0.5);
      ctx.lineTo(width, y + this.rowHeight + 0.5);
      ctx.strokeStyle = this.gridColor;
      ctx.stroke();
    }

    // хелпер для скруглённых прямоугольников
    const roundRect = (x: number, y: number, w: number, h: number, r: number) => {
      const rr = Math.min(r, h / 2, w / 2);
      ctx.beginPath();
      ctx.moveTo(x + rr, y);
      ctx.lineTo(x + w - rr, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
      ctx.lineTo(x + w, y + h - rr);
      ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
      ctx.lineTo(x + rr, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
      ctx.lineTo(x, y + rr);
      ctx.quadraticCurveTo(x, y, x + rr, y);
      ctx.closePath();
    };

    // бары задач (без изменений)
    for (let i = startIndex; i <= endIndex; i++) {
      const row = this.flatRows[i];
      const node = this.nodeIndex.get(row.id);
       // фактические даты
      const startStr  = node?.start  ?? row.start;
      const finishStr = node?.finish ?? row.finish;
      const s = new Date(startStr  + 'T00:00:00').getTime();
      const f = new Date(finishStr + 'T00:00:00').getTime();
      const x0 = Math.round(((s - this.ganttStartMs) / MS_PER_DAY) * pxPerDay);
      const x1 = Math.round(((f - this.ganttStartMs) / MS_PER_DAY) * pxPerDay);
      const w  = Math.max(3, x1 - x0);

      // baseline (если есть)
      const bStartStr  = node?.baselineStart ?? row.baselineStart;
      const bFinishStr = node?.baselineFinish ?? row.baselineFinish;
      const hasBaseline = !!(bStartStr && bFinishStr);

      let bx0 = 0, bx1 = 0, bw = 0;
      if (hasBaseline) {
        const bs = new Date(bStartStr! + 'T00:00:00').getTime();
        const bf = new Date(bFinishStr! + 'T00:00:00').getTime();
        const _bx0 = Math.round(((bs - this.ganttStartMs) / MS_PER_DAY) * pxPerDay);
        const _bx1 = Math.round(((bf - this.ganttStartMs) / MS_PER_DAY) * pxPerDay);
        bx0 = Math.min(_bx0, _bx1);
        bx1 = Math.max(_bx0, _bx1);
        bw  = Math.max(3, bx1 - bx0);
      }

      // геометрия двух дорожек внутри строки
      const rowTop = i * this.rowHeight;
      const pad    = this.taskPad;
      const gap    = this.taskGap;
      const trackH = this.taskTrackH;
      
      const yActual   = rowTop + pad;              // верхняя дорожка — ACTUAL
      const yBaseline = yActual + trackH + gap;    // нижняя дорожка — BASELINE
      const r = 1;                                  // радиус углов

      if (row.hasChildren) {
        const groupFill = this.colorOf('group');
        
        const yc   = i * this.rowHeight + this.rowHeight / 2;
        const thick = 6;
        const capMax = 8;
        const cap = Math.min(capMax, Math.floor(w / 2));
        const yTop = Math.round(yc - thick / 2) + 0.5;
        const yBot = Math.round(yc + thick / 2) + 0.5;
        const coreX0 = x0 + cap;
        const coreX1 = x1 - cap;
        const fill   = groupFill;
        const stroke = strokeBlack;

        ctx.save();
        if (coreX1 > coreX0) {
          ctx.fillStyle = fill;
          ctx.fillRect(coreX0, yTop - 0.5, coreX1 - coreX0, (yBot - yTop) + 1);
        }
        // левая "кепка"
        ctx.beginPath();
        ctx.moveTo(x0, yBot);
        ctx.lineTo(coreX0, yBot);
        ctx.lineTo(x0, yBot + cap);
        ctx.closePath();
        ctx.fillStyle = fill; ctx.fill();
        ctx.strokeStyle = stroke; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x0, yBot); ctx.lineTo(x0, yBot + cap);
        ctx.moveTo(x0, yBot + cap); ctx.lineTo(coreX0, yBot);
        ctx.stroke();
        // правая "кепка"
        ctx.beginPath();
        ctx.moveTo(x1, yBot);
        ctx.lineTo(coreX1, yBot);
        ctx.lineTo(x1, yBot + cap);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        // верх/низ
        ctx.fillStyle = fill;
        ctx.fillRect(x0, yTop - 0.5, Math.max(0, coreX0 - x0), (yBot - yTop) + 1);
        ctx.fillRect(coreX1, yTop - 0.5, Math.max(0, x1 - coreX1), (yBot - yTop) + 1);
        ctx.strokeStyle = stroke;
        ctx.beginPath();
        ctx.moveTo(x0, yTop); ctx.lineTo(x1, yTop);
        ctx.moveTo(coreX0-1, yBot); ctx.lineTo(coreX1+1, yBot);
        ctx.moveTo(x0, yTop); ctx.lineTo(x0, yBot);
        ctx.moveTo(x1, yTop); ctx.lineTo(x1, yBot);
        ctx.stroke();
        // === Прогресс для суммарного бара: внутренняя полоса ===
        //const prog = this.rowProgress01(i);
        //const pw = Math.max(0, Math.round(w * prog));
        //if (pw > 0) {
        //  const trackH = 4;                      // чуть тоньше, чтобы выглядело аккуратно
        //  const ty = Math.round(yc - trackH / 2) + 0.5;
        //  ctx.fillStyle = '#3d7bfd';
        //  ctx.fillRect(x0, ty, pw, trackH);
        //}
        ctx.restore();

      } else {

        const isCritical = !!(node?.critical);
        const actualColor = isCritical ? this.colorOf('criticalpatch')
                                       : this.colorOf('actual');
        const actualBase  = this.rgba(actualColor, 0.35);  // «остаток» светлее основного
      
        // baseline (если есть)
        const bStartStr  = node?.baselineStart ?? row.baselineStart;
        const bFinishStr = node?.baselineFinish ?? row.baselineFinish;
        const hasBaseline = !!(bStartStr && bFinishStr);

        if (hasBaseline) {
          // === BASELINE (нижняя дорожка) ===
          const baselineColor = this.colorOf('baseline');
          ctx.save();
          roundRect(bx0, yBaseline, bw, trackH, r);
          ctx.fillStyle = this.rgba(baselineColor, 1);          // slate-300 (тело baseline)
          ctx.fill();
          ctx.lineWidth = 1;
          ctx.strokeStyle = strokeBlack;//baselineColor;      // slate-400 (контур baseline)
          ctx.stroke();
          ctx.restore();
    
          // === ACTUAL (верхняя дорожка) ===
          const prog = this.rowProgress01(i);
          const pw = Math.max(0, Math.round(w * prog));
    
          ctx.save();
          // тело actual
          roundRect(x0, yActual, w, trackH, r);
          ctx.clip();
          // остаток (светлее)
          ctx.fillStyle = actualBase;
          ctx.fillRect(x0, yActual, w, trackH);
          // прогресс (темнее)
          ctx.fillStyle = actualColor;
          if (pw > 0) ctx.fillRect(x0, yActual, pw, trackH);
          ctx.restore();
    
          // обводка actual
          ctx.save();
          roundRect(x0, yActual, w, trackH, r);
          ctx.strokeStyle = strokeBlack//actualColor;
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.restore();
    
        } else {
          const y = i * this.rowHeight + 6;
          const h = this.rowHeight - 12;
          const r = 1;
          const prog = this.rowProgress01(i);
          const cw = Math.max(0, Math.round(w * prog));
          ctx.save();
          ctx.strokeStyle = strokeBlack;  
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x0 + r, y);
          ctx.lineTo(x0 + w - r, y);
          ctx.quadraticCurveTo(x0 + w, y, x0 + w, y + r);
          ctx.lineTo(x0 + w, y + h - r);
          ctx.quadraticCurveTo(x0 + w, y + h, x0 + w - r, y + h);
          ctx.lineTo(x0 + r, y + h);
          ctx.quadraticCurveTo(x0, y + h, x0, y + h - r);
          ctx.lineTo(x0, y + r);
          ctx.quadraticCurveTo(x0, y, x0 + r, y);
          ctx.closePath();
          ctx.save();
          ctx.clip();
          // База (остаток) — светлая
          ctx.fillStyle = actualBase;
          ctx.fillRect(x0, y, w, h);
          // Прогресс — тёмнее
          ctx.fillStyle = actualColor;
          if (cw > 0) ctx.fillRect(x0, y, cw, h);

          ctx.restore(); // снять клип
          // Обводка по прежнему пути
          ctx.stroke();
          ctx.restore();
        }
        

      }
    }
    if (this.refLines?.length) {
      for (const rl of this.refLines) {
        const ms = toMs(rl.date);
        if (ms < this.ganttStartMs || ms > this.ganttEndMs) continue;
        const x = this.dateToX(ms);
    
        ctx.save();
        if (rl.dash) ctx.setLineDash(rl.dash);
        ctx.strokeStyle = rl.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
        ctx.restore();
      }
    }

    // dependency connectors on top of everything
    this.drawDependencies(ctx);
    this.drawLinkPreviewAndHandles(ctx);
  }

// Синхронизация complete при изменениях (не обязательно)
// Если вы где-то обновляете node.complete и хотите сразу видеть это в таблице без полного prepareData(), можно добавить маленькую синхронизацию (по аналогии с датами):

private updateFlatRowComplete(rowId: string) {
  const node = this.nodeIndex.get(rowId);
  if (!node) return;
  const fr = this.flatRows.find(r => r.id === rowId);
  if (!fr) return;
  fr.complete = Math.max(0, Math.min(100, Number(node.complete ?? 0)));
}

private drawLinkPreviewAndHandles(ctx: CanvasRenderingContext2D) {
 
  // при hover над баром (не во время протяжки связи) показываем ТОЛЬКО правый кружок
  if (this.linkMode === 'none' && this.hoverBarRow != null) {
    const row = this.hoverBarRow;
    const p   = this.barPixelsForRowIndex(row);

    // какой край сейчас занят ресайзом — этот кружок скрываем
    //const hideLeft  = this.hoverGanttHitMode === 'resize-start';
    const hideRight = this.hoverGanttHitMode === 'resize-finish';

    //if (!hideLeft) {
    //  const lc = this.leftHandleCenter(row);   // уже с выносом за бар
    //  this.drawHandleWithStem(ctx, p.x0, lc.x, lc.y, 'left',  false);
    //}
    if (!hideRight) {
      const rc = this.rightHandleCenter(row);  // уже с выносом за бар
      this.drawHandleWithStem(ctx, p.x1, rc.x, rc.y, 'right', false);
    }
  }

  // во время протяжки — рисуем пунктир и кружки источника/цели
  if (this.linkMode === 'drag' && this.linkSourceRow >= 0) {
    const src = this.barPixelsForRowIndex(this.linkSourceRow);
    const rc  = this.rightHandleCenter(this.linkSourceRow);
    const sx1 = src.x1, sy = src.yMid;

    this.drawHandleWithStem(ctx, src.x1, rc.x, rc.y, 'right', true);

    
    

    ctx.save();
    ctx.setLineDash([6,4]);
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.5;
    if (this.linkHoverTargetRow != null) {
      const t  = this.barPixelsForRowIndex(this.linkHoverTargetRow);
      const lc = this.leftHandleCenter(this.linkHoverTargetRow);
      // ортогональный предпросмотр «классического» маршрута до левого края цели
      const tx0 = t.x0, ty = t.yMid;
      const padH = 10, padV = 8;
      const targetBelow = this.linkHoverTargetRow > this.linkSourceRow;
      const yClear = targetBelow ? (t.yTop - padV) : (t.yBot + padV);
      const xL = tx0 - padH;

      // минимальный выход вправо от sx1
      const gap = tx0 - sx1;
      const entryLen = tx0 - xL;         // = padH
      const exitLen = Math.max(0, Math.min(gap - entryLen, gap));
      const xExit = sx1 + exitLen;

      ctx.beginPath();
      ctx.moveTo(sx1 + 0.5, sy + 0.5);
      ctx.lineTo(xExit + 0.5, sy + 0.5);
      ctx.lineTo(xExit + 0.5, yClear + 0.5);
      ctx.lineTo(xL + 0.5,  yClear + 0.5);
      ctx.lineTo(xL + 0.5,  ty + 0.5);
      ctx.lineTo(tx0 + 0.5, ty + 0.5);
      ctx.stroke();

      // кружок цели слева (подсветка)
      //this.drawHandle(ctx, lc.x, lc.y, 'left', true);
      this.drawHandleWithStem(ctx, t.x0, lc.x, lc.y, 'left', true);
    } else {
      // свободная протяжка: короткий выход → вертикаль к мыши → горизонталь к мыши
      const xExit = sx1 + 8;
      ctx.beginPath();
      ctx.moveTo(sx1 + 0.5, sy + 0.5);
      ctx.lineTo(xExit + 0.5, sy + 0.5);
      ctx.lineTo(xExit + 0.5, this.linkMouseY + 0.5);
      ctx.lineTo(this.linkMouseX + 0.5, this.linkMouseY + 0.5);
      ctx.stroke();
    }
    ctx.restore();
  }
}

// ── Внутри класса, рядом с визуальными параметрами ──
private summaryThick = 6;   // толщина summary-бара по центру строки
private taskPad = 4;        // внешний отступ сверху/снизу для дорожек task
private taskGap = 3;        // зазор между actual и baseline
private get taskTrackH(): number {
  // высота одной дорожки (actual/baseline) при наличии baseline
  return Math.max(4, Math.floor((this.rowHeight - this.taskPad * 2 - this.taskGap) / 2));
}

  /** Returns bar pixel coordinates for a given row index (x0/x1 and y top/mid/bot). */
  private barPixelsForRowIndex(i: number): {
    x0: number; x1: number; yTop: number; yMid: number; yBot: number
  } {
    const row  = this.flatRows[i];
    const node = this.nodeIndex.get(row.id);
  
    // фактические даты → пиксели
    const startStr  = node?.start  ?? row.start;
    const finishStr = node?.finish ?? row.finish;
    const s  = new Date(startStr  + 'T00:00:00').getTime();
    const f  = new Date(finishStr + 'T00:00:00').getTime();
    const x0 = Math.round(((s - this.ganttStartMs) / MS_PER_DAY) * this.ganttPxPerDay);
    const x1 = Math.round(((f - this.ganttStartMs) / MS_PER_DAY) * this.ganttPxPerDay);
  
    const rowTop = i * this.rowHeight;
  
    // summary: толщина по центру строки
    if (row.hasChildren) {
      const yMid = rowTop + this.rowHeight / 2;
      const yTop = Math.round(yMid - this.summaryThick / 2) + 0.5;
      const yBot = Math.round(yMid + this.summaryThick / 2) + 0.5;
      return { x0, x1, yTop, yMid, yBot };
    }
  
    // task: если есть baseline — центруем по верхнему actual-треку
    const bStartStr  = node?.baselineStart ?? row.baselineStart;
    const bFinishStr = node?.baselineFinish ?? row.baselineFinish;
    const hasBaseline = !!(bStartStr && bFinishStr);
  
    if (hasBaseline) {
      const yTop = rowTop + this.taskPad;            // верхняя дорожка: actual
      const yBot = yTop + this.taskTrackH;
      const yMid = yTop + this.taskTrackH / 2;
      return { x0, x1, yTop, yMid, yBot };
    }
  
    // task без baseline — прямоугольник как раньше (6 px отступ сверху/снизу)
    const yTop = rowTop + 6;
    const yBot = rowTop + this.rowHeight - 6;
    const yMid = (yTop + yBot) / 2;
    return { x0, x1, yTop, yMid, yBot };
  }

  /** Small filled triangle arrowhead at (x,y) pointing given direction */
  private drawArrowhead(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    dir: 'left' | 'right' | 'up' | 'down',
    color: string
  ) {
    const sz = 5;
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    switch (dir) {
      case 'right':
        ctx.moveTo(x, y);
        ctx.lineTo(x - sz, y - sz * 0.75);
        ctx.lineTo(x - sz, y + sz * 0.75);
        break;
      case 'left':
        ctx.moveTo(x, y);
        ctx.lineTo(x + sz, y - sz * 0.75);
        ctx.lineTo(x + sz, y + sz * 0.75);
        break;
      case 'down':
        ctx.moveTo(x, y);
        ctx.lineTo(x - sz * 0.75, y - sz);
        ctx.lineTo(x + sz * 0.75, y - sz);
        break;
      case 'up':
        ctx.moveTo(x, y);
        ctx.lineTo(x - sz * 0.75, y + sz);
        ctx.lineTo(x + sz * 0.75, y + sz);
        break;
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /** Draws connectors using each node's `dependency` array.
   * Маршрут: из центра источника → вправо → (вниз/вверх к уровню около цели)
   * → влево над (или под) целевым баром → вертикально к центру цели
   * → коротко вправо и вход в центр бара со стрелкой.
   * Поддерживает dependency по id и по WBS.
   */
  private drawDependencies(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
  
    const padH = 10;         // горизонтальные отступы
    const padV = 8;          // вертикальный клиренс над/под целевым баром
    const stubExit = 4;      // длина короткого выхода из правого края источника
    const color = '#4a5568';
  
    for (let toIdx = 0; toIdx < this.flatRows.length; toIdx++) {
      const targetRow = this.flatRows[toIdx];
      const targetNode = this.nodeIndex.get(targetRow.id);
      const deps = targetNode?.dependency || [];
      if (!deps.length) continue;
  
      // Геометрия целевого бара
      const t = this.barPixelsForRowIndex(toIdx);
      const tx0 = t.x0, tx1 = t.x1;
      const tyTop = t.yTop, tyMid = t.yMid, tyBot = t.yBot;
  
      for (const dep of deps) {
        // resolve source index: сначала id, затем WBS
        let fromIdx = this.rowIndexById.get(dep);
        if (fromIdx === undefined) fromIdx = this.rowIndexByWbs.get(dep);
        if (fromIdx === undefined) continue;
  
        const s = this.barPixelsForRowIndex(fromIdx);
        const sx1 = s.x1;
        const syMid = s.yMid;
  
        // Берём реальные даты (ms) для сравнения
        const fromRow = this.flatRows[fromIdx];
        const fromNode = this.nodeIndex.get(fromRow.id);
        const fromFinishMs = new Date((fromNode?.finish ?? fromRow.finish) + 'T00:00:00').getTime();
        const targetStartMs = new Date((targetNode?.start ?? targetRow.start) + 'T00:00:00').getTime();
  
        const targetBelow = toIdx > fromIdx; // цель ниже источника?
        const yClear = targetBelow ? (tyTop - padV) : (tyBot + padV);
        const xL = tx0 - padH;
  

        ctx.strokeStyle = color;
  
        if (fromFinishMs >= targetStartMs) {
          // КОРОТКИЙ маршрут: маленький «штырёк» → вертикально → влево к xL
          const exitX = sx1 + stubExit;
          ctx.beginPath();
          ctx.moveTo(sx1 + 0.5, syMid + 0.5);
          ctx.lineTo(exitX + 0.5, syMid + 0.5);
          ctx.lineTo(exitX + 0.5, yClear + 0.5);
          ctx.lineTo(xL + 0.5, yClear + 0.5);
          ctx.stroke();
        } else {
          // КЛАССИЧЕСКИЙ маршрут: вправо за оба бара → вниз/вверх → влево к xL
          // расстояние между правым краем источника и левым краем цели
          const gap = tx0 - sx1;          // px
          const entryLen = tx0 - xL;      // = padH
          // длина горизонтального выхода из источника (не меньше 0 и не больше gap)
          const exitLen = Math.max(0, Math.min(gap - entryLen, gap));
          const xExit = sx1 + exitLen;

          ctx.strokeStyle = color;

          // 1) короткий горизонтальный выход вправо из правого ребра источника
          // 2) сразу вертикально к "эстакаде" над/под целью
          // 3) горизонтально до точки слева от цели (xL)
          ctx.beginPath();
          ctx.moveTo(sx1 + 0.5, syMid + 0.5);
          ctx.lineTo(xExit + 0.5, syMid + 0.5);
          ctx.lineTo(xExit + 0.5, yClear + 0.5);
          ctx.lineTo(xL + 0.5,  yClear + 0.5);
          ctx.stroke();

          // 4) вертикально в центр целевого бара
          ctx.beginPath();
          ctx.moveTo(xL + 0.5, yClear + 0.5);
          ctx.lineTo(xL + 0.5, tyMid  + 0.5);
          ctx.stroke();

          // 5) короткий ход вправо и вход в левую грань цели
          ctx.beginPath();
          ctx.moveTo(xL + 0.5, tyMid + 0.5);
          ctx.lineTo(tx0 + 0.5, tyMid + 0.5);
          ctx.stroke();

          this.drawArrowhead(ctx, tx0 + 0.5, tyMid + 0.5, 'right', color);
        }
  
        // Вертикально к центру цели
        ctx.beginPath();
        ctx.moveTo(xL + 0.5, yClear + 0.5);
        ctx.lineTo(xL + 0.5, tyMid + 0.5);
        ctx.stroke();
  
        // Коротко вправо и вход в левый край целевого бара
        ctx.beginPath();
        ctx.moveTo(xL + 0.5, tyMid + 0.5);
        ctx.lineTo(tx0 + 0.5, tyMid + 0.5);
        ctx.stroke();
  
        // Стрелка вправо — в центр левого ребра цели
        this.drawArrowhead(ctx, tx0 + 0.5, tyMid + 0.5, 'right', color);
      }
    }
  
    ctx.restore();
  }


  // ==================== Drawing helpers ====================
  private drawClippedText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    centerY: number,
    cellWidth: number,
    paddingLeft = 10
  ) {
    ctx.save();
    ctx.fillStyle = this.textColor;

    const maxW = Math.max(0, cellWidth - paddingLeft - 4);
    const baseX = x + paddingLeft;
    if (maxW <= 0) { ctx.restore(); return; }

    if (ctx.measureText(text).width <= maxW) {
      ctx.fillText(text, baseX, centerY);
      ctx.restore();
      return;
    }

    const ell = '…';
    const ellW = ctx.measureText(ell).width;
    let lo = 0, hi = text.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      const w = ctx.measureText(text.slice(0, mid)).width + ellW;
      if (w <= maxW) lo = mid; else hi = mid - 1;
    }
    const clipped = text.slice(0, lo) + ell;
    ctx.fillText(clipped, baseX, centerY);
    ctx.restore();
  }

  private drawLevelIndicators(ctx: CanvasRenderingContext2D, level: number, rowTopY: number, xToggle: number) {
    const barW = this.toggleIndentPerLevel;
    const h = this.rowHeight;

    for (let l = 0; l <= level; l++) {
      const x = xToggle + l * barW;
      const y = rowTopY;
      ctx.fillStyle = this.getLevelColor(l);
      ctx.fillRect(x, y, barW, h);
    }
  }

  private drawGrip(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
    const r = 1.2;
    const cols = 2, rows = 3;
    const gapX = (w - cols * (r * 2)) / (cols + 1);
    const gapY = (h - rows * (r * 2)) / (rows + 1);
    ctx.fillStyle = '#777';
    for (let cx = 0; cx < cols; cx++) {
      for (let cy = 0; cy < rows; cy++) {
        const px = x + gapX * (cx + 1) + (r * 2) * cx + r;
        const py = y + gapY * (cy + 1) + (r * 2) * cy + r;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawDragGhost(ctx: CanvasRenderingContext2D, rowIndex: number, yTop: number, width: number) {
    const row = this.flatRows[rowIndex];

    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = '#e6f0ff';
    ctx.fillRect(0, yTop, width, this.rowHeight);
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = '#4c8dff';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, yTop + 0.5, width - 1, this.rowHeight - 1);
    ctx.restore();

    ctx.save();
    ctx.font = this.font;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = this.textColor;

    const xDataStart = this.colGrip + this.colToggle;
    let cursor = xDataStart;
    const midY = yTop + this.rowHeight / 2;

    this.drawGrip(ctx, 0 + 10, yTop + (this.rowHeight - this.gripDotBox) / 2, this.gripDotBox, this.gripDotBox);
    this.drawLevelIndicators(ctx, row.level, yTop, this.colGrip);

    for (const col of this.columns) {
      const val = this.getCellValue(row, col.key);
      this.drawClippedText(ctx, val, cursor, midY, col.width);
      cursor += col.width;
    }
    ctx.restore();
  }

  private drawInsertLine(ctx: CanvasRenderingContext2D, y: number, width: number) {
    ctx.save();
    ctx.strokeStyle = '#4c8dff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
    ctx.restore();
  }

  private drawDashedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
    ctx.save();
    ctx.strokeStyle = '#4c8dff';
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
    ctx.restore();
  }

  // -------------------- Data Generation --------------------
  public addRandomNode() {
    const allNodes = this.getAllNodes(this.workingData);
    const potentialParents: (Node | null)[] = [null, ...allNodes];

    const parentNode = potentialParents[Math.floor(Math.random() * potentialParents.length)];

    const newNode = this.generateRandomWbsNode();

    if (parentNode === null) {
      this.workingData.push(newNode);
    } else {
      if (!parentNode.children) {
        parentNode.children = [];
      }
      parentNode.children.push(newNode);
      this.collapsed.delete(parentNode.id);
    }

    this.prepareData();
    this.computeGanttRange();
    this.resizeAllCanvases();
    this.syncHeaderToBodyScroll();
    this.syncGanttHeaderToScroll();
    this.renderAll();
  }

  private getAllNodes(nodes: Node[]): Node[] {
    let flatList: Node[] = [];
    for (const node of nodes) {
      flatList.push(node);
      if (node.children && node.children.length > 0) {
        flatList = flatList.concat(this.getAllNodes(node.children));
      }
    }
    return flatList;
  }

  private generateRandomWbsNode(): Node {
    const randomId = `gen-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const taskNames = ['Анализ требований', 'Проектирование архитектуры', 'Разработка модуля', 'Тестирование', 'Написание документации', 'Развертывание'];
    const randomName = `${taskNames[Math.floor(Math.random() * taskNames.length)]} #${Math.floor(Math.random() * 100)}`;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() + Math.floor(Math.random() * 365));
    const durationDays = 3 + Math.floor(Math.random() * 28);
    const finishDate = new Date(startDate);
    finishDate.setDate(finishDate.getDate() + durationDays);

    const formatDate = (d: Date): IsoDate => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}` as IsoDate;
    };

    const delta = Math.floor(Math.random() * 11) - 5; // -5..+5 дней
    const bStartDate = new Date(startDate);  bStartDate.setDate(bStartDate.getDate() + delta);
    const bFinishDate = new Date(finishDate); bFinishDate.setDate(bFinishDate.getDate() + delta);

    return {
      id: randomId,
      name: randomName,
      start: formatDate(startDate),
      finish: formatDate(finishDate),
      baselineStart: formatDate(bStartDate),
      baselineFinish: formatDate(bFinishDate),
      complete: Math.floor(Math.random() * 101)
    };
  }

  private rowProgress01(i: number): number {
    const fr = this.flatRows[i];
    const node = this.nodeIndex.get(fr.id);
    const pct = node?.complete ?? fr.complete ?? 0;
    const p = Math.max(0, Math.min(100, Number(pct)));
    return p / 100;
  }

  // -------------------- Синхронизация шапок --------------------
  private syncHeaderToBodyScroll() {
    const bodyWrapper = this.bodyWrapperRef.nativeElement;
    const headerCanvas = this.headerCanvasRef.nativeElement;
    headerCanvas.style.transform = `translateX(${-bodyWrapper.scrollLeft}px)`;
  }
  private syncGanttHeaderToScroll() {
    if (!this.showGantt) return;
    const wrapper = this.ganttWrapperRef.nativeElement;
    const headerCanvas = this.ganttHeaderCanvasRef.nativeElement;
    headerCanvas.style.transform = `translateX(${-wrapper.scrollLeft}px)`;
  }

    /**
   * Обновляет позицию бара при горизонтальном скролле гантта во время DnD.
   * Пересчитывает dxDays по последним координатам указателя и scrollLeft.
   */

    // ЗАМЕНИТЕ ВАШ ТЕКУЩИЙ МЕТОД ЭТИМ КОДОМ
// ЗАМЕНИТЕ ВАШ ТЕКУЩИЙ МЕТОД ЭТИМ КОДОМ
// ЗАМЕНИТЕ ВЕСЬ МЕТОД ЦЕЛИКОМ НА ЭТОТ КОД
// ЗАМЕНИТЕ ВЕСЬ МЕТОД ЦЕЛИКОМ НА ЭТОТ КОД
private updateGanttDragFromScroll() {
  if (!this.showGantt) return;
  if (this.ganttDragMode === 'none' || this.ganttDragRowIndex < 0) return;

  const wrap = this.ganttWrapperRef.nativeElement;

  // Рассчитываем, где СЕЙЧАС находится курсор в системе координат контента.
  const wrect = wrap.getBoundingClientRect();
  const currentContentX = (this.lastGanttClientX - wrect.left) + wrap.scrollLeft;
  
  let newStartMs = 0;
  let newFinishMs = 0;
  const durationMs = this.ganttDragFinishMs - this.ganttDragStartMs;

  // --- ИСПОЛЬЗУЕМ ТУ ЖЕ АБСОЛЮТНУЮ ЛОГИКУ, ЧТО И В onGanttMouseMove ---
  if (this.ganttDragMode === 'move') {
    // ИСПРАВЛЕНО: Используем точный пиксельный якорь ganttDragAnchorX
    const newBarLeftX = currentContentX - this.ganttDragAnchorX; 
    newStartMs = this.xToMs(newBarLeftX);
    newFinishMs = newStartMs + durationMs;
  } else if (this.ganttDragMode === 'resize-start') {
    newStartMs = this.xToMs(currentContentX);
    newFinishMs = this.ganttDragFinishMs;
    if (newStartMs > newFinishMs - MS_PER_DAY) {
      newStartMs = newFinishMs - MS_PER_DAY;
    }
  } else if (this.ganttDragMode === 'resize-finish') {
    newStartMs = this.ganttDragStartMs;
    newFinishMs = this.xToMs(currentContentX);
    if (newFinishMs < newStartMs + MS_PER_DAY) {
      newFinishMs = newStartMs + MS_PER_DAY;
    }
  }

  const rowId = this.flatRows[this.ganttDragRowIndex].id;
  this.commitGanttDates(rowId, newStartMs, newFinishMs);
  this.renderBody();

  // Немедленная перерисовка
  this.renderGanttBody();
  this.renderGanttHeader();
}}