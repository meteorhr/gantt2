// Чистая отрисовка Ганта (хедер + тело) на Canvas.
// По аналогии с table-painter.ts всё принимает через GanttPaintState
// и НИЧЕГО не знает о компоненте.

import { FlatRow, Node, RefLine } from './models/gantt.model';
import { BarColorName, GanttScale, TimeUnit } from './models/gantt.types';
import {
  MS_PER_DAY,
  startOfUnit,
  nextUnitStart,
  formatLabel,
  formatTopLabel,
  toMs
} from './utils/date-utils';

export interface GanttPaintState {
  // Данные
  flatRows: FlatRow[];
  nodeIndex: Map<string, Node>;
  rowIndexById: Map<string, number>;
  rowIndexByWbs: Map<string, number>;
  refLines: RefLine[];

  // Геометрия/виртуализация
  headerHeight: number;
  rowHeight: number;
  visibleStartIndex: number;
  visibleEndIndex: number;

  // Вьюпорт/скролл — НОВОЕ
  scrollTop: number;
  viewportHeight: number;
  scrollLeft: number;
  viewportWidth: number;

  // Временная шкала
  ganttPxPerDay: number;
  ganttStartMs: number;
  ganttEndMs: number;
  ganttScale: GanttScale;

  // Внешний вид
  font: string;
  headerFont: string;
  gridColor: string;
  textColor: string;
  headerBg: string;
  headerBorder: string;

  // Цвета баров
  colorOf: (name: BarColorName) => string;
  rgba: (hex: string, a: number) => string;

  // Визуальные параметры задач
  summaryThick: number;
  taskPad: number;
  taskGap: number;

  // Hover / линкование
  hoverBarRow: number | null;
  hoverGanttHitMode: 'move' | 'resize-start' | 'resize-finish' | null;
  linkMode: 'none' | 'drag';
  linkSourceRow: number;
  linkStartX: number; linkStartY: number;
  linkMouseX: number; linkMouseY: number;
  linkHoverTargetRow: number | null;
  linkHandleR: number;
  linkHandleGap: number;

  // Прогресс
  rowProgress01: (rowIndex: number) => number;

  selectedRowIndex: number;      // -1 если нет
  selectedRowColor: string;      // напр. 'rgba(76,141,255,0.14)'
}

