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
  refLines: RefLine[]; // можно []

  // Геометрия/виртуализация
  headerHeight: number;   // напр. 36
  rowHeight: number;      // напр. 28
  visibleStartIndex: number; // включительно
  visibleEndIndex: number;   // включительно

  // Временная шкала
  ganttPxPerDay: number;
  ganttStartMs: number;
  ganttEndMs: number;
  ganttScale: GanttScale;

  // Внешний вид
  font: string;        // '12px system-ui,...'
  headerFont: string;  // '600 12px system-ui,...'
  gridColor: string;   // '#e6e6e6'
  textColor: string;   // '#000'
  headerBg: string;    // '#f5f7fb'
  headerBorder: string;// '#dcdfe6'

  // Цвета баров
  colorOf: (name: BarColorName) => string;
  rgba: (hex: string, a: number) => string;

  // Визуальные параметры задач
  summaryThick: number; // толщина summary по центру строки
  taskPad: number;      // вертикальный отступ от краёв строки
  taskGap: number;      // зазор между actual и baseline

  // Hover / линкование (только для ВИДИМОСТИ в отрисовке)
  hoverBarRow: number | null;
  hoverGanttHitMode: 'move' | 'resize-start' | 'resize-finish' | null;
  linkMode: 'none' | 'drag';
  linkSourceRow: number;               // -1 если нет
  linkStartX: number; linkStartY: number;
  linkMouseX: number; linkMouseY: number;
  linkHoverTargetRow: number | null;
  linkHandleR: number;                 // радиус кружка
  linkHandleGap: number;               // зазор от бара до кружка

  // Прогресс строки [0..1]
  rowProgress01: (rowIndex: number) => number;
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

  const width  = parseInt(canvas.style.width, 10)  || canvas.width;
  const height = parseInt(canvas.style.height, 10) || canvas.height;
  const strokeBlack = '#000';

  ctx.clearRect(0, 0, width, height);

  // сетка по времени
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
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
    cur = nextUnitStart(cur, gridUnit);
  }

  // горизонтальные разделители строк
  ctx.strokeStyle = st.gridColor;
  for (let i = st.visibleStartIndex; i <= st.visibleEndIndex; i++) {
    const y = i * st.rowHeight;
    ctx.beginPath();
    ctx.moveTo(0, y + st.rowHeight + 0.5);
    ctx.lineTo(width, y + st.rowHeight + 0.5);
    ctx.stroke();
  }

  // хелпер закруглённого прямоугольника
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

  // бары задач
  for (let i = st.visibleStartIndex; i <= st.visibleEndIndex; i++) {
    const row = st.flatRows[i];
    const node = st.nodeIndex.get(row.id);
    // фактические даты
    const startStr  = node?.start  ?? row.start;
    const finishStr = node?.finish ?? row.finish;
    const s = new Date(startStr  + 'T00:00:00').getTime();
    const f = new Date(finishStr + 'T00:00:00').getTime();
    const x0 = Math.round(msToX(st, s));
    const x1 = Math.round(msToX(st, f));
    const w  = Math.max(3, x1 - x0);

    // baseline (если есть)
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

    // геометрия дорожек
    const rowTop = i * st.rowHeight;
    const pad    = st.taskPad;
    const gap    = st.taskGap;
    const trackH = Math.max(4, Math.floor((st.rowHeight - pad * 2 - gap) / 2));

    if (row.hasChildren) {
      // summary-бар по центру строки, «кепки»
      const groupFill = st.colorOf('group');
      const yc   = rowTop + st.rowHeight / 2;
      const thick = st.summaryThick;
      const capMax = 8;
      const cap = Math.min(capMax, Math.floor(w / 2));
      const yTop = Math.round(yc - thick / 2) + 0.5;
      const yBot = Math.round(yc + thick / 2) + 0.5;
      const coreX0 = x0 + cap;
      const coreX1 = x1 - cap;

      ctx.save();
      if (coreX1 > coreX0) {
        ctx.fillStyle = groupFill;
        ctx.fillRect(coreX0, yTop - 0.5, coreX1 - coreX0, (yBot - yTop) + 1);
      }
      // левая «кепка»
      ctx.beginPath();
      ctx.moveTo(x0, yBot);
      ctx.lineTo(coreX0, yBot);
      ctx.lineTo(x0, yBot + cap);
      ctx.closePath();
      ctx.fillStyle = groupFill; ctx.fill();
      ctx.strokeStyle = strokeBlack; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0, yBot); ctx.lineTo(x0, yBot + cap);
      ctx.moveTo(x0, yBot + cap); ctx.lineTo(coreX0, yBot);
      ctx.stroke();
      // правая «кепка»
      ctx.beginPath();
      ctx.moveTo(x1, yBot);
      ctx.lineTo(coreX1, yBot);
      ctx.lineTo(x1, yBot + cap);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      // верх/низ сплошняк
      ctx.fillStyle = groupFill;
      ctx.fillRect(x0, yTop - 0.5, Math.max(0, coreX0 - x0), (yBot - yTop) + 1);
      ctx.fillRect(coreX1, yTop - 0.5, Math.max(0, x1 - coreX1), (yBot - yTop) + 1);
      ctx.strokeStyle = strokeBlack;
      ctx.beginPath();
      ctx.moveTo(x0, yTop); ctx.lineTo(x1, yTop);
      ctx.moveTo(coreX0 - 1, yBot); ctx.lineTo(coreX1 + 1, yBot);
      ctx.moveTo(x0, yTop); ctx.lineTo(x0, yBot);
      ctx.moveTo(x1, yTop); ctx.lineTo(x1, yBot);
      ctx.stroke();
      ctx.restore();

    } else {
      const isCritical = !!(node?.critical);
      const actualColor = isCritical ? st.colorOf('criticalpatch') : st.colorOf('actual');
      const actualBase  = st.rgba(actualColor, 0.35);

      if (hasBaseline) {
        // baseline — нижняя дорожка
        const baselineColor = st.colorOf('baseline');
        ctx.save();
        rr(bx0, rowTop + pad + trackH + gap, bw, trackH, 1);
        ctx.fillStyle = st.rgba(baselineColor, 1);
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = strokeBlack;
        ctx.stroke();
        ctx.restore();

        // actual — верхняя дорожка с прогрессом
        const prog = st.rowProgress01(i);
        const pw = Math.max(0, Math.round(w * prog));

        ctx.save();
        rr(x0, rowTop + pad, w, trackH, 1);
        ctx.clip();
        // остаток
        ctx.fillStyle = actualBase;
        ctx.fillRect(x0, rowTop + pad, w, trackH);
        // прогресс
        ctx.fillStyle = actualColor;
        if (pw > 0) ctx.fillRect(x0, rowTop + pad, pw, trackH);
        ctx.restore();

        ctx.save();
        rr(x0, rowTop + pad, w, trackH, 1);
        ctx.strokeStyle = strokeBlack;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();

      } else {
        // прямоугольник на всю высоту за вычетом отступов
        const y = rowTop + 6;
        const h = st.rowHeight - 12;
        const prog = st.rowProgress01(i);
        const cw = Math.max(0, Math.round(w * prog));

        ctx.save();
        ctx.strokeStyle = strokeBlack;
        ctx.lineWidth = 1;

        // контур
        ctx.beginPath();
        ctx.moveTo(x0 + 1, y);
        ctx.lineTo(x0 + w - 1, y);
        ctx.quadraticCurveTo(x0 + w, y, x0 + w, y + 1);
        ctx.lineTo(x0 + w, y + h - 1);
        ctx.quadraticCurveTo(x0 + w, y + h, x0 + w - 1, y + h);
        ctx.lineTo(x0 + 1, y + h);
        ctx.quadraticCurveTo(x0, y + h, x0, y + h - 1);
        ctx.lineTo(x0, y + 1);
        ctx.quadraticCurveTo(x0, y, x0 + 1, y);
        ctx.closePath();

        // заливки
        ctx.save();
        ctx.clip();
        ctx.fillStyle = actualBase; // остаток
        ctx.fillRect(x0, y, w, h);
        ctx.fillStyle = actualColor; // прогресс
        if (cw > 0) ctx.fillRect(x0, y, cw, h);
        ctx.restore();

        // обводка
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  // референс-линии
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
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
      ctx.restore();
    }
  }

  // зависимости и превью линков + кружки-хэндлы
  drawDependencies(ctx, st);
  drawLinkPreviewAndHandles(ctx, st);
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

  for (let toIdx = 0; toIdx < st.flatRows.length; toIdx++) {
    const targetRow = st.flatRows[toIdx];
    const targetNode = st.nodeIndex.get(targetRow.id);
    const deps = targetNode?.dependency || [];
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
      const fromFinishMs = new Date((fromNode?.finish ?? fromRow.finish) + 'T00:00:00').getTime();
      const targetStartMs = new Date((targetNode?.start ?? targetRow.start) + 'T00:00:00').getTime();

      const targetBelow = toIdx > fromIdx;
      const yClear = targetBelow ? (tyTop - padV) : (tyBot + padV);
      const xL = tx0 - padH;

      ctx.strokeStyle = color;

      if (fromFinishMs >= targetStartMs) {
        // короткий маршрут
        const exitX = sx1 + stubExit;
        ctx.beginPath();
        ctx.moveTo(sx1 + 0.5, syMid + 0.5);
        ctx.lineTo(exitX + 0.5, syMid + 0.5);
        ctx.lineTo(exitX + 0.5, yClear + 0.5);
        ctx.lineTo(xL + 0.5,   yClear + 0.5);
        ctx.stroke();
      } else {
        // классический маршрут
        const gap = tx0 - sx1;
        const entryLen = padH;              // tx0 - xL
        const exitLen = Math.max(0, Math.min(gap - entryLen, gap));
        const xExit = sx1 + exitLen;

        ctx.beginPath();
        ctx.moveTo(sx1 + 0.5, syMid + 0.5);
        ctx.lineTo(xExit + 0.5, syMid + 0.5);
        ctx.lineTo(xExit + 0.5, yClear + 0.5);
        ctx.lineTo(xL + 0.5,    yClear + 0.5);
        ctx.stroke();

        // вниз/вверх к центру цели
        ctx.beginPath();
        ctx.moveTo(xL + 0.5, yClear + 0.5);
        ctx.lineTo(xL + 0.5, tyMid  + 0.5);
        ctx.stroke();

        // вправо и вход в левую грань цели
        ctx.beginPath();
        ctx.moveTo(xL + 0.5, tyMid + 0.5);
        ctx.lineTo(tx0 + 0.5, tyMid + 0.5);
        ctx.stroke();

        drawArrowhead(ctx, tx0 + 0.5, tyMid + 0.5, 'right', color);
      }

      // на всякий случай дублируем «вертикаль → вправо»
      ctx.beginPath();
      ctx.moveTo(xL + 0.5, yClear + 0.5);
      ctx.lineTo(xL + 0.5, tyMid  + 0.5);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(xL + 0.5, tyMid + 0.5);
      ctx.lineTo(tx0 + 0.5, tyMid + 0.5);
      ctx.stroke();

      drawArrowhead(ctx, tx0 + 0.5, tyMid + 0.5, 'right', color);
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
      drawHandleWithStem(ctx, st, p.x1, rc.x, rc.y, 'right', false);
    }
  }

  // drag: пунктир, кружки у источника/цели
  if (st.linkMode === 'drag' && st.linkSourceRow >= 0) {
    const src = barPixelsForRowIndex(st, st.linkSourceRow);
    const rc  = rightHandleCenter(st, st.linkSourceRow);

    drawHandleWithStem(ctx, st, src.x1, rc.x, rc.y, 'right', true);

    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.5;

    if (st.linkHoverTargetRow != null) {
      const t  = barPixelsForRowIndex(st, st.linkHoverTargetRow);
      const lc = leftHandleCenter(st, st.linkHoverTargetRow);
      const tx0 = t.x0, ty = t.yMid;
      const padH = 10, padV = 8;
      const targetBelow = st.linkHoverTargetRow > st.linkSourceRow;
      const yClear = targetBelow ? (t.yTop - padV) : (t.yBot + padV);
      const xL = tx0 - padH;

      const gap = tx0 - src.x1;
      const entryLen = padH;
      const exitLen = Math.max(0, Math.min(gap - entryLen, gap));
      const xExit = src.x1 + exitLen;

      ctx.beginPath();
      ctx.moveTo(src.x1 + 0.5, src.yMid + 0.5);
      ctx.lineTo(xExit + 0.5,  src.yMid + 0.5);
      ctx.lineTo(xExit + 0.5,  yClear   + 0.5);
      ctx.lineTo(xL + 0.5,     yClear   + 0.5);
      ctx.lineTo(xL + 0.5,     ty       + 0.5);
      ctx.lineTo(tx0 + 0.5,    ty       + 0.5);
      ctx.stroke();

      drawHandleWithStem(ctx, st, t.x0, lc.x, lc.y, 'left', true);
    } else {
      // свободная протяжка: штырёк вправо → вертикаль → горизонталь к мыши
      const xExit = src.x1 + 8;
      ctx.beginPath();
      ctx.moveTo(src.x1 + 0.5, src.yMid + 0.5);
      ctx.lineTo(xExit + 0.5,  src.yMid + 0.5);
      ctx.lineTo(xExit + 0.5,  st.linkMouseY + 0.5);
      ctx.lineTo(st.linkMouseX + 0.5, st.linkMouseY + 0.5);
      ctx.stroke();
    }

    ctx.restore();
  }
}
