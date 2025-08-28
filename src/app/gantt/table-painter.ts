// file: src/app/gantt/table-painter.ts
// Чистая отрисовка ТОЛЬКО табличной части (хедер + тело) на Canvas.
// ВНИМАНИЕ: painter сам учитывает вертикальный скролл через state.scrollTop
// и отрисовывает ТОЛЬКО видимое окно (visibleStartIndex..visibleEndIndex).

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
  levelColors: string[];

  // Шрифты/цвета/стили
  font: string;
  headerFont: string;
  zebraColor: string;
  gridColor: string;
  textColor: string;
  headerBg: string;
  headerBorder: string;

  // Состояния ховера/ресайза/перетаскивания
  hoverDividerX: number | null;
  isDragging: boolean;
  dragRowIndex: number;
  lastMouseY: number;   // ВЬЮПОРТНАЯ координата Y из компонента
  dragMouseDy: number;
  dropMode: DropMode;

  // Виртуализация (включительно)
  visibleStartIndex: number;
  visibleEndIndex: number;
  

  // Вьюпорт/скролл
  scrollTop: number;       // вертикальный скролл контейнера
  viewportHeight: number;  // высота видимой области контейнера
  scrollLeft: number;        // <— NEW
  viewportWidth: number;     // <— NEW

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

/** Отрисовать тело таблицы (виртуализировано, учитывает scrollTop). */
export function renderTableBody(bodyCanvas: HTMLCanvasElement, state: TablePaintState): void {
  const ctx = bodyCanvas.getContext('2d');
  if (!ctx) return;

  const width  = state.viewportWidth;   // <— используем вьюпорт
  const height = state.viewportHeight;  // <— используем вьюпорт

  ctx.clearRect(0, 0, width, height);
  ctx.font = state.font;

  const xGrip = 0;
  const xToggle = xGrip + state.colGrip;
  const xDataStart = xToggle + state.colToggle;

  const total = state.flatRows.length;
  if (!total) return;

  const startIndex = clamp(state.visibleStartIndex, 0, total - 1);
  const endIndex   = clamp(state.visibleEndIndex,   -1, total - 1);
  if (endIndex < startIndex) return;

  const firstTop = startIndex * state.rowHeight;
  const yOffset  = -(state.scrollTop - firstTop);

  ctx.save();

  // клип — по вьюпорту
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.clip();

  // ✅ учитываем горизонтальный скролл
  ctx.translate(-state.scrollLeft, 0);

  for (let i = startIndex; i <= endIndex; i++) {
    const row = state.flatRows[i];
    const y   = (i - startIndex) * state.rowHeight + yOffset;

    if (i % 2 === 1) {
      ctx.fillStyle = state.zebraColor;
      ctx.fillRect(0, y, width + state.scrollLeft, state.rowHeight);
    }

    if (row.hasChildren) {
      ctx.fillStyle = getLevelColor(row.level, state.levelColors);
      ctx.fillRect(state.colGrip, y, width + state.scrollLeft - state.colGrip, state.rowHeight);
    }

    ctx.beginPath();
    ctx.moveTo(0, y + state.rowHeight + 0.5);
    ctx.lineTo(width + state.scrollLeft, y + state.rowHeight + 0.5);
    ctx.strokeStyle = state.gridColor;
    ctx.stroke();

    drawGrip(ctx, xGrip + 10, y + (state.rowHeight - 12) / 2, 12, 12);

    drawLevelIndicators(
      ctx, row.level, y, xToggle,
      state.toggleIndentPerLevel, state.rowHeight, state.levelColors
    );

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

    ctx.fillStyle = state.textColor;
    const midY = y + state.rowHeight / 2;
    let cursor = xDataStart;
    for (const col of state.columns) {
      const val = state.getCellValue(row, col.key);
      drawClippedText(ctx, val, cursor, midY, col.width, 10);
      cursor += col.width;
    }
  }

  // вертикальные линии сетки (уже со сдвигом)
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

  ctx.restore();
}




function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
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

  ctx.save();
  for (let l = 0; l <= level; l++) {
    const x = xToggle + l * barW;
    ctx.fillStyle = getLevelColor(l, levelColors);
    ctx.fillRect(x, rowTopY, barW, h);
  }
  ctx.restore();
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
  const cols = 2;
  const rows = 3;
  const dotR = 1.5;
  const gapX = 4;
  const gapY = 4;

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

