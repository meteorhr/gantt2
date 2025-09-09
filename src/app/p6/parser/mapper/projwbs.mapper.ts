// parser/mapper/wbs.mapper.ts
import type { P6Scalar } from '../parser.types';
// Если у вас есть общий тип P6YesNo = 'Y'|'N', можно импортнуть и
// заменить возвращаемые строки на этот тип.

//
// ---------- helpers ----------
function txt(el: Element, tag: string): string {
  const n = el.getElementsByTagName(tag)[0];
  return n?.textContent?.trim() ?? '';
}
function txtAny(el: Element, ...tags: string[]): string {
  for (const t of tags) {
    const v = txt(el, t);
    if (v) return v;
  }
  return '';
}
function num(el: Element, tag: string): number | null {
  const s = txt(el, tag);
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function numAny(el: Element, ...tags: string[]): number | null {
  for (const t of tags) {
    const v = num(el, t);
    if (v !== null) return v;
  }
  return null;
}
function dt(el: Element, tag: string): Date | null {
  const s = txt(el, tag);
  if (!s) return null;
  const iso = s.includes('T') ? s : s.length === 10 ? `${s}T00:00:00` : s.replace(' ', 'T');
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}
function dtAny(el: Element, ...tags: string[]): Date | null {
  for (const t of tags) {
    const v = dt(el, t);
    if (v) return v;
  }
  return null;
}
function yn(raw: string | null | undefined): 'Y' | 'N' {
  const s = (raw ?? '').trim().toLowerCase();
  if (['y','yes','true','1'].includes(s)) return 'Y';
  if (['n','no','false','0'].includes(s)) return 'N';
  // пустое значение считаем "N"
  return 'N';
}

// ---------- status: text → code (как в task.mapper) ----------
const DICT_STATUS_CODE = {
  TK_NotStart: 'Not Started',
  TK_Active: 'In Progress',
  TK_Suspend: 'Suspended',
  TK_Complete: 'Completed',
  TK_Inactive: 'Inactive',
} as const;

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}
const REV_STATUS_CODE = new Map<string, string>([
  ...Object.entries(DICT_STATUS_CODE).map(([code, label]) => [norm(label), code] as const),
  ['not started','TK_NotStart'],
  ['in progress','TK_Active'],
  ['active','TK_Active'],
  ['suspended','TK_Suspend'],
  ['completed','TK_Complete'],
  ['complete','TK_Complete'],
  ['inactive','TK_Inactive'],
]);
function toStatusCode(value: string | null | undefined): string | null {
  if (!value) return null;
  return REV_STATUS_CODE.get(norm(value)) ?? null;
}

/**
 * Преобразовать узел <WBS> в строку PROJWBS.
 * @param w узел <WBS>
 * @param projId числовой ObjectId проекта (PK проекта)
 */
export function mapWbsToProjwbsRow(w: Element, projId: number): Record<string, P6Scalar> {
  // PK
  const wbsId = numAny(w, 'ObjectId', 'WBSObjectId'); // основной — ObjectId
  if (wbsId == null) {
    throw new Error('WBS row has no ObjectId — cannot build primary key wbs_id');
  }

  // флаги (поддерживаем разные возможные теги)
  const projNodeFlag = yn(txtAny(w, 'ProjectNode', 'ProjectNodeFlag', 'IsProjectNode', 'ProjNodeFlag'));
  const sumDataFlag  = yn(txtAny(w, 'ContainsSummaryData', 'SumDataFlag', 'ContainsSummary', 'SumData'));

  // статус: текст → код TK_*
  const statusTxt  = txtAny(w, 'Status', 'WBSStatus', 'ProjectStatus');
  const statusCode = toStatusCode(statusTxt);

  const row: Record<string, P6Scalar> = {
    // --- ключи и иерархия ---
    wbs_id: wbsId,
    parent_wbs_id: numAny(w, 'ParentObjectId', 'ParentWBSObjectId'),
    proj_id: Number.isFinite(projId) ? projId : null,

    // --- наименования и коды ---
    wbs_name: txtAny(w, 'Name') || null,
    wbs_short_name: txtAny(w, 'Code', 'Id') || null,
    seq_num: numAny(w, 'SequenceNumber'),
    proj_node_flag: projNodeFlag,
    sum_data_flag: sumDataFlag,

    // --- статус/ревьюер/категории/OBS ---
    status_code: statusCode,
    status_reviewer: txtAny(w, 'UserReviewingStatus', 'ReviewerStatus') || null,
    phase_id: numAny(w, 'CategoryObjectId', 'WBSCategoryObjectId'),
    obs_id: numAny(w, 'ResponsibleManagerObjectId', 'OBSObjectId'),

    // --- веса/идентификаторы ---
    est_wt: numAny(w, 'EstimatedWeight', 'EstWeight'),
    guid: txtAny(w, 'GUID', 'Guid') || null,
    tmpl_guid: txtAny(w, 'MethodologyGUID', 'MethodologyGuid', 'TemplateGUID', 'TemplateGuid') || null,

    // --- даты ожиданий ---
    anticip_start_date: dtAny(w, 'AnticipatedStartDate', 'AnticipatedStart') || null,
    anticip_end_date: dtAny(w, 'AnticipatedFinishDate', 'AnticipatedFinish', 'AnticipatedEndDate') || null,

    // --- стоимости/ETC/EV ---
    orig_cost: numAny(w, 'OriginalBudget', 'OriginalBudgetCost'),
    indep_remain_total_cost: numAny(w, 'IndependentETCTotalCost', 'IndETCTotalCost'),
    indep_remain_work_qty: numAny(w, 'IndependentETCLaborUnits', 'IndETCLaborUnits'),
    ann_dscnt_rate_pct: numAny(w, 'AnnualDiscountRate', 'AnnualDiscountRatePct'),
    // эти поля в разных выгрузках бывают текстовыми — оставляем текст как есть
    dscnt_period_type: txtAny(w, 'DiscountApplicationPeriod', 'DiscountPeriodType') || null,
    ev_compute_type: txtAny(w, 'EVPercentCompleteTechnique', 'EarnedValuePercentCompleteTechnique') || null,
    ev_etc_compute_type: txtAny(w, 'EVETCTechnique', 'EarnedValueETCTechnique') || null,
    ev_etc_user_value: numAny(w, 'EVETCPerformanceFactor', 'EarnedValuePerformanceFactor'),
    ev_user_pct: numAny(w, 'EVPercentComplete', 'EarnedValuePercentComplete'),
  };

  return row;
}