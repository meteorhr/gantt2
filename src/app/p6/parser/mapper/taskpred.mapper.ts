// parser/mapper/taskpred.mapper.ts
import type { P6Scalar } from '../parser.types';

/* ----------------- helpers ----------------- */
function txt(el: Element, tag: string): string {
  const n = el.getElementsByTagName(tag)[0];
  return n?.textContent?.trim() ?? '';
}
function num(el: Element, tag: string): number | null {
  const s = txt(el, tag);
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function dt(el: Element, tag: string): Date | null {
  const s = txt(el, tag);
  if (!s) return null;
  const iso = s.includes('T') ? s : s.length === 10 ? `${s}T00:00:00` : s.replace(' ', 'T');
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}
function norm(s: string) { return s.trim().toLowerCase().replace(/\s+/g, ' '); }
function numAny(el: Element, tags: string[]): number | null {
  for (const t of tags) {
    const v = num(el, t);
    if (v !== null) return v;
  }
  return null;
}
function txtAny(el: Element, tags: string[]): string | null {
  for (const t of tags) {
    const v = txt(el, t);
    if (v) return v;
  }
  return null;
}
function dtAny(el: Element, tags: string[]): Date | null {
  for (const t of tags) {
    const v = dt(el, t);
    if (v) return v;
  }
  return null;
}
function normUnits(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = v.trim().toLowerCase();
  if (['h', 'hr', 'hrs', 'hour', 'hours'].includes(s)) return 'HOURS';
  if (['d', 'day', 'days'].includes(s)) return 'DAYS';
  if (['w', 'wk', 'wks', 'week', 'weeks'].includes(s)) return 'WEEKS';
  if (['mo', 'mon', 'mons', 'month', 'months'].includes(s)) return 'MONTHS';
  return s.toUpperCase();
}
function flag10(v: boolean | null): 1 | 0 | null { return v == null ? null : (v ? 1 : 0); }

/** Type (текст/аббревиатуры) → XER-код PR_* */
function toPredTypeCode(v: string | null | undefined): string | null {
  if (!v) return null;
  const m = new Map<string, string>([
    ['fs', 'PR_FS'], ['finish to start', 'PR_FS'], ['finish-to-start', 'PR_FS'],
    ['ss', 'PR_SS'], ['start to start', 'PR_SS'],   ['start-to-start', 'PR_SS'],
    ['ff', 'PR_FF'], ['finish to finish', 'PR_FF'], ['finish-to-finish', 'PR_FF'],
    ['sf', 'PR_SF'], ['start to finish', 'PR_SF'],  ['start-to-finish', 'PR_SF'],
  ]);
  return m.get(norm(v)) ?? null;
}

/** FNV-1a 32-bit → положительное число для синтетического PK */
function hash32ToNum(s: string): number {
  let h = 0x811c9dc5; // offset basis
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    // h *= 16777619 (без переполнения)
    h = (h + ((h << 1) >>> 0) + ((h << 4) >>> 0) + ((h << 7) >>> 0) + ((h << 8) >>> 0) + ((h << 24) >>> 0)) >>> 0;
  }
  // вернуть как безопасный int
  return h >>> 0; // 0..2^32-1
}

/* ----------------- mapper ----------------- */
/**
 * <PredecessorLink> → TaskPredRow-совместимый объект.
 * Обязательны оба конца связи (successor & predecessor).
 * PK: <ObjectId> или синтетический числовой хеш.
 */
export function mapPredLinkToTaskpredRow(
  linkEl: Element,
  projId: number,
  fallbackSuccessorId?: number | null
): Record<string, P6Scalar> | null {
  // концы связи
  const task_id = numAny(linkEl, ['SuccessorActivityObjectId']) ??
    (Number.isFinite(fallbackSuccessorId as number) ? (fallbackSuccessorId as number) : null);
  const pred_task_id = numAny(linkEl, ['PredecessorActivityObjectId']);

  if (!Number.isFinite(task_id as number) || !Number.isFinite(pred_task_id as number)) {
    console.warn('[P6-XML] TASKPRED пропущен (нет successor/pred)', { task_id, pred_task_id });
    return null;
  }

  // тип и лаг
  const typeTxt = txtAny(linkEl, ['Type', 'RelationshipType']);
  const pred_type = toPredTypeCode(typeTxt) ?? (typeTxt || null);
  const lag_hr_cnt = numAny(linkEl, ['Lag', 'LagDuration']);
  const lag_units_raw = txtAny(linkEl, ['LagUnits', 'LagUnit', 'DurationUnits']);
  const lag_units = normUnits(lag_units_raw);
  const lag_raw = txtAny(linkEl, ['Lag', 'LagDuration']);

  // проекты (на случай межпроектных связей)
  const succ_proj = numAny(linkEl, ['SuccessorProjectObjectId']);
  const pred_proj = numAny(linkEl, ['PredecessorProjectObjectId']);
  const successor_code = txtAny(linkEl, ['SuccessorActivityId', 'SuccessorActivityCode', 'SuccessorId']);
  const predecessor_code = txtAny(linkEl, ['PredecessorActivityId', 'PredecessorActivityCode', 'PredecessorId']);

  // доп. атрибуты, если встречаются в экспорте
  const comments   = txtAny(linkEl, ['Comments', 'Comment', 'Notes', 'Note']);
  const float_path = txtAny(linkEl, ['FloatPath']);

  // в некоторых кастомных экспортах встречаются теги ранних/поздних дат для связи
  const arefDate = dtAny(linkEl, ['RelationshipEarlyFinish', 'RelEarlyFinish', 'AREF']);
  const arlsDate = dtAny(linkEl, ['RelationshipLateStart',   'RelLateStart',   'ARLS']);

  // PK
  const objId = numAny(linkEl, ['ObjectId']);
  const task_pred_id: number = Number.isFinite(objId as number)
    ? (objId as number)
    : hash32ToNum(`${task_id}|${pred_task_id}|${pred_type ?? 'UNK'}|${lag_hr_cnt ?? 0}|${succ_proj ?? ''}|${pred_proj ?? ''}`);

  const resolvedSuccProjId = Number.isFinite(succ_proj as number) ? (succ_proj as number) : (Number.isFinite(projId) ? projId : null);
  const isExternal = (Number.isFinite(pred_proj as number) && Number.isFinite(resolvedSuccProjId as number))
    ? ((pred_proj as number) !== (resolvedSuccProjId as number))
    : null;

  // формируем строго по TaskPredRow
  return {
    task_pred_id,
    task_id: task_id as number,
    proj_id: Number.isFinite(succ_proj as number) ? (succ_proj as number) : (Number.isFinite(projId) ? projId : (null as any)), // proj_id обязателен по модели
    pred_task_id: pred_task_id as number,
    pred_proj_id: Number.isFinite(pred_proj as number) ? (pred_proj as number) : null,
    successor_code: successor_code ?? null,
    predecessor_code: predecessor_code ?? null,
    pred_type,
    lag_hr_cnt: lag_hr_cnt ?? null,
    lag_raw: lag_raw ?? null,
    lag_units: lag_units ?? null,
    comments: comments ?? null,
    float_path: float_path ?? null,
    is_external_link: flag10(isExternal),
    aref: arefDate ?? null,
    arls: arlsDate ?? null,
  };
}
