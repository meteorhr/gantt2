// file: src/app/gantt/table-painter.ts
// Чистая отрисовка ТОЛЬКО табличной части (хедер + тело) на Canvas.
// Принимает все необходимые данные через TablePaintState.

import { ColumnDef, FlatRow } from './models/gantt.model';
import { DropMode } from './models/gantt.types';

export interface TablePaintState {
  // Данные
  columns: ColumnDef[];
  flatRows: FlatRow[];
  collapsedIds: Set<string>;

  // Геометрия/параметры
  headerHeight: number;          // напр. 36
  rowHeight: number;             // напр. 28
  colGrip: number;               // напр. 28
  colToggle: number;             // baseToggleWidth + maxLevel*indent
  toggleIndentPerLevel: number;  // напр. 12

  // Палитра уровней
  levelColors: string[];         // ['#F2BE90', ...] — передаётся из компонента

  // Шрифты/цвета/стили
  font: string;           // '12px system-ui, ...'
  headerFont: string;     // '600 12px system-ui, ...'
  zebraColor: string;     // '#fafafa'
  gridColor: string;      // '#e6e6e6'
  textColor: string;      // '#000'
  headerBg: string;       // '#f5f7fb'
  headerBorder: string;   // '#dcdfe6'

  // Состояния ховера/ресайза/перетаскивания
  hoverDividerX: number | null;
  isDragging: boolean;
  dragRowIndex: number;
  lastMouseY: number;
  dragMouseDy: number;
  dropMode: DropMode;

  // Виртуализация: видимый диапазон строк (включительно)
  visibleStartIndex: number;
  visibleEndIndex: number;

  // Поставщик значения ячейки
  getCellValue: (row: FlatRow, key: string) => string;
}

/** Отрисовать хедер таблицы. */
export function renderTableHeader(headerCanvas: HTMLCanvasElement, state: TablePaintState): void {
  const ctx = headerCanvas.getContext('2d');
  if (!ctx) return;

  const width  = parseInt(headerCanvas.style.width, 10) || headerCanvas.width;
  const height = state.headerHeight;

  ctx.clearRect(0, 0, width, height);

  // фон хедера
  ctx.fillStyle = state.headerBg;
  ctx.fillRect(0, 0, width, height);

  const xGrip = 0;
  const xToggle = xGrip + state.colGrip;
  const xDataStart = xToggle + state.colToggle;

  // Вертикали: после Grip, после Toggle и после каждого столбца
  ctx.beginPath();
  ctx.moveTo(state.colGrip + 0.5, 0);
  ctx.lineTo(state.colGrip + 0.5, height);
  ctx.moveTo((state.colGrip + state.colToggle) + 0.5, 0);
  ctx.lineTo((state.colGrip + state.colToggle) + 0.5, height);

  let cursor = xDataStart;
  for (const col of state.columns) {
    const right = cursor + col.width;
    ctx.moveTo(right + 0.5, 0);
    ctx.lineTo(right + 0.5, height);
    cursor = right;
  }
  ctx.strokeStyle = state.headerBorder;
  ctx.stroke();

  // Заголовки
  ctx.font = state.headerFont;
  ctx.fillStyle = state.textColor;
  ctx.textBaseline = 'middle';

  cursor = xDataStart;
  for (const col of state.columns) {
    drawClippedText(ctx, col.title, cursor, height / 2, col.width, 10);
    cursor += col.width;
  }

  // Нижняя граница хедера
  ctx.strokeStyle = state.headerBorder;
  ctx.beginPath();
  ctx.moveTo(0, height + 0.5);
  ctx.lineTo(width, height + 0.5);
  ctx.stroke();

  // Подсветка наведённого делителя
  if (state.hoverDividerX != null) {
    ctx.save();
    ctx.strokeStyle = '#4c8dff';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(state.hoverDividerX + 0.5, 0);
    ctx.lineTo(state.hoverDividerX + 0.5, height);
    ctx.stroke();
    ctx.restore();
  }
}

