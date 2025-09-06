// Чистая геометрия для Canvas-Ганта: перевод времени в пиксели,
// бар-пиксели по индексу строки, хит-тесты (move/resize),
// «зона раскрытия» для кружков, координаты кружков и их хит-тесты.

import { FlatRow, Node } from './models/gantt.model';
import { MS_PER_DAY } from './utils/date-utils';

// Half of the milestone diamond diagonal in px (must match painter)
function msHalfPx(rowHeight: number, taskPad: number, taskGap: number) {
  const trackH = Math.max(4, Math.floor((rowHeight - taskPad * 2 - taskGap) / 2));
  const msSize = Math.min(Math.floor(rowHeight * 0.6), trackH + 4);
  return Math.floor(msSize / 2);
}

export type GanttHitMode = 'move' | 'resize-start' | 'resize-finish';

export interface BarPixels {
  x0: number;
  x1: number;
  yTop: number;
  yMid: number;
  yBot: number;
}

export interface GanttGeometryState {
  // Данные
  flatRows: FlatRow[];
  nodeIndex: Map<string, Node>;

  // Геометрия строк/шкалы
  rowHeight: number;
  ganttStartMs: number;
  ganttPxPerDay: number;

  // Параметры форм-фактора
  summaryThick: number; // толщина summary-бара по центру строки
  taskPad: number;      // отступ сверху/снизу для дорожек task
  taskGap: number;      // зазор между actual и baseline (task)

  // Параметры кружков для связей
  linkHandleR: number;
  linkHandleGap: number;
}

/* ==============================
   БАЗОВЫЕ КОНВЕРТОРЫ MS ↔ X(px)
   ============================== */

export function msToX(st: GanttGeometryState, ms: number): number {
  return ((ms - st.ganttStartMs) / MS_PER_DAY) * st.ganttPxPerDay + 0.5;
}

export function xToMs(st: GanttGeometryState, x: number): number {
  return st.ganttStartMs + ((x - 0.5) / st.ganttPxPerDay) * MS_PER_DAY;
}

/* ==============================
   ПИКСЕЛИ БАРА ДЛЯ СТРОКИ
   ============================== */

export function barPixelsForRowIndex(st: GanttGeometryState, i: number): BarPixels {
  const row = st.flatRows[i];
  const node = st.nodeIndex.get(row.id);

  const startStr = node?.start ?? row.start;
  const finishStr = node?.finish ?? row.finish;

  const s = new Date(startStr + 'T00:00:00').getTime();
  const f = new Date(finishStr + 'T00:00:00').getTime();

  const x0 = Math.round(msToX(st, s));
  const x1 = Math.round(msToX(st, f));

  const rowTop = i * st.rowHeight;

  if (row.hasChildren) {
    // summary — тонкая «лента» по центру строки
    const yMid = rowTop + st.rowHeight / 2;
    const yTop = Math.round(yMid - st.summaryThick / 2) + 0.5;
    const yBot = Math.round(yMid + st.summaryThick / 2) + 0.5;
    return { x0, x1, yTop, yMid, yBot };
  }

  // Если есть baseline — actual дорожка идёт сверху
  const bStartStr = node?.baselineStart ?? row.baselineStart;
  const bFinishStr = node?.baselineFinish ?? row.baselineFinish;
  const hasBaseline = !!(bStartStr && bFinishStr);

  if (hasBaseline) {
    const trackH = Math.max(4, Math.floor((st.rowHeight - st.taskPad * 2 - st.taskGap) / 2));
    const yTop = rowTop + st.taskPad; // верхняя дорожка (actual)
    const yBot = yTop + trackH;
    const yMid = yTop + trackH / 2;
    return { x0, x1, yTop, yMid, yBot };
  }

  // Без baseline — прямоугольник почти на всю строку с небольшим отступом
  const yTop = rowTop + 6;
  const yBot = rowTop + st.rowHeight - 6;
  const yMid = (yTop + yBot) / 2;
  return { x0, x1, yTop, yMid, yBot };
}

/* ==============================
   HIT-TEST БАРА (MOVE/RESIZE)
   ============================== */

export function hitGanttBarAt(
  st: GanttGeometryState,
  x: number,
  y: number,
  resizeHandlePx: number
): { rowIndex: number; mode: GanttHitMode } | null {
  const rowIndex = Math.floor(y / st.rowHeight);
  if (rowIndex < 0 || rowIndex >= st.flatRows.length) return null;

  const p = barPixelsForRowIndex(st, rowIndex);

  // Вертикально принимаем всё тело строки — проще попадать.
  const yTopRow = rowIndex * st.rowHeight;
  const yBotRow = yTopRow + st.rowHeight;
  if (y < yTopRow || y > yBotRow) return null;

  // --- MILESTONE: запрещаем resize, оставляем только move ---
  const row = st.flatRows[rowIndex];
  const node = st.nodeIndex.get(row.id);
  const tt = node?.task_type ?? 'TT_Task';
  const isMilestone = tt === 'TT_FinMile';

  if (isMilestone) {
    // Для нулевой ширины даём «толстую» зону нажатия вокруг x1
    const tol = Math.max(resizeHandlePx, 6); // допуск по X
    if (Math.abs(x - p.x1) <= tol) {
      return { rowIndex, mode: 'move' }; // только перемещение
    }
    return null; // никаких resize-start/finish
  }

  // --- Обычные задачи ---
  const h = resizeHandlePx;
  if (Math.abs(x - p.x0) <= h) return { rowIndex, mode: 'resize-start' };
  if (Math.abs(x - p.x1) <= h) return { rowIndex, mode: 'resize-finish' };

  const minX = Math.min(p.x0, p.x1);
  const maxX = Math.max(p.x0, p.x1);
  if (x >= minX && x <= maxX) return { rowIndex, mode: 'move' };

  return null;
}