/** Отрисовать шапку Ганта. */
export function renderGanttHeader(canvas: HTMLCanvasElement, st: GanttPaintState): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const width  = parseInt(canvas.style.width, 10)  || canvas.width;
  const height = st.headerHeight;
  const half   = Math.floor(height / 2);

  ctx.clearRect(0, 0, width, height);

  // фон
  ctx.fillStyle = st.headerBg;
  ctx.fillRect(0, 0, width, height);

  // разделитель половинок
  ctx.strokeStyle = st.headerBorder;
  ctx.beginPath();
  ctx.moveTo(0, half + 0.5);
  ctx.lineTo(width, half + 0.5);
  ctx.stroke();

  // выбрать пары единиц
  let top: TimeUnit, bottom: TimeUnit;
  switch (st.ganttScale) {
    case 'week-day':       top = 'week';    bottom = 'day';     break;
    case 'month-week':     top = 'month';   bottom = 'week';    break;
    case 'quarter-month':  top = 'quarter'; bottom = 'month';   break;
    case 'year-month':     top = 'year';    bottom = 'month';   break;
    case 'year-quarter':   top = 'year';    bottom = 'quarter'; break;
  }

  ctx.font = st.headerFont;
  ctx.fillStyle = st.textColor;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';

  // верхняя строка
  {
    let cur = startOfUnit(new Date(st.ganttStartMs), top);
    while (cur.getTime() < st.ganttEndMs) {
      const next = nextUnitStart(cur, top);
      const segStart = Math.max(st.ganttStartMs, cur.getTime());
      const segEnd   = Math.min(st.ganttEndMs, next.getTime());

      const x0 = msToX(st, segStart);
      const x1 = msToX(st, segEnd);
      const cx = x0 + (x1 - x0) / 2;

      ctx.fillText(formatTopLabel(cur, top), cx, Math.floor(half / 2));

      ctx.strokeStyle = st.headerBorder;
      ctx.beginPath();
      ctx.moveTo(x1 + 0.5, 0);
      ctx.lineTo(x1 + 0.5, half);
      ctx.stroke();

      cur = next;
    }
  }

  // нижняя строка
  {
    let cur = startOfUnit(new Date(st.ganttStartMs), bottom);
    const midY = half + Math.floor(half / 2);

    while (cur.getTime() < st.ganttEndMs) {
      const next = nextUnitStart(cur, bottom);
      const segStart = Math.max(st.ganttStartMs, cur.getTime());
      const segEnd   = Math.min(st.ganttEndMs, next.getTime());

      const x0 = msToX(st, segStart);
      const x1 = msToX(st, segEnd);
      const cx = x0 + (x1 - x0) / 2;

      ctx.strokeStyle = st.headerBorder;
      ctx.beginPath();
      ctx.moveTo(x0 + 0.5, half);
      ctx.lineTo(x0 + 0.5, height);
      ctx.stroke();

      ctx.fillStyle = st.textColor;
      ctx.fillText(formatLabel(cur, bottom), cx, midY);

      cur = next;
    }
  }

  // нижняя граница шапки
  ctx.strokeStyle = st.headerBorder;
  ctx.beginPath();
  ctx.moveTo(0, height + 0.5);
  ctx.lineTo(width, height + 0.5);
  ctx.stroke();

  // стартовая вертикаль в нижней половине
  ctx.beginPath();
  ctx.moveTo(0.5, half);
  ctx.lineTo(0.5, height);
  ctx.stroke();

  // референс-линии
  if (st.refLines?.length) {
    for (const rl of st.refLines) {
      const ms = toMs(rl.date);
      if (ms < st.ganttStartMs || ms > st.ganttEndMs) continue;
      const x = msToX(st, ms);

      ctx.save();
      if (rl.dash) ctx.setLineDash(rl.dash);
      ctx.strokeStyle = rl.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();

      if (rl.name) {
        const text = rl.name;
        ctx.font = st.headerFont;
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

/** Отрисовать тело Ганта (виртуализировано). */
export function renderGanttBody(canvas: HTMLCanvasElement, st: GanttPaintState): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const width  = st.viewportWidth  || parseInt(canvas.style.width, 10)  || canvas.width;
  const height = st.viewportHeight || parseInt(canvas.style.height, 10) || canvas.height;

  ctx.clearRect(0, 0, width, height);

  // Клип по вьюпорту
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.clip();

  // ✅ Сдвигаем контекст ровно на scrollLeft/scrollTop (а не на yShift)
  ctx.translate(-st.scrollLeft, -st.scrollTop);

  // Видимое окно в КОНТЕНТНЫХ координатах
  const x0 = st.scrollLeft;
  const x1 = st.scrollLeft + st.viewportWidth;
  const y0 = st.scrollTop;
  const y1 = st.scrollTop + st.viewportHeight;

  // ===== Вертикальная сетка времени =====
  ctx.strokeStyle = '#ececec';
  const gridUnit: TimeUnit =
    st.ganttScale === 'week-day'      ? 'day' :
    st.ganttScale === 'month-week'    ? 'week' :
    st.ganttScale === 'quarter-month' ? 'month' :
    st.ganttScale === 'year-month'    ? 'month' : 'quarter';

  let cur = startOfUnit(new Date(st.ganttStartMs), gridUnit);
  while (cur.getTime() <= st.ganttEndMs) {
    const x = Math.round(msToX(st, cur.getTime())) + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, y0);
    ctx.lineTo(x, y1);
    ctx.stroke();
    cur = nextUnitStart(cur, gridUnit);
  }

  // ===== Горизонтальные разделители строк =====
  ctx.strokeStyle = st.gridColor;
  for (let i = st.visibleStartIndex; i <= st.visibleEndIndex; i++) {
    const yTop    = i * st.rowHeight;               // верх текущей строки
    const yBottom = (i + 1) * st.rowHeight + 0.5;   // линия-низ строки (для stroke)
  
    // подсветка должна начинаться с ВЕРХА строки
    if (i === st.selectedRowIndex) {
      ctx.save();
      ctx.fillStyle = st.selectedRowColor || 'rgba(76,141,255,0.14)';
      // можно заливать только видимую область, чтобы не опасаться translate/clip
      ctx.fillRect(x0, yTop, x1 - x0, st.rowHeight);
      ctx.restore();
    }
  
    // разделительная линия по низу строки
    ctx.beginPath();
    ctx.moveTo(x0, yBottom);
    ctx.lineTo(x1, yBottom);
    ctx.stroke();
  }
  // Хелпер скругления

  function diamondPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
    // size — длина стороны квадрата до поворота; ромб будет вписан в квадрат size×size.
    const h = Math.floor(size / 2); // половина диагонали по вертикали/горизонтали после поворота
    ctx.beginPath();
    ctx.moveTo(cx,      cy - h); // верхняя вершина
    ctx.lineTo(cx + h,  cy);     // правая
    ctx.lineTo(cx,      cy + h); // нижняя
    ctx.lineTo(cx - h,  cy);     // левая
    ctx.closePath();
  }

  const rr = (x: number, y: number, w: number, h: number, r: number) => {
    const rad = Math.min(r, h / 2, w / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.lineTo(x + w - rad, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
    ctx.lineTo(x + w, y + h - rad);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
    ctx.lineTo(x + rad, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
    ctx.lineTo(x, y + rad);
    ctx.quadraticCurveTo(x, y, x + rad, y);
    ctx.closePath();
  };

  // ===== Бары (как было) =====
  const strokeBlack = '#000';
  for (let i = st.visibleStartIndex; i <= st.visibleEndIndex; i++) {
    const row  = st.flatRows[i];
    const node = st.nodeIndex.get(row.id);

    const startStr  = node?.start  ?? row.start;
    const finishStr = node?.finish ?? row.finish;
    const s = new Date(startStr  + 'T00:00:00').getTime();
    const f = new Date(finishStr + 'T00:00:00').getTime();
    const x0b = Math.round(msToX(st, s));
    const x1b = Math.round(msToX(st, f));
    const w  = Math.max(3, x1b - x0b);

    const bStartStr  = node?.baselineStart  ?? row.baselineStart;
    const bFinishStr = node?.baselineFinish ?? row.baselineFinish;
    const hasBaseline = !!(bStartStr && bFinishStr);

    let bx0 = 0, bx1 = 0, bw = 0;
    if (hasBaseline) {
      const bs  = new Date(bStartStr! + 'T00:00:00').getTime();
      const bf  = new Date(bFinishStr! + 'T00:00:00').getTime();
      const _bx0 = Math.round(msToX(st, bs));
      const _bx1 = Math.round(msToX(st, bf));
      bx0 = Math.min(_bx0, _bx1);
      bx1 = Math.max(_bx0, _bx1);
      bw  = Math.max(3, bx1 - bx0);
    }

    const rowTop = i * st.rowHeight;
    const pad    = st.taskPad;
    const gap    = st.taskGap;
    const trackH = Math.max(4, Math.floor((st.rowHeight - pad * 2 - gap) / 2));

    if (row.hasChildren) {
      const groupFill = st.colorOf('group');
      const yc   = rowTop + st.rowHeight / 2;
      const thick = st.summaryThick;
      const capMax = 8;
      const cap = Math.min(capMax, Math.floor(w / 2));
      const yTop = Math.round(yc - thick / 2) + 0.5;
      const yBot = Math.round(yc + thick / 2) + 0.5;
      const coreX0 = x0b + cap;
      const coreX1 = x1b - cap;

      ctx.save();
      if (coreX1 > coreX0) {
        ctx.fillStyle = groupFill;
        ctx.fillRect(coreX0, yTop - 0.5, coreX1 - coreX0, (yBot - yTop) + 1);
      }
      ctx.beginPath();
      ctx.moveTo(x0b, yBot);
      ctx.lineTo(coreX0, yBot);
      ctx.lineTo(x0b, yBot + cap);
      ctx.closePath();
      ctx.fillStyle = groupFill; ctx.fill();
      ctx.strokeStyle = strokeBlack; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0b, yBot); ctx.lineTo(x0b, yBot + cap);
      ctx.moveTo(x0b, yBot + cap); ctx.lineTo(coreX0, yBot);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(x1b, yBot);
      ctx.lineTo(coreX1, yBot);
      ctx.lineTo(x1b, yBot + cap);
      ctx.closePath();
      ctx.fill(); ctx.stroke();

      ctx.fillStyle = groupFill;
      ctx.fillRect(x0b, yTop - 0.5, Math.max(0, coreX0 - x0b), (yBot - yTop) + 1);
      ctx.fillRect(coreX1, yTop - 0.5, Math.max(0, x1b - coreX1), (yBot - yTop) + 1);
      ctx.strokeStyle = strokeBlack;
      ctx.beginPath();
      ctx.moveTo(x0b, yTop); ctx.lineTo(x1b, yTop);
      ctx.moveTo(coreX0 - 1, yBot); ctx.lineTo(coreX1 + 1, yBot);
      ctx.moveTo(x0b, yTop); ctx.lineTo(x0b, yBot);
      ctx.moveTo(x1b, yTop); ctx.lineTo(x1b, yBot);
      ctx.stroke();
      ctx.restore();

    } else {
      const isCritical = !!(node?.critical);
      const actualColor = isCritical ? st.colorOf('criticalpatch') : st.colorOf('actual');
      const actualBase  = st.rgba(actualColor, 0.35);

      const tt = node?.task_type ?? 'TT_Task';
      const isMilestone = tt === 'TT_FinMile';

      if (isMilestone) {
        // ---- РИСУЕМ КВАДРАТНЫЙ МИЛСТОН НА ФИНИШЕ ----
        // Размер квадрата: 60% высоты строки, но не больше дорожки task
        const msSize = Math.min(Math.floor(st.rowHeight * 0.6), trackH + 4);
        const half   = Math.floor(msSize / 2);

        const yTopSq = rowTop + Math.floor((st.rowHeight - msSize) / 2);
        const yBotSq = yTopSq + msSize;



  // Центр по вертикали — середина строки; по горизонтали — finish
  const cy = rowTop + Math.floor(st.rowHeight / 2);
  const axCenter = x1b; // actual на фактическом финише

  if (hasBaseline) {
    const baselineColor = st.colorOf('baseline');
    const bf  = new Date(bFinishStr! + 'T00:00:00').getTime();
    const bx1 = Math.round(msToX(st, bf)); // центр baseline-ромба

    ctx.save();
    diamondPath(ctx, bx1, cy, msSize);
    ctx.fillStyle = st.rgba(baselineColor, 1);
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#000';
    ctx.stroke();
    ctx.restore();
  }


  // actual — верхним слоем
  ctx.save();
  // Подложка как у баров: полупрозрачная
  diamondPath(ctx, axCenter, cy, msSize);
  ctx.fillStyle = actualBase;
  ctx.fill();

  // Внутренняя «начинка» более насыщенная, чтобы читалась обводка
  const inset = 2;
  diamondPath(ctx, axCenter, cy, Math.max(4, msSize - inset * 2));
  ctx.fillStyle = actualColor;
  ctx.fill();

  // Обводка
  diamondPath(ctx, axCenter, cy, msSize);
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
      } else if (hasBaseline) {
        const baselineColor = st.colorOf('baseline');
        ctx.save();
        rr(bx0, rowTop + pad + trackH + gap, bw, trackH, 1);
        ctx.fillStyle = st.rgba(baselineColor, 1);
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = strokeBlack;
        ctx.stroke();
        ctx.restore();

        const prog = st.rowProgress01(i);
        const pw = Math.max(0, Math.round(w * prog));
        ctx.save();
        rr(x0b, rowTop + pad, w, trackH, 1);
        ctx.clip();
        ctx.fillStyle = actualBase;
        ctx.fillRect(x0b, rowTop + pad, w, trackH);
        ctx.fillStyle = actualColor;
        if (pw > 0) ctx.fillRect(x0b, rowTop + pad, pw, trackH);
        ctx.restore();

        ctx.save();
        rr(x0b, rowTop + pad, w, trackH, 1);
        ctx.strokeStyle = strokeBlack;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();

      } else {
        const y = rowTop + 6;
        const h = st.rowHeight - 12;
        const prog = st.rowProgress01(i);
        const cw = Math.max(0, Math.round(w * prog));

        ctx.save();
        ctx.strokeStyle = strokeBlack;
        ctx.lineWidth = 1;

        ctx.beginPath();
        ctx.moveTo(x0b + 1, y);
        ctx.lineTo(x0b + w - 1, y);
        ctx.quadraticCurveTo(x0b + w, y, x0b + w, y + 1);
        ctx.lineTo(x0b + w, y + h - 1);
        ctx.quadraticCurveTo(x0b + w, y + h, x0b + w - 1, y + h);
        ctx.lineTo(x0b + 1, y + h);
        ctx.quadraticCurveTo(x0b, y + h, x0b, y + h - 1);
        ctx.lineTo(x0b, y + 1);
        ctx.quadraticCurveTo(x0b, y, x0b + 1, y);
        ctx.closePath();

        ctx.save();
        ctx.clip();
        ctx.fillStyle = actualBase;
        ctx.fillRect(x0b, y, w, h);
        ctx.fillStyle = actualColor;
        if (cw > 0) ctx.fillRect(x0b, y, cw, h);
        ctx.restore();

        ctx.stroke();
        ctx.restore();
      }
    }
  }

  // ===== Референс-линии =====
  if (st.refLines?.length) {
    for (const rl of st.refLines) {
      const ms = toMs(rl.date);
      if (ms < st.ganttStartMs || ms > st.ganttEndMs) continue;
      const x = msToX(st, ms);

      ctx.save();
      if (rl.dash) ctx.setLineDash(rl.dash);
      ctx.strokeStyle = rl.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y1);
      ctx.stroke();
      ctx.restore();
    }
  }

  // ===== Зависимости + превью линков/кружки =====
  drawDependencies(ctx, st);
  drawLinkPreviewAndHandles(ctx, st);

  ctx.restore();
}



// вспомогательный «скруглённик»
function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}