/** Отрисовать тело таблицы (виртуализировано через переданный диапазон). */
export function renderTableBody(bodyCanvas: HTMLCanvasElement, state: TablePaintState): void {
  const ctx = bodyCanvas.getContext('2d');
  if (!ctx) return;

  const width  = parseInt(bodyCanvas.style.width, 10)  || bodyCanvas.width;
  const height = parseInt(bodyCanvas.style.height, 10) || bodyCanvas.height;

  ctx.clearRect(0, 0, width, height);
  ctx.font = state.font;

  const xGrip = 0;
  const xToggle = xGrip + state.colGrip;
  const xDataStart = xToggle + state.colToggle;

  const startIndex = clamp(state.visibleStartIndex, 0, state.flatRows.length - 1);
  const endIndex   = clamp(state.visibleEndIndex,   -1, state.flatRows.length - 1);

  for (let i = startIndex; i <= endIndex; i++) {
    const y = i * state.rowHeight;
    const row = state.flatRows[i];

    // 1) Зебра
    if (i % 2 === 1) {
      ctx.fillStyle = state.zebraColor;
      ctx.fillRect(0, y, width, state.rowHeight);
    }

    // 2) Фон уровня для РОДИТЕЛЯ (как вы просили)
    if (row.hasChildren) {
      ctx.fillStyle = getLevelColor(row.level, state.levelColors);
      ctx.fillRect(state.colGrip, y, width - state.colGrip, state.rowHeight);
    }

    // 3) Горизонтальная линия строки
    ctx.beginPath();
    ctx.moveTo(0, y + state.rowHeight + 0.5);
    ctx.lineTo(width, y + state.rowHeight + 0.5);
    ctx.strokeStyle = state.gridColor;
    ctx.stroke();

    // 4) Текст/иконки
    ctx.fillStyle = state.textColor;
    ctx.textBaseline = 'middle';

    // «ручка» перетаскивания (3 точки)
    drawGrip(ctx, xGrip + 10, y + (state.rowHeight - 12) / 2, 12, 12);

    // 5) ВИЗУАЛИЗАЦИЯ УРОВНЕЙ: цветные полосы (индентация)
    drawLevelIndicators(
      ctx,
      row.level,
      y,
      xToggle,
      state.toggleIndentPerLevel,
      state.rowHeight,
      state.levelColors
    );

    // 6) Треугольник сворачивания/разворачивания
    if (row.hasChildren) {
      const triSize = 12;
      const triX = xToggle + 8 + state.toggleIndentPerLevel * row.level;
      const triY = y + (state.rowHeight - triSize) / 2;
      ctx.save();
      ctx.beginPath();
      if (state.collapsedIds.has(row.id)) {
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

    // 7) Значения ячеек
    ctx.fillStyle = state.textColor
    const midY = y + state.rowHeight / 2;
    let cursor = xDataStart;
    for (const col of state.columns) {
      const val = state.getCellValue(row, col.key);
      drawClippedText(ctx, val, cursor, midY, col.width, 10);
      cursor += col.width;
    }
  }

  // 8) Вертикальные линии сетки
  ctx.beginPath();
  ctx.moveTo(state.colGrip + 0.5, 0);
  ctx.lineTo(state.colGrip + 0.5, height);
  ctx.moveTo((state.colGrip + state.colToggle) + 0.5, 0);
  ctx.lineTo((state.colGrip + state.colToggle) + 0.5, height);

  let edge = xGrip + state.colGrip + state.colToggle;
  for (const col of state.columns) {
    edge += col.width;
    ctx.moveTo(edge + 0.5, 0);
    ctx.lineTo(edge + 0.5, height);
  }
  ctx.strokeStyle = state.gridColor;
  ctx.stroke();

  // 9) Подсветка наведённого делителя
  if (state.hoverDividerX != null) {
    ctx.save();
    ctx.strokeStyle = '#4c8dff';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(state.hoverDividerX + 0.5, 0);
    ctx.lineTo(state.hoverDividerX + 0.5, height);
    ctx.stroke();
    ctx.restore();
  }

  // 10) «Призрак» перетаскивания и подсветки дропа
  if (state.isDragging && state.dragRowIndex >= 0) {
    const ghostY = state.lastMouseY - state.dragMouseDy;
    drawDragGhost(ctx, ghostY, width, state.rowHeight);

    if (state.dropMode.kind === 'insert') {
      const insY = state.dropMode.beforeRowIndex * state.rowHeight;
      drawInsertLine(ctx, insY, width);
    } else if (state.dropMode.kind === 'child') {
      const rectY = state.dropMode.targetRowIndex * state.rowHeight;
      drawDashedRect(ctx, 0, rectY, width, state.rowHeight);
    }
  }
}

/* ==============================
 * ВНУТРЕННИЕ ХЕЛПЕРЫ ОТРИСОВКИ
 * ============================== */

function clamp(v: number, a: number, b: number): number {
  if (isNaN(v)) return a;
  return Math.max(a, Math.min(b, v));
}

/** Палитра уровня по индексу (циклически). */
function getLevelColor(levelIndex: number, levelColors: string[]): string {
  const arr = levelColors && levelColors.length ? levelColors : ['#eee'];
  const i = ((levelIndex % arr.length) + arr.length) % arr.length;
  return arr[i];
}

/** Цветные полосы-уровни по ширине indent, на всю высоту строки. */
function drawLevelIndicators(
    ctx: CanvasRenderingContext2D,
    level: number,
    rowTopY: number,
    xToggle: number,
    indentPerLevel: number,
    rowHeight: number,
    levelColors: string[]
  ) {
    const barW = indentPerLevel;
    const h = rowHeight;
  
    ctx.save(); // ← FIX: не протекаем fillStyle наружу
    for (let l = 0; l <= level; l++) {
      const x = xToggle + l * barW;
      ctx.fillStyle = getLevelColor(l, levelColors);
      ctx.fillRect(x, rowTopY, barW, h);
    }
    ctx.restore(); // ← FIX
  }

/** Текст с обрезкой по ширине (эллипсис). y — по центру строки. */
function drawClippedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  midY: number,
  boxWidth: number,
  pad: number
) {
  const tx = x + pad;
  const maxW = Math.max(0, boxWidth - pad * 2);
  if (maxW <= 0) return;

  const ell = '…';
  let s = text ?? '';
  let w = ctx.measureText(s).width;

  if (w <= maxW) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(s, tx, midY);
    return;
  }

  while (s.length > 0) {
    s = s.slice(0, -1);
    w = ctx.measureText(s + ell).width;
    if (w <= maxW) {
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(s + ell, tx, midY);
      return;
    }
  }
}