/* ==============================
   «ЗОНА РАСКРЫТИЯ» КРУЖКОВ
   ============================== */

export function barRevealRowAt(st: GanttGeometryState, x: number, y: number): number | null {
  const i = Math.floor(y / st.rowHeight);
  if (i < 0 || i >= st.flatRows.length) return null;

  const p = barPixelsForRowIndex(st, i);
  const ext = st.linkHandleR + st.linkHandleGap;

  const yTop = i * st.rowHeight;
  const yBot = yTop + st.rowHeight;
  if (y < yTop || y > yBot) return null;

  const nodeR = st.nodeIndex.get(st.flatRows[i].id);
  const isMsR = (nodeR?.task_type ?? 'TT_Task') === 'TT_FinMile';
  const extra = isMsR ? msHalfPx(st.rowHeight, st.taskPad, st.taskGap) : 0;
  return x >= (p.x0 - ext - extra) && x <= (p.x1 + ext + extra) ? i : null;
}

/* ==============================
   КООРДИНАТЫ КРУЖКОВ
   ============================== */

export function rightHandleCenter(st: GanttGeometryState, i: number) {
  const p = barPixelsForRowIndex(st, i);
  const node = st.nodeIndex.get(st.flatRows[i].id);
  const isMs = (node?.task_type ?? 'TT_Task') === 'TT_FinMile';
  const offset = st.linkHandleR + st.linkHandleGap;
  const extra = isMs ? msHalfPx(st.rowHeight, st.taskPad, st.taskGap) : 0;
  return { x: p.x1 + offset + extra, y: p.yMid };
}

export function leftHandleCenter(st: GanttGeometryState, i: number) {
  const p = barPixelsForRowIndex(st, i);
  const node = st.nodeIndex.get(st.flatRows[i].id);
  const isMs = (node?.task_type ?? 'TT_Task') === 'TT_FinMile';
  const offset = st.linkHandleR + st.linkHandleGap;
  const extra = isMs ? msHalfPx(st.rowHeight, st.taskPad, st.taskGap) : 0;
  return { x: p.x0 - offset - extra, y: p.yMid };
}

/* ==============================
   HIT-TEST КРУЖКОВ
   ============================== */

function isInCircle(px: number, py: number, cx: number, cy: number, r: number) {
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

/** Попадание в ПРАВЫЙ кружок (требуем, чтобы курсор был реально правее бара). */
export function barRightHandleHit(st: GanttGeometryState, x: number, y: number): number | null {
  const i = Math.floor(y / st.rowHeight);
  if (i < 0 || i >= st.flatRows.length) return null;

  const p = barPixelsForRowIndex(st, i);
  const node = st.nodeIndex.get(st.flatRows[i].id);
  const isMs = (node?.task_type ?? 'TT_Task') === 'TT_FinMile';
  const extra = isMs ? msHalfPx(st.rowHeight, st.taskPad, st.taskGap) : 0;
  const { x: cx, y: cy } = rightHandleCenter(st, i);

  // курсор должен быть правее края бара (с учётом смещения ромба)
  if (x <= p.x1 + extra + st.linkHandleGap * 0.5) return null;

  return isInCircle(x, y, cx, cy, st.linkHandleR + 6 /* hitTol */) ? i : null;
}

/** Попадание в ЛЕВЫЙ кружок (требуем, чтобы курсор был левее бара). */
export function barLeftHandleHit(st: GanttGeometryState, x: number, y: number): number | null {
  const i = Math.floor(y / st.rowHeight);
  if (i < 0 || i >= st.flatRows.length) return null;

  const p = barPixelsForRowIndex(st, i);
  const node = st.nodeIndex.get(st.flatRows[i].id);
  const isMs = (node?.task_type ?? 'TT_Task') === 'TT_FinMile';
  const extra = isMs ? msHalfPx(st.rowHeight, st.taskPad, st.taskGap) : 0;
  const { x: cx, y: cy } = leftHandleCenter(st, i);

  // курсор должен быть левее края бара (с учётом смещения ромба)
  if (x >= p.x0 - extra - st.linkHandleGap * 0.5) return null;

  return isInCircle(x, y, cx, cy, st.linkHandleR + 6 /* hitTol */) ? i : null;
}