/* ===========================
   ВНУТРЕННИЕ ХЕЛПЕРЫ РИСОВАЛКИ
   =========================== */

function msToX(st: GanttPaintState, ms: number): number {
  return ((ms - st.ganttStartMs) / MS_PER_DAY) * st.ganttPxPerDay + 0.5;
}

function barPixelsForRowIndex(st: GanttPaintState, i: number) {
  const row  = st.flatRows[i];
  const node = st.nodeIndex.get(row.id);

  const startStr  = node?.start  ?? row.start;
  const finishStr = node?.finish ?? row.finish;
  const s  = new Date(startStr  + 'T00:00:00').getTime();
  const f  = new Date(finishStr + 'T00:00:00').getTime();
  const x0 = Math.round(msToX(st, s));
  const x1 = Math.round(msToX(st, f));

  const rowTop = i * st.rowHeight;

  if (row.hasChildren) {
    const yMid = rowTop + st.rowHeight / 2;
    const yTop = Math.round(yMid - st.summaryThick / 2) + 0.5;
    const yBot = Math.round(yMid + st.summaryThick / 2) + 0.5;
    return { x0, x1, yTop, yMid, yBot };
  }

    // --- НОВОЕ: ветка для milestone ---
    const tt = node?.task_type ?? 'TT_Task';
    const isMilestone = tt === 'TT_FinMile';
    if (isMilestone) {
      // Квадрат центрируем по ФИНИШУ
      const msSize = Math.min(Math.floor(st.rowHeight * 0.6),
                              Math.max(4, Math.floor((st.rowHeight - st.taskPad * 2 - st.taskGap) / 2)) + 4);
      const yTopSq = rowTop + Math.floor((st.rowHeight - msSize) / 2);
      const yBotSq = yTopSq + msSize;
      const yMid   = (yTopSq + yBotSq) / 2;
  
      const x = x1; // финиш
      // Возвращаем нулевую ширину по X, чтобы хэндлы/стрелки брали «край» в точке финиша
      return { x0: x, x1: x, yTop: yTopSq, yMid, yBot: yBotSq };
    }

  const pad = st.taskPad;
  const gap = st.taskGap;
  const trackH = Math.max(4, Math.floor((st.rowHeight - pad * 2 - gap) / 2));

  // если есть baseline — верхняя дорожка (actual)
  const nodeBStart = st.nodeIndex.get(row.id)?.baselineStart ?? row.baselineStart;
  const nodeBFinish = st.nodeIndex.get(row.id)?.baselineFinish ?? row.baselineFinish;
  const hasBaseline = !!(nodeBStart && nodeBFinish);
  if (hasBaseline) {
    const yTop = rowTop + pad;
    const yBot = yTop + trackH;
    const yMid = yTop + trackH / 2;
    return { x0, x1, yTop, yMid, yBot };
  }

  // иначе — прямоугольник почти на всю строку
  const yTop = rowTop + 6;
  const yBot = rowTop + st.rowHeight - 6;
  const yMid = (yTop + yBot) / 2;
  return { x0, x1, yTop, yMid, yBot };
}