/** Прямоугольник хит-зоны «ручки» (ВО ВЬЮПОРТНЫХ координатах). */
function getGripHitRectViewport(
  rowIndex: number,
  state: TablePaintState
): { x: number; y: number; w: number; h: number } {
  const xGrip = 0; // колонка ручки начинается с 0
  const x = xGrip + 10;
  const yContent = rowIndex * state.rowHeight + Math.floor((state.rowHeight - 12) / 2);
  const yViewport = yContent - state.scrollTop; // переводим в вьюпорт
  return { x, y: yViewport, w: 12, h: 12 };
}

/** Прямоугольник хит-зоны треугольника (ВО ВЬЮПОРТНЫХ координатах). */
function getToggleHitRectViewport(
  row: FlatRow,
  rowIndex: number,
  state: TablePaintState
): { x: number; y: number; w: number; h: number } | null {
  if (!row.hasChildren) return null;

  const triSize = 12;
  const xGrip = 0;
  const xToggle = xGrip + state.colGrip;
  const triX = xToggle + 8 + state.toggleIndentPerLevel * row.level;

  const yContent = rowIndex * state.rowHeight + Math.floor((state.rowHeight - triSize) / 2);
  const yViewport = yContent - state.scrollTop;

  return { x: triX, y: yViewport, w: triSize, h: triSize };
}

/** Курсор "grab"/"grabbing" над 6 точками и "pointer" над треугольником. */
export function handleBodyMouseMove(
  bodyCanvas: HTMLCanvasElement,
  state: TablePaintState,
  mouseX: number,
  mouseY: number
): void {
  // Абсолютный индекс строки под мышью: мышь во вьюпорте => добавляем scrollTop
  const absIndex = Math.floor((mouseY + state.scrollTop) / state.rowHeight);
  const rowIndex = clamp(
    absIndex,
    state.visibleStartIndex,
    state.visibleEndIndex
  );
  const row = state.flatRows[rowIndex];
  if (!row) {
    bodyCanvas.style.cursor = 'default';
    return;
  }

  // Хит по "ручке"
  const grip = getGripHitRectViewport(rowIndex, state);
  const inGrip =
    mouseX >= grip.x && mouseX <= grip.x + grip.w &&
    mouseY >= grip.y && mouseY <= grip.y + grip.h;

  if (inGrip) {
    bodyCanvas.style.cursor = state.isDragging ? 'grabbing' : 'grab';
    return;
  }

  // Хит по треугольнику
  const toggleRect = getToggleHitRectViewport(row, rowIndex, state);
  if (toggleRect) {
    const inToggle =
      mouseX >= toggleRect.x && mouseX <= toggleRect.x + toggleRect.w &&
      mouseY >= toggleRect.y && mouseY <= toggleRect.y + toggleRect.h;

    if (inToggle) {
      bodyCanvas.style.cursor = 'pointer';
      return;
    }
  }

  bodyCanvas.style.cursor = 'default';
}

/** Сброс курсора при уходе мыши с canvas. */
export function handleBodyMouseLeave(bodyCanvas: HTMLCanvasElement): void {
  bodyCanvas.style.cursor = 'default';
}

/** Линия-вставка для DropMode.insert. (КОНТЕНТНЫЕ координаты) */
function drawInsertLine(ctx: CanvasRenderingContext2D, yContent: number, width: number) {
  ctx.save();
  ctx.strokeStyle = '#4c8dff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, yContent + 0.5);
  ctx.lineTo(width, yContent + 0.5);
  ctx.stroke();
  ctx.restore();
}

/** Пунктирный прямоугольник для DropMode.child. (КОНТЕНТНЫЕ координаты) */
function drawDashedRect(
  ctx: CanvasRenderingContext2D,
  x: number, yContent: number,
  w: number, h: number
) {
  ctx.save();
  ctx.strokeStyle = '#4c8dff';
  ctx.setLineDash([6, 4]);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 0.5, yContent + 0.5, w - 1, h - 1);
  ctx.restore();
}

/** Призрачный «перетаскиваемый» прямоугольник. (КОНТЕНТНЫЕ координаты) */
function drawDragGhost(
  ctx: CanvasRenderingContext2D,
  yContent: number,
  width: number,
  rowHeight: number
) {
  ctx.save();
  ctx.globalAlpha = 0.15;
  ctx.fillStyle = '#4c8dff';
  ctx.fillRect(0, Math.round(yContent), width, rowHeight);
  ctx.globalAlpha = 1;
  ctx.restore();
}
