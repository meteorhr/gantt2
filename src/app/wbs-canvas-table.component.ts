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
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { select, Selection } from 'd3-selection';
import { zoom, ZoomBehavior, ZoomTransform } from 'd3-zoom';

type IsoDate = `${number}-${number}-${number}`; // YYYY-MM-DD

export interface WbsNode {
  id: string;
  name: string;
  start: IsoDate;
  finish: IsoDate;
  children?: WbsNode[];
}

interface FlatRow {
  id: string;
  parentId: string | null;
  path: string[];
  wbs: string;
  name: string;
  start: string;
  finish: string;
  level: number;
  hasChildren: boolean;
}

type DropMode =
  | { kind: 'none' }
  | { kind: 'insert'; beforeRowIndex: number }
  | { kind: 'child'; targetRowIndex: number };

@Component({
  selector: 'wbs-canvas-table',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div>
      <button class="add-random-btn" (click)="addRandomNode()">+ Add Random Node</button>
    </div>

    <div class="center">
      <div #splitRoot class="split-root">
        <!-- Левая панель: Таблица -->
        <div class="pane pane-left" [style.flex-basis.%]="leftPct">
          <div #host class="wbs-host">
            <canvas #headerCanvas class="wbs-header-canvas"></canvas>
            <div #bodyWrapper class="wbs-body-wrapper">
              <canvas #canvas></canvas>
            </div>
          </div>
        </div>

        <!-- Разделитель -->
        <div class="splitter" (mousedown)="onSplitMouseDown($event)"></div>

        <!-- Правая панель: Гантт -->
        <div class="pane pane-right" [style.flex-basis.%]="100 - leftPct">
          <div #ganttHost class="gantt-host">
            <canvas #ganttHeaderCanvas class="wbs-header-canvas"></canvas>
            <div #ganttWrapper class="wbs-body-wrapper">
              <canvas #ganttCanvas></canvas>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .center {
      width: 100%;
      max-width: 100vw; /* не шире окна */
      margin: 0 auto;
    }
    .split-root {
      display: flex;
      align-items: stretch;
      width: 100%;
      max-width: 100vw;
      position: relative;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      background: #fff;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, "Noto Sans", "Apple Color Emoji", "Segoe UI Emoji";
    }
    .pane { position: relative; overflow: hidden; }
    .pane-left, .pane-right { min-width: 0; } /* чтобы flex не выталкивал контент */
    .splitter {
      flex: 0 0 6px;
      cursor: col-resize;
      background: repeating-linear-gradient(
        90deg, #e9ecef, #e9ecef 2px, #f8f9fa 2px, #f8f9fa 4px
      );
    }

    .wbs-host, .gantt-host {
      position: relative;
      width: 100%;
      overflow: hidden;
      background: #fff;
    }
    .wbs-header-canvas {
      position: sticky;
      top: 0;
      z-index: 5;
      display: block;
      background: #f5f7fb;
      border-bottom: 1px solid #dcdfe6;
    }
    .wbs-body-wrapper {
      position: relative;
      overflow: auto;
      max-height: 520px;
    }
    canvas { display: block; }

    .add-random-btn {
      position: absolute;
      top: 6px;
      right: 10px;
      z-index: 10;
      padding: 4px 10px;
      font-size: 11px;
      font-weight: 600;
      color: #fff;
      background-color: #3d7bfd;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      transition: background-color 0.2s;
    }
    .add-random-btn:hover { background-color: #2c67e8; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WbsCanvasTableComponent implements AfterViewInit, OnChanges, OnDestroy {

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

  // ===== Вводные данные =====
  @Input() set data(value: WbsNode[] | null) {
    this._externalData = value;
    if (this._initialized) {
      this.workingData = this.cloneTree(value && value.length ? value : this.demoData);
      if (this.collapsedByDefault) this.collapseAllWithChildren();
      this.prepareData();
      this.computeGanttRange();
      this.resizeAllCanvases();
      this.syncHeaderToBodyScroll();
      this.syncGanttHeaderToScroll();
      this.renderAll();
    }
  }
  get data(): WbsNode[] | null { return this._externalData; }
  private _externalData: WbsNode[] | null = null;

  @Input() toggleOnRowClick = true;
  @Input() collapsedByDefault = false;

  private destroyRef = inject(DestroyRef);

  // ===== Сплит-панель =====
  leftPct = 55;                // ширина левой панели в %
  private isResizingSplit = false;
  private splitStartX = 0;
  private splitStartLeftPct = 55;

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
  private colWbs = 120;
  private colName = 420;
  private colStart = 120;
  private colFinish = 120;

  // ===== D3 (для таблицы) =====
  private d3Canvas!: Selection<HTMLCanvasElement, unknown, null, undefined>;
  private zoomBehavior!: ZoomBehavior<HTMLCanvasElement, unknown>;
  private zoomTransform: ZoomTransform = { x: 0, y: 0, k: 1 } as ZoomTransform;

  // ===== Данные =====
  private workingData: WbsNode[] = [];
  private flatRows: FlatRow[] = [];
  private collapsed = new Set<string>();

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
  private resizeTarget: 'wbs' | 'name' | 'start' | 'finish' | null = null;
  private initialWidth = 0;
  private minWbs = 60;
  private minName = 120;
  private minStart = 80;
  private minFinish = 80;
  private hitTol = 10;
  private hoverTarget: 'wbs' | 'name' | 'start' | 'finish' | null = null;
  private hoverDividerX: number | null = null;
  private snapTol = 22;

  // ===== Ручка (grip) =====
  private gripSize = 14;
  private gripPad = 2;
  private gripDotBox = 12;

  // ===== Гантт: диапазон времени =====
  private readonly MS_PER_DAY = 24 * 60 * 60 * 1000;
  private ganttPxPerDay = 14;        // масштаб (px/день)
  private ganttStartMs = 0;
  private ganttEndMs = 0;

  // ===== Синхронизация скролла между панелями =====
  private syncingScroll = false;

  // ===== Демоданные =====
  private demoData: WbsNode[] = [
    {
      id: 'n1',
      name: 'Проект: Модернизация Аффинажного Производства',
      start: '2025-09-01',
      finish: '2026-06-30',
      children: [
        {
          id: 'n1.1',
          name: 'Инициация и Обоснование',
          start: '2025-09-01',
          finish: '2025-10-15',
          children: [
            { id: 'n1.1.1', name: 'Формирование WBS', start: '2025-09-01', finish: '2025-09-07' },
            { id: 'n1.1.2', name: 'ФЭМ и CAR',        start: '2025-09-05', finish: '2025-10-10' },
          ]
        },
        {
          id: 'n1.2',
          name: 'Проектирование и Закуп',
          start: '2025-10-16',
          finish: '2026-02-28',
          children: [
            { id: 'n1.2.1', name: 'P&ID и ТЗ',         start: '2025-10-16', finish: '2025-12-01' },
            { id: 'n1.2.2', name: 'Тендер и Контракты', start: '2025-12-02', finish: '2026-02-28' },
          ]
        },
        {
          id: 'n1.3',
          name: 'СМР',
          start: '2026-03-01',
          finish: '2026-05-15',
          children: [
            { id: 'n1.3.1', name: 'Фундамент/КМ',       start: '2026-03-01', finish: '2026-04-10' },
            { id: 'n1.3.2', name: 'Монтаж оборудования', start: '2026-04-05', finish: '2026-05-15' },
          ]
        },
        { id: 'n1.4', name: 'ПНР и Ввод', start: '2026-05-16', finish: '2026-06-30' }
      ]
    }
  ];

  private _initialized = false;

  // -------------------- Lifecycle --------------------
  ngAfterViewInit(): void {
    this.workingData = this.cloneTree(this._externalData && this._externalData.length ? this._externalData : this.demoData);
    if (this.collapsedByDefault) this.collapseAllWithChildren();

    this.initD3();
    this.prepareData();
    this.computeGanttRange();
    this.resizeAllCanvases();
    this.renderAll();
    this.syncHeaderToBodyScroll();
    this.syncGanttHeaderToScroll();

    const bodyWrapper = this.bodyWrapperRef.nativeElement;
    const ganttWrapper = this.ganttWrapperRef.nativeElement;

    // Прокрутка таблицы
    const onScrollTable = () => {
      if (this.syncingScroll) return;
      this.syncingScroll = true;
      this.syncHeaderToBodyScroll();
      // синхронизируем вертикаль с ганттом
      ganttWrapper.scrollTop = bodyWrapper.scrollTop;
      this.syncingScroll = false;
      this.renderAll();
    };
    bodyWrapper.addEventListener('scroll', onScrollTable);
    this.destroyRef.onDestroy(() => bodyWrapper.removeEventListener('scroll', onScrollTable));

    // Прокрутка гантта
    const onScrollGantt = () => {
      if (this.syncingScroll) return;
      this.syncingScroll = true;
      this.syncGanttHeaderToScroll();
      // синхронизируем вертикаль с таблицей
      bodyWrapper.scrollTop = ganttWrapper.scrollTop;
      this.syncingScroll = false;
      this.renderAll();
    };
    ganttWrapper.addEventListener('scroll', onScrollGantt);
    this.destroyRef.onDestroy(() => ganttWrapper.removeEventListener('scroll', onScrollGantt));

    // Hover/колонки/и т.п. при колесе мыши внутри таблицы
    const onWheel = () => {
      const rect = this.canvasRef.nativeElement.getBoundingClientRect();
      const contentX = this.lastClientX - rect.left;
      this.updateHoverFromContentX(contentX);
      this.syncHeaderToBodyScroll();
      this.renderAll();
    };
    bodyWrapper.addEventListener('wheel', onWheel, { passive: true });
    this.destroyRef.onDestroy(() => bodyWrapper.removeEventListener('wheel', onWheel));

    // Hover по шапке таблицы для ресайза колонок — уже в initD3()

    // Слушатели для сплита (добавляем на window)
    const onSplitMove = (e: MouseEvent) => {
      if (!this.isResizingSplit) return;
      const rootRect = this.splitRootRef.nativeElement.getBoundingClientRect();
      const dx = e.clientX - this.splitStartX;
      const dxPct = (dx / rootRect.width) * 100;
      // клампим от 15% до 85%, чтобы не схлопывать панели
      this.leftPct = Math.min(85, Math.max(15, this.splitStartLeftPct + dxPct));
      this.resizeAllCanvases();
      this.syncHeaderToBodyScroll();
      this.syncGanttHeaderToScroll();
      this.renderAll();
    };
    const onSplitUp = () => { this.isResizingSplit = false; };

    window.addEventListener('mousemove', onSplitMove, { passive: true });
    window.addEventListener('mouseup', onSplitUp, { passive: true });
    this.destroyRef.onDestroy(() => {
      window.removeEventListener('mousemove', onSplitMove);
      window.removeEventListener('mouseup', onSplitUp);
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
  }

  ngOnDestroy(): void {}

  @HostListener('window:resize')
  onResize() {
    this.resizeAllCanvases();
    this.syncHeaderToBodyScroll();
    this.syncGanttHeaderToScroll();
    this.renderAll();
  }

  // ==================== СПЛИТ ====================
  onSplitMouseDown(e: MouseEvent) {
    e.preventDefault();
    this.isResizingSplit = true;
    this.splitStartX = e.clientX;
    this.splitStartLeftPct = this.leftPct;
  }

  // ==================== Табличная часть: ресайз колонок (live) ====================
  private applyLiveResizeAtContentX(contentX: number) {
    if (!this.isResizingCol || !this.resizeTarget) return;
    const dx = contentX - this.resizeStartX;
    const next = this.initialWidth + dx;
    this.setWidthByKey(this.resizeTarget, next);
    this.resizeAllCanvases();
    this.syncHeaderToBodyScroll();
    this.renderAll();
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

  private cloneTree(src: WbsNode[]): WbsNode[] {
    return JSON.parse(JSON.stringify(src)) as WbsNode[];
  }

  private collapseAllWithChildren() {
    this.collapsed.clear();
    const walk = (nodes: WbsNode[]) => {
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
    this.flatRows = this.flattenWbs(this.workingData);
    const maxLevel = this.flatRows.reduce((m, r) => Math.max(m, r.level), 0);
    this.colToggle = this.baseToggleWidth + maxLevel * this.toggleIndentPerLevel;
  }

  private flattenWbs(nodes: WbsNode[]): FlatRow[] {
    const out: FlatRow[] = [];
    const walk = (list: WbsNode[], prefixNums: number[] = [], level = 0, parentId: string | null = null, parentPath: string[] = []) => {
      list.forEach((node, idx) => {
        const numberSeq = [...prefixNums, idx + 1];
        const wbs = numberSeq.join('.');
        const hasChildren = !!(node.children && node.children.length);
        const path = [...parentPath, node.id];

        out.push({
          id: node.id,
          parentId,
          path,
          wbs,
          name: node.name,
          start: node.start,
          finish: node.finish,
          level,
          hasChildren
        });

        if (hasChildren && !this.collapsed.has(node.id)) {
          walk(node.children!, numberSeq, level + 1, node.id, path);
        }
      });
    };
    walk(nodes, [], 0, null, []);
    return out;
  }

  private findParentListAndIndex(rootList: WbsNode[], id: string) {
    const walk = (list: WbsNode[], _parent: WbsNode[] | null): { parentList: WbsNode[]; index: number } | null => {
      for (let i = 0; i < list.length; i++) {
        const n = list[i];
        if (n.id === id) return { parentList: list, index: i };
        if (n.children && n.children.length) {
          const res = walk(n.children, list);
          if (res) return res;
        }
      }
      return null;
    };
    return walk(rootList, null);
  }

  private findNode(rootList: WbsNode[], id: string): WbsNode | null {
    const walk = (list: WbsNode[]): WbsNode | null => {
      for (const n of list) {
        if (n.id === id) return n;
        if (n.children) {
          const r = walk(n.children);
          if (r) return r;
        }
      }
      return null;
    };
    return walk(rootList);
  }

  private isDescendant(candidateId: string, ancestorId: string): boolean {
    const candRow = this.flatRows.find(r => r.id === candidateId);
    if (!candRow) return false;
    return candRow.path.includes(ancestorId) && candidateId !== ancestorId;
  }

  private moveNode(nodeId: string, newParentId: string | null, indexInParent: number) {
    if (newParentId === nodeId) return;
    if (newParentId && this.isDescendant(newParentId, nodeId)) return;

    const found = this.findParentListAndIndex(this.workingData, nodeId);
    if (!found) return;
    const { parentList, index } = found;
    const [node] = parentList.splice(index, 1);

    let newParentChildren: WbsNode[];
    if (!newParentId) {
      newParentChildren = this.workingData;
    } else {
      const newParentNode = this.findNode(this.workingData, newParentId);
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

      const hit = this.hitResizableDivider(x);
      if (hit.target) {
        this.hoverTarget = hit.target;
        const d = this.getDividerPositions();
        this.hoverDividerX =
          hit.target === 'wbs' ? d.afterWbs :
          hit.target === 'name' ? d.afterName :
          hit.target === 'start' ? d.afterStart :
          d.afterFinish;
        this.canvasRef.nativeElement.style.cursor = 'col-resize';
        this.renderAll();
        return;
      }

      const near = this.nearestDivider(x);
      if (near && near.dist <= this.snapTol) {
        this.hoverTarget = near.target;
        this.hoverDividerX = near.x;
        this.canvasRef.nativeElement.style.cursor = 'col-resize';
        this.renderAll();
        return;
      }

      this.hoverTarget = null;
      this.hoverDividerX = null;
      const overGrip = this.isOverGrip(event);
      this.canvasRef.nativeElement.style.cursor = overGrip ? 'grab' : 'default';
      this.renderAll();
    });

    this.destroyRef.onDestroy(() => {
      window.removeEventListener('mousemove', this.onMouseMoveBound);
      window.removeEventListener('mouseup', this.onMouseUpBound);
    });
  }

  private onMouseMoveBound = (e: MouseEvent) => this.onMouseMove(e);
  private onMouseUpBound = (e: MouseEvent) => this.onMouseUp(e);

  private toContentCoords(event: MouseEvent) {
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    return { x, y };
  }

  // ---- Column resize helpers ----
  private getDividerPositions() {
    const xGrip = 0;
    const xToggle = xGrip + this.colGrip;
    const xWbs = xToggle + this.colToggle;
    const xName = xWbs + this.colWbs;
    const xStart = xName + this.colName;
    const xFinish = xStart + this.colStart;
    return {
      afterGrip: this.colGrip,
      afterToggle: this.colGrip + this.colToggle,
      afterWbs: xName,
      afterName: xStart,
      afterStart: xFinish,
      afterFinish: xFinish + this.colFinish
    };
  }

  private hitResizableDivider(x: number): { target: 'wbs' | 'name' | 'start' | 'finish' | null } {
    const d = this.getDividerPositions();
    const dpr = (typeof window !== 'undefined' && (window.devicePixelRatio || 1)) || 1;
    const tol = this.hitTol + (dpr > 1 ? 2 : 0);
    if (Math.abs(x - d.afterWbs)   <= tol) return { target: 'wbs'   };
    if (Math.abs(x - d.afterName)  <= tol) return { target: 'name'  };
    if (Math.abs(x - d.afterStart) <= tol) return { target: 'start' };
    if (Math.abs(x - d.afterFinish)<= tol) return { target: 'finish'};
    return { target: null };
  }

  private nearestDivider(x: number): { target: 'wbs' | 'name' | 'start' | 'finish', x: number, dist: number } | null {
    const d = this.getDividerPositions();
    const pairs: Array<{ key: 'wbs' | 'name' | 'start' | 'finish'; x: number }> = [
      { key: 'wbs', x: d.afterWbs },
      { key: 'name', x: d.afterName },
      { key: 'start', x: d.afterStart },
      { key: 'finish', x: d.afterFinish },
    ];
    let best: { target: 'wbs' | 'name' | 'start' | 'finish', x: number, dist: number } | null = null;
    for (const p of pairs) {
      const dist = Math.abs(x - p.x);
      if (!best || dist < best.dist) best = { target: p.key, x: p.x, dist };
    }
    return best;
  }

  private getWidthByKey(key: 'wbs' | 'name' | 'start' | 'finish'): number {
    switch (key) {
      case 'wbs': return this.colWbs;
      case 'name': return this.colName;
      case 'start': return this.colStart;
      case 'finish': return this.colFinish;
    }
  }

  private setWidthByKey(key: 'wbs' | 'name' | 'start' | 'finish', value: number) {
    switch (key) {
      case 'wbs': this.colWbs = Math.max(this.minWbs, value); break;
      case 'name': this.colName = Math.max(this.minName, value); break;
      case 'start': this.colStart = Math.max(this.minStart, value); break;
      case 'finish': this.colFinish = Math.max(this.minFinish, value); break;
    }
  }

  private updateHoverFromContentX(contentX: number) {
    if (this.isDragging) return;
    const hit = this.hitResizableDivider(contentX);
    if (hit.target) {
      this.hoverTarget = hit.target;
      const d = this.getDividerPositions();
      this.hoverDividerX =
        hit.target === 'wbs' ? d.afterWbs :
        hit.target === 'name' ? d.afterName :
        hit.target === 'start' ? d.afterStart :
        d.afterFinish;
      this.canvasRef.nativeElement.style.cursor = 'col-resize';
    } else {
      const near = this.nearestDivider(contentX);
      if (near && near.dist <= this.snapTol) {
        this.hoverTarget = near.target;
        this.hoverDividerX = near.x;
        this.canvasRef.nativeElement.style.cursor = 'col-resize';
      } else {
        this.hoverTarget = null;
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
    if (hit.target) {
      this.isResizingCol = true;
      this.resizeStartX = x;
      this.resizeTarget = hit.target;
      this.initialWidth = this.getWidthByKey(hit.target);
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

    if (this.isResizingCol && this.resizeTarget) {
      this.autoScrollIfNearEdge(x);
      this.applyLiveResizeAtContentX(x);
      return;
    }

    if (!this.isDragging) return;

    this.dropMode = this.calculateDropMode(x, y);
    this.renderAll();
  }

  private onMouseUp(_event: MouseEvent) {
    if (this.isResizingCol) {
      this.isResizingCol = false;
      this.resizeTarget = null;
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
      if (targetRow.id !== srcId && !this.isDescendant(targetRow.id, srcId)) {
        const targetNode = this.findNode(this.workingData, targetRow.id);
        const newIndex = (targetNode?.children?.length ?? 0);
        this.moveNode(srcId, targetRow.id, newIndex);
      }
    }

    this.isDragging = false;
    this.canvasRef.nativeElement.style.cursor = 'default';
    this.dragRowIndex = -1;
    this.dropMode = { kind: 'none' };

    this.prepareData();
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

    const xNameStart = this.colGrip + this.colToggle + this.colWbs;
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
      : (this.findNode(this.workingData, newParentId)?.children ?? []);

    let insertIndex = 0;
    for (let i = 0; i < parentList.length; i++) {
      if (parentList[i].id === target.id) {
        insertIndex = i;
        break;
      }
    }

    const movingLoc = this.findParentListAndIndex(this.workingData, movingId);
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
      this.colGrip + this.colToggle + this.colWbs + this.colName + this.colStart + this.colFinish;
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
    const host = this.ganttHostRef.nativeElement;
    const wrapper = this.ganttWrapperRef.nativeElement;
    const headerCanvas = this.ganttHeaderCanvasRef.nativeElement;
    const bodyCanvas = this.ganttCanvasRef.nativeElement;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

    const totalDays = Math.max(1, Math.ceil((this.ganttEndMs - this.ganttStartMs) / this.MS_PER_DAY));
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

    const xGrip   = 0;
    const xToggle = xGrip + this.colGrip;
    const xWbs    = xToggle + this.colToggle;
    const xName   = xWbs + this.colWbs;
    const xStart  = xName + this.colName;
    const xFinish = xStart + this.colStart;

    ctx.fillStyle = this.headerBg;
    ctx.fillRect(0, 0, width, height);

    ctx.beginPath();
    ctx.moveTo(this.colGrip + 0.5, 0);
    ctx.lineTo(this.colGrip + 0.5, height);
    ctx.moveTo((this.colGrip + this.colToggle) + 0.5, 0);
    ctx.lineTo((this.colGrip + this.colToggle) + 0.5, height);
    ctx.moveTo((this.colGrip + this.colToggle + this.colWbs) + 0.5, 0);
    ctx.lineTo((this.colGrip + this.colToggle + this.colWbs) + 0.5, height);
    ctx.moveTo((this.colGrip + this.colToggle + this.colWbs + this.colName) + 0.5, 0);
    ctx.lineTo((this.colGrip + this.colToggle + this.colWbs + this.colName) + 0.5, height);
    ctx.moveTo((this.colGrip + this.colToggle + this.colWbs + this.colName + this.colStart) + 0.5, 0);
    ctx.lineTo((this.colGrip + this.colToggle + this.colWbs + this.colName + this.colStart) + 0.5, height);
    ctx.strokeStyle = this.headerBorder;
    ctx.stroke();

    ctx.font = this.headerFont;
    ctx.fillStyle = this.textColor;
    ctx.textBaseline = 'middle';
    ctx.fillText('WBS',    xWbs    + 10, height / 2);
    ctx.fillText('Name',   xName   + 10, height / 2);
    ctx.fillText('Start',  xStart  + 10, height / 2);
    ctx.fillText('Finish', xFinish + 10, height / 2);

    ctx.strokeStyle = this.headerBorder;
    ctx.beginPath();
    ctx.moveTo(0, height + 0.5);
    ctx.lineTo(width, height + 0.5);
    ctx.stroke();

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

    ctx.clearRect(0, 0, width, height);

    const xGrip   = 0;
    const xToggle = xGrip + this.colGrip;
    const xWbs    = xToggle + this.colToggle;
    const xName   = xWbs + this.colWbs;
    const xStart  = xName + this.colName;
    const xFinish = xStart + this.colStart;

    ctx.font = this.font;

    for (let i = 0; i < this.flatRows.length; i++) {
      const y = i * this.rowHeight;

      if (i % 2 === 1) {
        ctx.fillStyle = this.zebraColor;
        ctx.fillRect(0, y, width, this.rowHeight);
      }

      const row = this.flatRows[i];

      if (row.hasChildren) {
        ctx.fillStyle = this.getLevelColor(row.level);
        ctx.fillRect(this.colGrip, y, width - this.colGrip, this.rowHeight);
      }

      ctx.beginPath();
      ctx.moveTo(0, y + this.rowHeight + 0.5);
      ctx.lineTo(width, y + this.rowHeight + 0.5);
      ctx.strokeStyle = this.gridColor;
      ctx.stroke();

      ctx.fillStyle = this.textColor;
      ctx.textBaseline = 'middle';

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

      const midY = y + this.rowHeight / 2;
      this.drawClippedText(ctx, row.wbs,    xWbs,    midY, this.colWbs);
      this.drawClippedText(ctx, row.name,   xName,   midY, this.colName);
      this.drawClippedText(ctx, row.start,  xStart,  midY, this.colStart);
      this.drawClippedText(ctx, row.finish, xFinish, midY, this.colFinish);
    }

    ctx.beginPath();
    ctx.moveTo(this.colGrip + 0.5, 0);
    ctx.lineTo(this.colGrip + 0.5, height);
    ctx.moveTo((this.colGrip + this.colToggle) + 0.5, 0);
    ctx.lineTo((this.colGrip + this.colToggle) + 0.5, height);
    ctx.moveTo((this.colGrip + this.colToggle + this.colWbs) + 0.5, 0);
    ctx.lineTo((this.colGrip + this.colToggle + this.colWbs) + 0.5, height);
    ctx.moveTo((this.colGrip + this.colToggle + this.colWbs + this.colName) + 0.5, 0);
    ctx.lineTo((this.colGrip + this.colToggle + this.colWbs + this.colName) + 0.5, height);
    ctx.moveTo((this.colGrip + this.colToggle + this.colWbs + this.colName + this.colStart) + 0.5, 0);
    ctx.lineTo((this.colGrip + this.colToggle + this.colWbs + this.colName + this.colStart) + 0.5, height);
    ctx.strokeStyle = this.gridColor;
    ctx.stroke();

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
      this.ganttEndMs = now + 30 * this.MS_PER_DAY;
      return;
    }
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;

    const walk = (nodes: WbsNode[]) => {
      for (const n of nodes) {
        const s = new Date(n.start + 'T00:00:00').getTime();
        const f = new Date(n.finish + 'T00:00:00').getTime();
        if (!isNaN(s)) min = Math.min(min, s);
        if (!isNaN(f)) max = Math.max(max, f);
        if (n.children?.length) walk(n.children);
      }
    };
    walk(this.workingData);

    if (!isFinite(min) || !isFinite(max)) {
      const now = Date.now();
      min = now; max = now + 30 * this.MS_PER_DAY;
    }

    // небольшой запас по 7 дней с каждой стороны
    this.ganttStartMs = min - 7 * this.MS_PER_DAY;
    this.ganttEndMs   = max + 7 * this.MS_PER_DAY;
  }

  /** Понедельник той ISO-недели, где лежит дата d (в 00:00) */
private startOfISOWeek(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay() || 7; // 1..7 (пн..вс)
  if (day !== 1) x.setDate(x.getDate() - (day - 1));
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Номер ISO-недели (1..53) для даты d */
private getISOWeek(d: Date): number {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  return Math.ceil((((x.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

  private renderGanttHeader() {
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

  const pxPerDay  = this.ganttPxPerDay;
  const startMs   = this.ganttStartMs;
  const endMs     = this.ganttEndMs;

  // Разделительная горизонтальная линия между строками заголовка
  ctx.strokeStyle = this.headerBorder;
  ctx.beginPath();
  ctx.moveTo(0, half + 0.5);
  ctx.lineTo(width, half + 0.5);
  ctx.stroke();

  // ===== Верхняя строка: Месяц Год =====
  ctx.font = this.headerFont;
  ctx.fillStyle = this.textColor;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';

  // начинаем с 1-го дня месяца, в который попадает ganttStartMs
  const monthStart = new Date(startMs);
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const monthFmt = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' });

  let cur = new Date(monthStart);
  while (cur.getTime() < endMs) {
    const thisMonthStart = cur.getTime();
    const next = new Date(cur);
    next.setMonth(cur.getMonth() + 1);
    const thisMonthEnd = Math.min(next.getTime(), endMs);

    const x0 = Math.max(0, Math.round(((thisMonthStart - startMs) / this.MS_PER_DAY) * pxPerDay));
    const x1 = Math.round(((thisMonthEnd   - startMs) / this.MS_PER_DAY) * pxPerDay);
    const cx = x0 + (x1 - x0) / 2;

    // подпись месяца в верхней половине
    ctx.fillText(monthFmt.format(cur), cx, Math.floor(half / 2));

    // вертикальная граница месяца (тонкая)
    ctx.strokeStyle = this.headerBorder;
    ctx.beginPath();
    ctx.moveTo(x1 + 0.5, 0);
    ctx.lineTo(x1 + 0.5, half);
    ctx.stroke();

    cur = next;
  }

  // ===== Нижняя строка: номер ISO-недели =====
  // старт от понедельника ISO-недели, перекрывающей начало диапазона
  const firstMonday = this.startOfISOWeek(new Date(startMs));
  const bottomY = half + Math.floor(half / 2);

  // линии сетки по неделям + подписи недель
  for (let t = firstMonday.getTime(); t <= endMs; t += 7 * this.MS_PER_DAY) {
    const weekStart = t;
    const weekEnd   = Math.min(t + 7 * this.MS_PER_DAY, endMs);

    const x0 = Math.round(((weekStart - startMs) / this.MS_PER_DAY) * pxPerDay);
    const x1 = Math.round(((weekEnd   - startMs) / this.MS_PER_DAY) * pxPerDay);
    const cx = x0 + (x1 - x0) / 2;

    // вертикальная линия недели на всю высоту заголовка
    ctx.strokeStyle = this.headerBorder;
    ctx.beginPath();
    ctx.moveTo(x0 + 0.5, half);
    ctx.lineTo(x0 + 0.5, height);
    ctx.stroke();

    // номер недели в нижней половине
    const weekNo = this.getISOWeek(new Date(weekStart));
    ctx.fillStyle = this.textColor;
    ctx.fillText(String(weekNo), cx, bottomY);
  }

  // нижняя граница заголовка
  ctx.strokeStyle = this.headerBorder;
  ctx.beginPath();
  ctx.moveTo(0, height + 0.5);
  ctx.lineTo(width, height + 0.5);
  ctx.stroke();

  // выравнивающая вертикалка в самом начале (0)
  ctx.beginPath();
  ctx.moveTo(0.5, half);
  ctx.lineTo(0.5, height);
  ctx.stroke();
  }

  private renderGanttBody() {
    const canvas = this.ganttCanvasRef.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width  = parseInt(canvas.style.width, 10);
    const height = parseInt(canvas.style.height, 10);
    // сетка по неделям от ISO-понедельника
    const pxPerDay = this.ganttPxPerDay;
    const firstMonday = this.startOfISOWeek(new Date(this.ganttStartMs));
    ctx.strokeStyle = '#ececec';
    for (let t = firstMonday.getTime(); t <= this.ganttEndMs; t += 7 * this.MS_PER_DAY) {
      const x = Math.round(((t - this.ganttStartMs) / this.MS_PER_DAY) * pxPerDay) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    ctx.clearRect(0, 0, width, height);

    for (let i = 0; i < this.flatRows.length; i++) {
      const y = i * this.rowHeight;
    
      const row = this.flatRows[i];
    
      // БЕЗ заливки зебры и БЕЗ фона для родительских строк
    
      // линия низа строки
      ctx.beginPath();
      ctx.moveTo(0, y + this.rowHeight + 0.5);
      ctx.lineTo(width, y + this.rowHeight + 0.5);
      ctx.strokeStyle = this.gridColor;
      ctx.stroke();
    }

    

    // сетка по неделям
    const totalDays = Math.ceil((this.ganttEndMs - this.ganttStartMs) / this.MS_PER_DAY);
    ctx.strokeStyle = '#ececec';
    for (let d = 0; d <= totalDays; d += 7) {
      const x = Math.round(d * pxPerDay) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    // бары задач
    for (let i = 0; i < this.flatRows.length; i++) {
      const row = this.flatRows[i];

      const s = new Date(row.start + 'T00:00:00').getTime();
      const f = new Date(row.finish + 'T00:00:00').getTime();
      const x0 = Math.round(((s - this.ganttStartMs) / this.MS_PER_DAY) * pxPerDay);
      const x1 = Math.round(((f - this.ganttStartMs) / this.MS_PER_DAY) * pxPerDay);
      const w  = Math.max(3, x1 - x0);

      if (row.hasChildren) {  // === Сводный бар с "кепками" (правый угол на кончиках слева/справа) ===
        const yc   = i * this.rowHeight + this.rowHeight / 2;
        const thick = 6;
        const capMax = 8;
        const w = Math.max(3, x1 - x0);
        // длина "кепки", не больше половины ширины бара
        const cap = Math.min(capMax, Math.floor(w / 2));
      
        const yTop = Math.round(yc - thick / 2) + 0.5;
        const yBot = Math.round(yc + thick / 2) + 0.5;
        const coreX0 = x0 + cap;      // внутренняя грань левой кепки
        const coreX1 = x1 - cap;      // внутренняя грань правой кепки
      
        const fill   = '#9aa3ad';
        const stroke = '#000';
      
        ctx.save();
      
        // 1) Тело (между кепками) — ТОЛЬКО заливка (исправили +1)
        if (coreX1 > coreX0) {
          ctx.fillStyle = fill;
          ctx.fillRect(coreX0, yTop - 0.5, coreX1 - coreX0, (yBot - yTop) + 1);
        }



// левая кепка: заполнение + обводка БЕЗ верхнего горизонтального ребра
const capH = cap; // высота треугольника вниз

// заливка
ctx.beginPath();
ctx.moveTo(x0,     yBot);         // вершина 90°
ctx.lineTo(coreX0, yBot);         // основание (горизонталь)
ctx.lineTo(x0,     yBot + capH);  // апекс вниз
ctx.closePath();
ctx.fillStyle = fill;
ctx.fill();

// обводка: ТОЛЬКО вертикаль и диагональ (без горизонтали по yBot)
ctx.strokeStyle = stroke;
ctx.lineWidth = 1;
ctx.beginPath();
ctx.moveTo(x0,     yBot);         // вертикаль
ctx.lineTo(x0,     yBot + capH);
ctx.moveTo(x0,     yBot + capH);  // диагональ
ctx.lineTo(coreX0, yBot);
ctx.stroke();
      
        // Правая кепка (основание по нижней кромке от coreX1 до x1, апекс вниз по центру)
        ctx.beginPath();
        ctx.moveTo(x1,     yBot);         // вершина с углом 90°
        ctx.lineTo(coreX1, yBot);         // горизонтальная нога влево
        ctx.lineTo(x1,     yBot + capH);  // вертикальная нога вниз (апекс)
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 4) ВЕРХ/НИЗ — ЧЁРНЫЕ ЛИНИИ ПО ВСЕЙ ДЛИНЕ И ПОСЛЕ КЕПОК
// 3.1) ДОкраска "квадратов" у краёв, чтобы не было просвета
ctx.fillStyle = fill;
// слева: от x0 до coreX0, между верхней и нижней линией
ctx.fillRect(x0, yTop - 0.5, Math.max(0, coreX0 - x0), (yBot - yTop) + 1);
// справа (симметрично; если не нужно — эту строку можно удалить)
ctx.fillRect(coreX1, yTop - 0.5, Math.max(0, x1 - coreX1), (yBot - yTop) + 1);

// 4) Верх/низ — чёрные линии по всей длине
ctx.strokeStyle = stroke;
ctx.lineWidth = 1;
ctx.beginPath();
ctx.moveTo(x0, yTop); ctx.lineTo(x0, yBot); // слева
ctx.moveTo(x1, yTop); ctx.lineTo(x1, yBot); // справа
ctx.moveTo(x0, yTop); ctx.lineTo(x1, yTop);

ctx.moveTo(coreX0-1, yBot); ctx.lineTo(coreX1+1, yBot); // нижняя
ctx.stroke();
              
        ctx.restore();
      } else {
        // ===== Обычный бар для листовой задачи =====
        const y = i * this.rowHeight + 6;           // паддинг сверху/снизу
        const h = this.rowHeight - 12;
        const r = 4;

        ctx.save();
        ctx.fillStyle = '#7aa9ff';
        ctx.strokeStyle = '#3d7bfd';
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
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }

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

    const xGrip = 0;
    const xToggle = this.colGrip;
    const xWbs = xToggle + this.colToggle;
    this.drawLevelIndicators(ctx, row.level, yTop, xToggle);
    const xName = xWbs + this.colWbs;
    const xStart = xName + this.colName;
    const xFinish = xStart + this.colStart;
    const midY = yTop + this.rowHeight / 2;

    this.drawGrip(ctx, xGrip + 10, yTop + (this.rowHeight - this.gripDotBox) / 2, this.gripDotBox, this.gripDotBox);

    this.drawClippedText(ctx, row.wbs,    xWbs,    midY, this.colWbs);
    this.drawClippedText(ctx, row.name,   xName,   midY, this.colName);
    this.drawClippedText(ctx, row.start,  xStart,  midY, this.colStart);
    this.drawClippedText(ctx, row.finish, xFinish, midY, this.colFinish);
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
    const potentialParents: (WbsNode | null)[] = [null, ...allNodes];

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

  private getAllNodes(nodes: WbsNode[]): WbsNode[] {
    let flatList: WbsNode[] = [];
    for (const node of nodes) {
      flatList.push(node);
      if (node.children && node.children.length > 0) {
        flatList = flatList.concat(this.getAllNodes(node.children));
      }
    }
    return flatList;
  }

  private generateRandomWbsNode(): WbsNode {
    const randomId = `gen-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const taskNames = ['Анализ требований', 'Проектирование архитектуры', 'Разработка модуля', 'Тестирование', 'Написание документации', 'Развертывание'];
    const randomName = `${taskNames[Math.floor(Math.random() * taskNames.length)]} #${Math.floor(Math.random() * 100)}`;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() + Math.floor(Math.random() * 365));
    const durationDays = 3 + Math.floor(Math.random() * 28);
    const finishDate = new Date(startDate);
    finishDate.setDate(finishDate.getDate() + durationDays);

    const formatDate = (d: Date): IsoDate => d.toISOString().split('T')[0] as IsoDate;

    return {
      id: randomId,
      name: randomName,
      start: formatDate(startDate),
      finish: formatDate(finishDate),
    };
  }

  // -------------------- Синхронизация шапок --------------------
  private syncHeaderToBodyScroll() {
    const bodyWrapper = this.bodyWrapperRef.nativeElement;
    const headerCanvas = this.headerCanvasRef.nativeElement;
    headerCanvas.style.transform = `translateX(${-bodyWrapper.scrollLeft}px)`;
  }
  private syncGanttHeaderToScroll() {
    const wrapper = this.ganttWrapperRef.nativeElement;
    const headerCanvas = this.ganttHeaderCanvasRef.nativeElement;
    headerCanvas.style.transform = `translateX(${-wrapper.scrollLeft}px)`;
  }
}
