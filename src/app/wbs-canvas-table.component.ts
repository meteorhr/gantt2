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
  wbs: string;      // "1.2.3"
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
    <div #host class="wbs-host">
      <canvas #canvas></canvas>
    </div>
  `,
  styles: [`
    :host, .wbs-host {
      display: block;
      position: relative;
      width: 100%;
      height: 520px;
      overflow: auto;
      background: #fff;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, "Noto Sans", "Apple Color Emoji", "Segoe UI Emoji";
    }
    canvas { display: block; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WbsCanvasTableComponent implements AfterViewInit, OnChanges, OnDestroy {

  @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('host',   { static: true }) hostRef!: ElementRef<HTMLDivElement>;

  @Input() set data(value: WbsNode[] | null) {
    this._externalData = value;
    if (this._initialized) {
      this.workingData = this.cloneTree(value && value.length ? value : this.demoData);
      if (this.collapsedByDefault) this.collapseAllWithChildren();
      this.prepareData();
      this.resizeCanvasToContainer();
      this.render();
    }
  }
  get data(): WbsNode[] | null { return this._externalData; }
  private _externalData: WbsNode[] | null = null;

@Input() toggleOnRowClick = true; // не используется теперь, но оставим для совместимости
  @Input() collapsedByDefault = false;

  private destroyRef = inject(DestroyRef);

  // Визуальные параметры
  private headerHeight = 36;
  private rowHeight = 28;
  private font = '12px system-ui, -apple-system, Segoe UI, Roboto, Arial';
  private headerFont = '600 12px system-ui, -apple-system, Segoe UI, Roboto, Arial';
  private zebraColor = '#fafafa';
  private gridColor = '#e6e6e6';
  private textColor = '#111';
  private headerBg = '#f5f7fb';
  private headerBorder = '#dcdfe6';
  private lastClientX = 0; 
    // Палитра цветов для уровней (повторяется по кругу)
  private levelColors = [
    '#7DAFFF', '#6BD3A0', '#F7C948', '#F58EA8',
    '#B07EFB', '#FF8C69', '#64C2C8', '#C29FFF'
  ];
  private getLevelColor(levelIndex: number) {
    const arr = this.levelColors;
    return arr[(levelIndex % arr.length + arr.length) % arr.length];
  }
  private toggleIndentPerLevel = 12; // px: с каждым уровнем треугольник смещается вправо
  private baseToggleWidth = 28; // базовая ширина колонки треугольника без учёта уровней

  // Колонки: 1) grip, 2) toggle, 3+) данные
  private colGrip = 28;    // 1-й: 6 точек
  private colToggle = 28;  // 2-й: треугольник
  private colWbs = 120;    // 3-й: WBS
  private colName = 420;   // 4-й: Name
  private colStart = 120;  // 5-й: Start
  private colFinish = 120; // 6-й: Finish

  // D3
  private d3Canvas!: Selection<HTMLCanvasElement, unknown, null, undefined>;
  private zoomBehavior!: ZoomBehavior<HTMLCanvasElement, unknown>;
  private zoomTransform: ZoomTransform = { x: 0, y: 0, k: 1 } as ZoomTransform;

  // Данные
  private workingData: WbsNode[] = [];
  private flatRows: FlatRow[] = [];
  private collapsed = new Set<string>();

  // DnD
  private isDragging = false;
  private dragRowIndex: number = -1;
  private dragMouseDx = 0;
  private dragMouseDy = 0;
  private lastMouseX = 0;
  private lastMouseY = 0;
  private dropMode: DropMode = { kind: 'none' };

  // ---- Column resize state (hover between columns) ----
  private isResizingCol = false;
  private resizeStartX = 0;
  private resizeTarget: 'wbs' | 'name' | 'start' | 'finish' | null = null;
  private initialWidth = 0;
  private minWbs = 60;
  private minName = 120;
  private minStart = 80;
  private minFinish = 80;
  private hitTol = 10; // px tolerance near resizable dividers (увеличено для стабильного ховера при прокрутке)
   private hoverTarget: 'wbs' | 'name' | 'start' | 'finish' | null = null;
  private hoverDividerX: number | null = null; // content X of hovered divider (for highlight + snap)
  private snapTol = 22; // px, магнит к ближайшему разделителю

  // Ручка (grip)
  private gripSize = 14;          // ширина/высота хитбокса
  private gripPad = 2;            // дополнительный паддинг вокруг точек
  private gripDotBox = 12;        // визуальный блок точек (для рисования)

  // Демоданные
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
    this.resizeCanvasToContainer();
    this.render();

const host = this.hostRef.nativeElement;
    const onScroll = () => {
      // Если идёт ресайз и пользователь прокручивает вправо/влево,
      // продолжаем пересчитывать ширину так, чтобы разделитель «шёл» за курсором
      if (this.isResizingCol && this.resizeTarget) {
        const rect = this.canvasRef.nativeElement.getBoundingClientRect();
        const contentX = this.lastClientX - rect.left + host.scrollLeft;
        this.applyLiveResizeAtContentX(contentX);
      } else {
        this.render();
      }
    };
    host.addEventListener('scroll', onScroll);
    this.destroyRef.onDestroy(() => host.removeEventListener('scroll', onScroll));

    this._initialized = true;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ('collapsedByDefault' in changes && this._initialized) {
      this.collapseAllWithChildren();
      this.prepareData();
      this.resizeCanvasToContainer();
      this.render();
    }
  }

  ngOnDestroy(): void {}

  @HostListener('window:resize')
  onResize() {
    this.resizeCanvasToContainer();
    this.render();
  }

  // -------------------- Data helpers --------------------

  // Автопрокрутка при подведении курсора к краям видимой области во время ресайза
private autoScrollIfNearEdge(contentX: number) {
  const host = this.hostRef.nativeElement;
  const leftEdge = host.scrollLeft;
  const rightEdge = host.scrollLeft + host.clientWidth;

  const threshold = 24;     // зона у края, px
  const step = 24;          // скорость прокрутки, px за событие

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
    // Динамическая ширина колонки треугольника: базовая + (макс. уровень) * шаг смещения
    const maxLevel = this.flatRows.reduce((m, r) => Math.max(m, r.level), 0);
    this.colToggle = this.baseToggleWidth + maxLevel * this.toggleIndentPerLevel;
    // colGrip оставляем фиксированной ширины
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

  // ---- Tree search/mutate ----

  private findParentListAndIndex(rootList: WbsNode[], id: string): { parentList: WbsNode[]; index: number } | null {
    const walk = (list: WbsNode[], parent: WbsNode[] | null): { parentList: WbsNode[]; index: number } | null => {
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
    const res = walk(rootList, null);
    if (res) return res;
    return null;
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

  // -------------------- D3 / Events --------------------

  private initD3() {
    const canvas = this.canvasRef.nativeElement;
    this.d3Canvas = select(canvas);

    // не перехватывать mousedown — оставляем только зум колесом
    this.zoomBehavior = zoom<HTMLCanvasElement, unknown>()
      .filter((ev: any) => ev.type === 'wheel')
      .scaleExtent([1, 1])
      .on('zoom', (ev) => {
        this.zoomTransform = ev.transform;
      });

    this.d3Canvas.call(this.zoomBehavior as any);

    // Click (toggle collapse) — треугольник во 2-й колонке
    this.d3Canvas.on('click', (event: MouseEvent) => {
      if (this.isDragging) return;
      const { x, y } = this.toContentCoords(event);
      if (y < this.headerHeight) return;

      const rowIndex = Math.floor((y - this.headerHeight) / this.rowHeight);
      if (rowIndex < 0 || rowIndex >= this.flatRows.length) return;
      const row = this.flatRows[rowIndex];

      const xToggle = this.colGrip;
      const triSize = 12;
      const triX = xToggle + 8 + this.toggleIndentPerLevel * row.level; // смещение вправо по уровню
      const triY = this.headerHeight + rowIndex * this.rowHeight + (this.rowHeight - triSize) / 2;
      const hitPad = 4;

      const inTriangle =
        x >= (triX - hitPad) && x <= (triX + triSize + hitPad) &&
        y >= (triY - hitPad) && y <= (triY + triSize + hitPad);

      if (row.hasChildren && inTriangle) {
        if (this.collapsed.has(row.id)) this.collapsed.delete(row.id);
        else this.collapsed.add(row.id);
        this.prepareData();
        this.resizeCanvasToContainer();
        this.render();
      }
    });

    // DnD
    this.d3Canvas.on('mousedown', (event: MouseEvent) => this.onMouseDown(event));
    window.addEventListener('mousemove', this.onMouseMoveBound, { passive: true });
    window.addEventListener('mouseup', this.onMouseUpBound, { passive: true });

    // Hover: show col-resize near resizable dividers; grab over grip; grabbing when dragging
// Hover: exact hit OR magnet to nearest divider; highlight it
this.d3Canvas.on('mousemove', (event: MouseEvent) => {
  const { x } = this.toContentCoords(event);

  if (this.isResizingCol) {
    this.canvasRef.nativeElement.style.cursor = 'col-resize';
    return;
  }
  if (this.isDragging) {
    this.canvasRef.nativeElement.style.cursor = 'grabbing';
    return;
  }

  // 1) Точный хит-тест
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
    return;
  }

  // 2) Магнит к ближайшему разделителю
  const near = this.nearestDivider(x);
  if (near && near.dist <= this.snapTol) {
    this.hoverTarget = near.target;
    this.hoverDividerX = near.x;
    this.canvasRef.nativeElement.style.cursor = 'col-resize';
    return;
  }

  // 3) Обычный hover (grip)
  this.hoverTarget = null;
  this.hoverDividerX = null;
  const overGrip = this.isOverGrip(event);
  this.canvasRef.nativeElement.style.cursor = overGrip ? 'grab' : 'default';
});

    this.destroyRef.onDestroy(() => {
      window.removeEventListener('mousemove', this.onMouseMoveBound);
      window.removeEventListener('mouseup', this.onMouseUpBound);
    });
  }

  private onMouseMoveBound = (e: MouseEvent) => this.onMouseMove(e);
  private onMouseUpBound = (e: MouseEvent) => this.onMouseUp(e);

  private toContentCoords(event: MouseEvent) {
    const host = this.hostRef.nativeElement;
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const x = event.clientX - rect.left + host.scrollLeft;
    const y = event.clientY - rect.top + host.scrollTop;
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
      afterGrip: this.colGrip,                          // not resizable
      afterToggle: this.colGrip + this.colToggle,       // not resizable
      afterWbs: xName,                                  // resizable: adjusts WBS
      afterName: xStart,                                // resizable: adjusts Name
      afterStart: xFinish,                              // resizable: adjusts Start
      afterFinish: xFinish + this.colFinish             // resizable: adjusts Finish (правая граница таблицы)
    };
  }

  private hitResizableDivider(x: number): { target: 'wbs' | 'name' | 'start' | 'finish' | null } {
    const d = this.getDividerPositions();
    const dpr = (typeof window !== 'undefined' && (window.devicePixelRatio || 1)) || 1;
    const tol = this.hitTol + (dpr > 1 ? 2 : 0); // на ретине слегка увеличиваем окно попадания
    if (Math.abs(x - d.afterWbs) <= tol) return { target: 'wbs' };
    if (Math.abs(x - d.afterName) <= tol) return { target: 'name' };
    if (Math.abs(x - d.afterStart) <= tol) return { target: 'start' };
    if (Math.abs(x - d.afterFinish) <= tol) return { target: 'finish' };
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

    private applyLiveResizeAtContentX(contentX: number) {
    if (!this.isResizingCol || !this.resizeTarget) return;
    const dx = contentX - this.resizeStartX; // оба значения в content coords
    const next = this.initialWidth + dx;
    this.setWidthByKey(this.resizeTarget, next);
    this.resizeCanvasToContainer();
    this.render();
  }

  // === Grip detection ===
  private gripRectForRow(rowIndex: number) {
    const xGrip = 0; // первый столбец начинается с 0
    const gx = xGrip + 10 - this.gripPad;
    const gy = this.headerHeight + rowIndex * this.rowHeight + (this.rowHeight - this.gripDotBox) / 2 - this.gripPad;
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
    if (y < this.headerHeight) return false;
    const rowIndex = Math.floor((y - this.headerHeight) / this.rowHeight);
    if (rowIndex < 0 || rowIndex >= this.flatRows.length) return false;
    return this.isInsideGrip(x, y, rowIndex);
  }

  // === Mouse handlers ===
  private onMouseDown(event: MouseEvent) {
    event.preventDefault();

    const { x, y } = this.toContentCoords(event);
    this.lastClientX = event.clientX;
    this.lastMouseX = x;
    this.lastMouseY = y;

    // Start column resize if near a resizable divider (WBS|Name|Start)
    // Разрешаем начинать ресайз как из заголовка, так и из тела таблицы
    const hit = this.hitResizableDivider(x);
    if (hit.target) {
      this.isResizingCol = true;
      this.resizeStartX = x;
      this.resizeTarget = hit.target;
      this.initialWidth = this.getWidthByKey(hit.target);
      this.canvasRef.nativeElement.style.cursor = 'col-resize';
      return;
    }

    if (y < this.headerHeight) return;

    const rowIndex = Math.floor((y - this.headerHeight) / this.rowHeight);
    if (rowIndex < 0 || rowIndex >= this.flatRows.length) return;

    if (!this.isInsideGrip(x, y, rowIndex)) return;

    // start DnD
    const { gx } = this.gripRectForRow(rowIndex);
    this.isDragging = true;
    this.canvasRef.nativeElement.style.cursor = 'grabbing';
    this.dragRowIndex = rowIndex;
    this.dragMouseDx = x - gx;
    this.dragMouseDy = y - (this.headerHeight + rowIndex * this.rowHeight);
    this.dropMode = { kind: 'none' };

    this.render();
  }

  private onMouseMove(event: MouseEvent) {
     this.lastClientX = event.clientX;
    const { x, y } = this.toContentCoords(event);
    this.lastMouseX = x;
    this.lastMouseY = y;

    // Live column resize + автопрокрутка у краёв
    if (this.isResizingCol && this.resizeTarget) {
      // автоскроллим холст, если тянем к краю
      this.autoScrollIfNearEdge(x);

this.applyLiveResizeAtContentX(x);
      return;
    }

    if (!this.isDragging) return;

    this.dropMode = this.calculateDropMode(x, y);
    this.render();
  }

  private onMouseUp(_event: MouseEvent) {
    // Finish column resize
    if (this.isResizingCol) {
      this.isResizingCol = false;
      this.resizeTarget = null;
      this.canvasRef.nativeElement.style.cursor = 'default';
      this.resizeCanvasToContainer();
      this.render();
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

    // End DnD
    this.isDragging = false;
    this.canvasRef.nativeElement.style.cursor = 'default';
    this.dragRowIndex = -1;
    this.dropMode = { kind: 'none' };

    this.prepareData();
    this.resizeCanvasToContainer();
    this.render();
  }

  private calculateDropMode(x: number, y: number): DropMode {
    if (y < this.headerHeight) return { kind: 'none' };

    const rowIndex = Math.floor((y - this.headerHeight) / this.rowHeight);
    if (rowIndex < 0) return { kind: 'none' };
    if (rowIndex >= this.flatRows.length) {
      return { kind: 'insert', beforeRowIndex: this.flatRows.length };
    }

    const overRowTop = this.headerHeight + rowIndex * this.rowHeight;
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

  // -------------------- Render --------------------

  private resizeCanvasToContainer() {
    const host = this.hostRef.nativeElement;
    const canvas = this.canvasRef.nativeElement;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

    const contentWidth = this.colGrip + this.colToggle + this.colWbs + this.colName + this.colStart + this.colFinish;
    const contentHeight = this.headerHeight + this.flatRows.length * this.rowHeight;

    const cssWidth = Math.max(host.clientWidth, contentWidth);
    const cssHeight = Math.max(host.clientHeight, contentHeight);

    canvas.width = Math.floor(cssWidth * dpr);
    canvas.height = Math.floor(cssHeight * dpr);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;

    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private render() {
    const canvas = this.canvasRef.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = parseInt(canvas.style.width, 10);
    const height = parseInt(canvas.style.height, 10);

    ctx.clearRect(0, 0, width, height);

    const xGrip = 0;
    const xToggle = xGrip + this.colGrip;
    const xWbs = xToggle + this.colToggle;
    const xName = xWbs + this.colWbs;
    const xStart = xName + this.colName;
    const xFinish = xStart + this.colStart;

    // Заголовок
    ctx.fillStyle = this.headerBg;
    ctx.fillRect(0, 0, width, this.headerHeight);

    ctx.strokeStyle = this.headerBorder;
    ctx.beginPath();
    ctx.moveTo(0, this.headerHeight + 0.5);
    ctx.lineTo(width, this.headerHeight + 0.5);
    ctx.stroke();

    // Вертикальные разделители в заголовке
    ctx.beginPath();
    ctx.moveTo(this.colGrip + 0.5, 0);
    ctx.lineTo(this.colGrip + 0.5, this.headerHeight);
    ctx.moveTo((this.colGrip + this.colToggle) + 0.5, 0);
    ctx.lineTo((this.colGrip + this.colToggle) + 0.5, this.headerHeight);
    ctx.moveTo((this.colGrip + this.colToggle + this.colWbs) + 0.5, 0);
    ctx.lineTo((this.colGrip + this.colToggle + this.colWbs) + 0.5, this.headerHeight);
    ctx.moveTo((this.colGrip + this.colToggle + this.colWbs + this.colName) + 0.5, 0);
    ctx.lineTo((this.colGrip + this.colToggle + this.colWbs + this.colName) + 0.5, this.headerHeight);
    ctx.moveTo((this.colGrip + this.colToggle + this.colWbs + this.colName + this.colStart) + 0.5, 0);
    ctx.lineTo((this.colGrip + this.colToggle + this.colWbs + this.colName + this.colStart) + 0.5, this.headerHeight);
    ctx.strokeStyle = this.headerBorder;
    ctx.stroke();

    // Текст заголовков (только над данными)
    ctx.font = this.headerFont;
    ctx.fillStyle = this.textColor;
    ctx.textBaseline = 'middle';
    
    ctx.fillText('WBS',   xWbs   + 10, this.headerHeight / 2);
    ctx.fillText('Name',  xName  + 10, this.headerHeight / 2);
    ctx.fillText('Start', xStart + 10, this.headerHeight / 2);
    ctx.fillText('Finish',xFinish+ 10, this.headerHeight / 2);

    // Тело
    ctx.font = this.font;
    for (let i = 0; i < this.flatRows.length; i++) {
      const y = this.headerHeight + i * this.rowHeight;

      if (i % 2 === 1) {
        ctx.fillStyle = this.zebraColor;
        ctx.fillRect(0, y, width, this.rowHeight);
      }

      const row = this.flatRows[i];

      // Если строка — родитель (есть дети), закрашиваем всю строку цветом уровня (без прозрачности)
      if (row.hasChildren) {
        ctx.fillStyle = this.getLevelColor(row.level);
         ctx.fillRect(this.colGrip, y, width - this.colGrip, this.rowHeight);
        //ctx.fillRect(0, y, width, this.rowHeight);
      }

      ctx.beginPath();
      ctx.moveTo(0, y + this.rowHeight + 0.5);
      ctx.lineTo(width, y + this.rowHeight + 0.5);
      ctx.strokeStyle = this.gridColor;
      ctx.stroke();

      ctx.fillStyle = this.textColor;
      ctx.textBaseline = 'middle';

      // 1: Grip
      this.drawGrip(ctx, xGrip + 10, y + (this.rowHeight - this.gripDotBox) / 2, this.gripDotBox, this.gripDotBox);
      this.drawLevelIndicators(ctx, row.level, y, xToggle);

      // 2: Triangle
      if (row.hasChildren) {
        const triSize = 12;
        const triX = xToggle + 8 + this.toggleIndentPerLevel * row.level; // смещение вправо по уровню
        const triY = y + (this.rowHeight - triSize) / 2;
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
      }

      // 3+: данные (с клиппингом по ширине колонки)
      ctx.fillStyle = this.textColor;
      const midY = y + this.rowHeight / 2;
      this.drawClippedText(ctx, row.wbs,   xWbs,   midY, this.colWbs);
      this.drawClippedText(ctx, row.name,  xName,  midY, this.colName);
      this.drawClippedText(ctx, row.start, xStart, midY, this.colStart);
      this.drawClippedText(ctx, row.finish,xFinish,midY, this.colFinish);
    }

    // Вертикальные линии тела
    ctx.beginPath();
    ctx.moveTo(this.colGrip + 0.5, this.headerHeight);
    ctx.lineTo(this.colGrip + 0.5, height);
    ctx.moveTo((this.colGrip + this.colToggle) + 0.5, this.headerHeight);
    ctx.lineTo((this.colGrip + this.colToggle) + 0.5, height);
    ctx.moveTo((this.colGrip + this.colToggle + this.colWbs) + 0.5, this.headerHeight);
    ctx.lineTo((this.colGrip + this.colToggle + this.colWbs) + 0.5, height);
    ctx.moveTo((this.colGrip + this.colToggle + this.colWbs + this.colName) + 0.5, this.headerHeight);
    ctx.lineTo((this.colGrip + this.colToggle + this.colWbs + this.colName) + 0.5, height);
    ctx.moveTo((this.colGrip + this.colToggle + this.colWbs + this.colName + this.colStart) + 0.5, this.headerHeight);
    ctx.lineTo((this.colGrip + this.colToggle + this.colWbs + this.colName + this.colStart) + 0.5, height);
    ctx.strokeStyle = this.gridColor;
    ctx.stroke();

    // DnD визуализация
    if (this.isDragging && this.dragRowIndex >= 0) {
      const ghostY = this.lastMouseY - this.dragMouseDy;
      this.drawDragGhost(ctx, this.dragRowIndex, ghostY, width);

      if (this.dropMode.kind === 'insert') {
        const insY = this.headerHeight + this.dropMode.beforeRowIndex * this.rowHeight;
        this.drawInsertLine(ctx, insY, width);
      } else if (this.dropMode.kind === 'child') {
        const rectY = this.headerHeight + this.dropMode.targetRowIndex * this.rowHeight;
        this.drawDashedRect(ctx, 0, rectY, width, this.rowHeight);
      }
    }
  }

  // -------------------- Drawing helpers --------------------

    private drawClippedText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    centerY: number,
    cellWidth: number,
    paddingLeft = 10
  ) {
    const maxW = Math.max(0, cellWidth - paddingLeft - 4);
    const baseX = x + paddingLeft;
    if (maxW <= 0) return;

    if (ctx.measureText(text).width <= maxW) {
      ctx.fillText(text, baseX, centerY);
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
  }

  private drawLevelIndicators(ctx: CanvasRenderingContext2D, level: number, rowTopY: number, xToggle: number) {
    // Полосы без зазоров: каждая полоса шириной шага смещения и вплотную друг к другу
    const barW = this.toggleIndentPerLevel; // ширина = шагу уровня
    const h = this.rowHeight;

    for (let l = 0; l <= level; l++) {
      const x = xToggle + l * barW; // без дополнительных отступов между полосами
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

    // grip в 1-й колонке
    this.drawGrip(ctx, xGrip + 10, yTop + (this.rowHeight - this.gripDotBox) / 2, this.gripDotBox, this.gripDotBox);

    // данные
this.drawClippedText(ctx, row.wbs,   xWbs,   midY, this.colWbs);
    this.drawClippedText(ctx, row.name,  xName,  midY, this.colName);
    this.drawClippedText(ctx, row.start, xStart, midY, this.colStart);
    this.drawClippedText(ctx, row.finish,xFinish,midY, this.colFinish);
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
}