function rightHandleCenter(st: GanttPaintState, i: number) {
  const p = barPixelsForRowIndex(st, i);
  const offset = st.linkHandleR + st.linkHandleGap;
  return { x: p.x1 + offset, y: p.yMid };
}
function leftHandleCenter(st: GanttPaintState, i: number) {
  const p = barPixelsForRowIndex(st, i);
  const offset = st.linkHandleR + st.linkHandleGap;
  return { x: p.x0 - offset, y: p.yMid };
}

function drawHandle(
  ctx: CanvasRenderingContext2D,
  st: GanttPaintState,
  x: number, y: number,
  side: 'left'|'right',
  active = false
) {
  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = active ? '#2563eb' : '#3b82f6';
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(x, y, st.linkHandleR, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // мини-стрелка внутри
  ctx.beginPath();
  if (side === 'right') {
    ctx.moveTo(x - 3, y - 3); ctx.lineTo(x + 2, y); ctx.lineTo(x - 3, y + 3);
  } else {
    ctx.moveTo(x + 3, y - 3); ctx.lineTo(x - 2, y); ctx.lineTo(x + 3, y + 3);
  }
  ctx.stroke();
  ctx.restore();
}

function drawHandleWithStem(
  ctx: CanvasRenderingContext2D,
  st: GanttPaintState,
  barEdgeX: number, cx: number, cy: number,
  side: 'left'|'right', active = false
) {
  ctx.save();
  ctx.strokeStyle = active ? '#2563eb' : '#94a3b8';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(barEdgeX + 0.5, cy + 0.5);
  ctx.lineTo(cx + 0.5,      cy + 0.5);
  ctx.stroke();
  ctx.restore();

  drawHandle(ctx, st, cx, cy, side, active);
}

function drawArrowhead(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  dir: 'left'|'right'|'up'|'down',
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

/** Рисует зависимости по node.dependency (id или WBS). */
function drawDependencies(ctx: CanvasRenderingContext2D, st: GanttPaintState) {
  ctx.save();
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  const color = '#4a5568';
  const padH = 10;
  const padV = 8;
  const stubExit = 4;

  const msHalf = (() => {
    // Должно совпадать с размером ромба из renderGanttBody
    const trackH = Math.max(4, Math.floor((st.rowHeight - st.taskPad * 2 - st.taskGap) / 2));
    const msSize = Math.min(Math.floor(st.rowHeight * 0.6), trackH + 4);
    return Math.floor(msSize / 2); // половина диагонали/смещения по X до вершины
  })();

  for (let toIdx = 0; toIdx < st.flatRows.length; toIdx++) {
    const targetRow = st.flatRows[toIdx];
    const targetNode = st.nodeIndex.get(targetRow.id);
    const deps = targetNode?.dependency || [];
    const targetTT = targetNode?.task_type ?? 'TT_Task';
    const targetIsMilestone = targetTT === 'TT_FinMile';
    if (!deps.length) continue;


    const t = barPixelsForRowIndex(st, toIdx);
    const tx0 = t.x0, tyTop = t.yTop, tyMid = t.yMid, tyBot = t.yBot;

    for (const dep of deps) {
      let fromIdx = st.rowIndexById.get(dep);
      if (fromIdx === undefined) fromIdx = st.rowIndexByWbs.get(dep);
      if (fromIdx === undefined) continue;

      const s = barPixelsForRowIndex(st, fromIdx);
      const sx1 = s.x1, syMid = s.yMid;

      const fromRow = st.flatRows[fromIdx];
      const fromNode = st.nodeIndex.get(fromRow.id);
      const fromTT = fromNode?.task_type ?? 'TT_Task';
      const fromIsMilestone = fromTT === 'TT_FinMile';

      const fromFinishMs = new Date((fromNode?.finish ?? fromRow.finish) + 'T00:00:00').getTime();
      const targetStartMs = new Date((targetNode?.start ?? targetRow.start) + 'T00:00:00').getTime();

      const targetBelow = toIdx > fromIdx;
      const yClear = targetBelow ? (tyTop - padV) : (tyBot + padV);
      const xL = tx0 - padH;
      const tx0Adj = targetIsMilestone ? (tx0 - msHalf) : tx0;      // вход в ЛЕВУЮ вершину ромба
      const xLAdj = targetIsMilestone ? (xL - msHalf) : xL;         // полка с учётом вершины
      const sx1Adj = fromIsMilestone ? (sx1 + msHalf) : sx1;        // выход из ПРАВОЙ вершины ромба

      ctx.strokeStyle = color;

      if (fromFinishMs >= targetStartMs) {
        // короткий маршрут
        const exitX = sx1Adj + stubExit;
        ctx.beginPath();
        ctx.moveTo(sx1Adj + 0.5, syMid + 0.5);
        ctx.lineTo(exitX + 0.5,  syMid + 0.5);
        ctx.lineTo(exitX + 0.5,  yClear + 0.5);
        ctx.lineTo(xLAdj + 0.5,   yClear + 0.5); 
        ctx.stroke();

      } else {
        // классический маршрут
        const gap = tx0Adj - sx1Adj;
        const entryLen = padH;              // tx0Adj - xLAdj
        const exitLen = Math.max(0, Math.min(gap - entryLen, gap));
        const xExit = sx1Adj + exitLen;

        ctx.beginPath();
        ctx.moveTo(sx1Adj + 0.5, syMid + 0.5);
        ctx.lineTo(xExit + 0.5,  syMid + 0.5);
        ctx.lineTo(xExit + 0.5,  yClear + 0.5);
        ctx.lineTo(xLAdj + 0.5,    yClear + 0.5);
        ctx.stroke();

        // вниз/вверх к центру цели
        ctx.beginPath();
        ctx.moveTo(xLAdj + 0.5, yClear + 0.5);
        ctx.lineTo(xLAdj + 0.5, tyMid  + 0.5);
        ctx.stroke();

        // вправо и вход в левую грань цели
        ctx.beginPath();
        ctx.moveTo(xLAdj + 0.5, tyMid + 0.5);
        ctx.lineTo(tx0Adj + 0.5, tyMid + 0.5);
        ctx.stroke();
        drawArrowhead(ctx, tx0Adj + 0.5, tyMid + 0.5, 'right', color);
      }

      // на всякий случай дублируем «вертикаль → вправо»
      ctx.beginPath();
      ctx.moveTo(xLAdj + 0.5, yClear + 0.5);
      ctx.lineTo(xLAdj + 0.5, tyMid  + 0.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(xLAdj + 0.5, tyMid + 0.5);
      ctx.lineTo(tx0Adj + 0.5, tyMid + 0.5);
      ctx.stroke();
      drawArrowhead(ctx, tx0Adj + 0.5, tyMid + 0.5, 'right', color);
    }
  }

  ctx.restore();
}

/** Превью протяжки связи и отрисовка единственного кружка при hover. */
function drawLinkPreviewAndHandles(ctx: CanvasRenderingContext2D, st: GanttPaintState) {
  // hover: показываем ПРАВЫЙ кружок, если не идёт протяжка
  if (st.linkMode === 'none' && st.hoverBarRow != null) {
    const row = st.hoverBarRow;
    const p   = barPixelsForRowIndex(st, row);
    const hideRight = st.hoverGanttHitMode === 'resize-finish';
    if (!hideRight) {
      const rc = rightHandleCenter(st, row);
      // Если ховер по milestone — смещаем стержень и кружок к правой вершине ромба
      const node = st.nodeIndex.get(st.flatRows[row].id);
      const isMs = (node?.task_type ?? 'TT_Task') === 'TT_FinMile';
      const msHalf = (() => {
        const trackH = Math.max(4, Math.floor((st.rowHeight - st.taskPad * 2 - st.taskGap) / 2));
        const msSize = Math.min(Math.floor(st.rowHeight * 0.6), trackH + 4);
        return Math.floor(msSize / 2);
      })();

      const barEdgeX = isMs ? (p.x1 + msHalf) : p.x1; // стержень из правой вершины ромба
      const rcX      = isMs ? (rc.x + msHalf) : rc.x;  // кружок тоже смещаем вправо на msHalf

      drawHandleWithStem(ctx, st, barEdgeX, rcX, rc.y, 'right', false);
    }
  }

  // drag: пунктир, кружки у источника/цели
  if (st.linkMode === 'drag' && st.linkSourceRow >= 0) {
    const src = barPixelsForRowIndex(st, st.linkSourceRow);
    const rc  = rightHandleCenter(st, st.linkSourceRow);
    // Источник: если milestone, выходим из правой вершины ромба
    const srcNode = st.nodeIndex.get(st.flatRows[st.linkSourceRow].id);
    const srcIsMs = (srcNode?.task_type ?? 'TT_Task') === 'TT_FinMile';
    const msHalfDragSrc = (() => {
      const trackH = Math.max(4, Math.floor((st.rowHeight - st.taskPad * 2 - st.taskGap) / 2));
      const msSize = Math.min(Math.floor(st.rowHeight * 0.6), trackH + 4);
      return Math.floor(msSize / 2);
    })();
    const srcXAnchor = srcIsMs ? (src.x1 + msHalfDragSrc) : src.x1;
    const rcXAnchor  = srcIsMs ? (rc.x + msHalfDragSrc)   : rc.x;

    drawHandleWithStem(ctx, st, srcXAnchor, rcXAnchor, rc.y, 'right', true);

    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.5;

    if (st.linkHoverTargetRow != null) {
      const t  = barPixelsForRowIndex(st, st.linkHoverTargetRow);
      const lc = leftHandleCenter(st, st.linkHoverTargetRow);
      const tx0 = t.x0, ty = t.yMid;
      // Цель: если milestone, входим в левую вершину ромба
      const targNode = st.nodeIndex.get(st.flatRows[st.linkHoverTargetRow].id);
      const targIsMs = (targNode?.task_type ?? 'TT_Task') === 'TT_FinMile';
      const msHalfDragTgt = (() => {
        const trackH = Math.max(4, Math.floor((st.rowHeight - st.taskPad * 2 - st.taskGap) / 2));
        const msSize = Math.min(Math.floor(st.rowHeight * 0.6), trackH + 4);
        return Math.floor(msSize / 2);
      })();
      const txEntry = targIsMs ? (tx0 - msHalfDragTgt) : tx0;

      const padH = 10, padV = 8;
      const targetBelow = st.linkHoverTargetRow > st.linkSourceRow;
      const yClear = targetBelow ? (t.yTop - padV) : (t.yBot + padV);
      const xL = txEntry - padH; // полка перед входом с учётом вершины ромба

      const gap = txEntry - srcXAnchor;
      const entryLen = padH;
      const exitLen = Math.max(0, Math.min(gap - entryLen, gap));
      const xExit = srcXAnchor + exitLen;

      ctx.beginPath();
      ctx.moveTo(srcXAnchor + 0.5, src.yMid + 0.5);
      ctx.lineTo(xExit + 0.5,      src.yMid + 0.5);
      ctx.lineTo(xExit + 0.5,      yClear   + 0.5);
      ctx.lineTo(xL + 0.5,         yClear   + 0.5);
      ctx.lineTo(xL + 0.5,         ty       + 0.5);
      ctx.lineTo(txEntry + 0.5,    ty       + 0.5);
      ctx.stroke();

      drawHandleWithStem(ctx, st, txEntry, lc.x, lc.y, 'left', true);
    } else {
      // свободная протяжка: штырёк вправо → вертикаль → горизонталь к мыши
      const xExit = srcXAnchor + 8;
      ctx.beginPath();
      ctx.moveTo(srcXAnchor + 0.5, src.yMid + 0.5);
      ctx.lineTo(xExit + 0.5,  src.yMid + 0.5);
      ctx.lineTo(xExit + 0.5,  st.linkMouseY + 0.5);
      ctx.lineTo(st.linkMouseX + 0.5, st.linkMouseY + 0.5);
      ctx.stroke();
    }

    ctx.restore();
  }
}