/** Шесть точки «ручки» для Drag. */
function drawGrip(
    ctx: CanvasRenderingContext2D,
    x: number, y: number,
    w: number, h: number
  ) {
    const cols = 2;           // 2 столбца
    const rows = 3;           // 3 строки
    const dotR = 1.5;         // радиус точки
    const gapX = 4;           // шаг по X между колонками
    const gapY = 4;           // шаг по Y между рядами
  
    // Центрируем решётку внутри прямоугольника w x h
    const gridW = (cols - 1) * gapX;
    const gridH = (rows - 1) * gapY;
    const cx0 = x + w / 2 - gridW / 2;
    const cy0 = y + h / 2 - gridH / 2;
  
    ctx.save();
    ctx.fillStyle = '#888';
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const cx = cx0 + c * gapX;
        const cy = cy0 + r * gapY;
        ctx.beginPath();
        ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function getGripHitRect(
    rowIndex: number,
    state: TablePaintState
  ): { x: number; y: number; w: number; h: number } {
    const xGrip = 0; // колонка ручки начинается с 0
    const x = xGrip + 10;
    const y = rowIndex * state.rowHeight + Math.floor((state.rowHeight - 12) / 2);
    const w = 12;
    const h = 12;
    return { x, y, w, h };
  }


  /** НОВОЕ: прямоугольник хит-зоны треугольника; null, если нет детей. */
function getToggleHitRect(
    row: FlatRow,
    rowIndex: number,
    state: TablePaintState
  ): { x: number; y: number; w: number; h: number } | null {
    if (!row.hasChildren) return null;
  
    const triSize = 12;
    const xGrip = 0;
    const xToggle = xGrip + state.colGrip;
    const triX = xToggle + 8 + state.toggleIndentPerLevel * row.level;
    const triY = rowIndex * state.rowHeight + Math.floor((state.rowHeight - triSize) / 2);
    return { x: triX, y: triY, w: triSize, h: triSize };
  }

  /** НОВОЕ: курсор "grab"/"grabbing" над 6 точками и "pointer" над треугольником. */
export function handleBodyMouseMove(
    bodyCanvas: HTMLCanvasElement,
    state: TablePaintState,
    mouseX: number,
    mouseY: number
  ): void {
    // Индекс строки относительно видимого окна
    const rel = Math.floor(mouseY / state.rowHeight);
    const rowIndex = clamp(
      state.visibleStartIndex + rel,
      state.visibleStartIndex,
      state.visibleEndIndex
    );
    const row = state.flatRows[rowIndex];
    if (!row) {
      bodyCanvas.style.cursor = 'default';
      return;
    }
  
    // Тест "6 точек"
    const grip = getGripHitRect(rowIndex, state);
    const inGrip =
      mouseX >= grip.x && mouseX <= grip.x + grip.w &&
      mouseY >= grip.y && mouseY <= grip.y + grip.h;
  
    if (inGrip) {
      bodyCanvas.style.cursor = state.isDragging ? 'grabbing' : 'grab';
      return;
    }
  
    // Тест треугольника
    const toggleRect = getToggleHitRect(row, rowIndex, state);
    if (toggleRect) {
      const inToggle =
        mouseX >= toggleRect.x && mouseX <= toggleRect.x + toggleRect.w &&
        mouseY >= toggleRect.y && mouseY <= toggleRect.y + toggleRect.h;
  
      if (inToggle) {
        bodyCanvas.style.cursor = 'pointer';
        return;
      }
    }
  
    // Иначе курсор по умолчанию
    bodyCanvas.style.cursor = 'default';
  }
  
  /** НОВОЕ: сброс курсора при уходе мыши с	canvas. */
  export function handleBodyMouseLeave(bodyCanvas: HTMLCanvasElement): void {
    bodyCanvas.style.cursor = 'default';
  }

/** Линия-вставка для DropMode.insert. */
function drawInsertLine(ctx: CanvasRenderingContext2D, y: number, width: number) {
  ctx.save();
  ctx.strokeStyle = '#4c8dff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, y + 0.5);
  ctx.lineTo(width, y + 0.5);
  ctx.stroke();
  ctx.restore();
}

/** Пунктирный прямоугольник для DropMode.child. */
function drawDashedRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  w: number, h: number
) {
  ctx.save();
  ctx.strokeStyle = '#4c8dff';
  ctx.setLineDash([6, 4]);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.restore();
}

/** Призрачный «перетаскиваемый» прямоугольник. */
function drawDragGhost(
  ctx: CanvasRenderingContext2D,
  y: number,
  width: number,
  rowHeight: number
) {
  ctx.save();
  ctx.globalAlpha = 0.15;
  ctx.fillStyle = '#4c8dff';
  ctx.fillRect(0, Math.round(y), width, rowHeight);
  ctx.globalAlpha = 1;
  ctx.restore();
}
