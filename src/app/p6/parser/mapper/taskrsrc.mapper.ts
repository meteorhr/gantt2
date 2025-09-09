// parser/mapper/taskrsrc.mapper.ts
import type { P6Scalar } from '../parser.types';

/* ===== helpers ===== */
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
function yn(v: string | null): 'Y' | 'N' | null {
  if (v == null || v === '') return null;
  const s = v.trim().toLowerCase();
  if (s === 'y' || s === 'yes' || s === 'true' || s === '1') return 'Y';
  if (s === 'n' || s === 'no' || s === 'false' || s === '0') return 'N';
  return null;
}
function mapRsrcType(v: string | null): string | null {
  if (!v) return null;
  const s = v.trim().toLowerCase();
  if (s.startsWith('lab')) return 'RT_Labor';
  if (s.startsWith('non')) return 'RT_NonLabor';
  if (s.startsWith('mat')) return 'RT_Material';
  return v; // как есть, если что-то экзотическое
}
/** FNV-1a 32-bit → положительное число для синтетического PK */
function hash32ToNum(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) >>> 0) + ((h << 4) >>> 0) + ((h << 7) >>> 0) + ((h << 8) >>> 0) + ((h << 24) >>> 0)) >>> 0;
  }
  return h >>> 0;
}
function sumNullable(a: number | null, b: number | null): number | null {
  if (a == null && b == null) return null;
  return (a ?? 0) + (b ?? 0);
}
function clampPct(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return x < 0 ? 0 : x > 100 ? 100 : x;
}

/* ===== mapper ===== */
export function mapResAssignToTaskrsrcRow(
  ra: Element,
  projId: number
): Record<string, P6Scalar> | null {
  const taskId = numAny(ra, ['ActivityObjectId']);
  const rsrcId = numAny(ra, ['ResourceObjectId']);
  const roleId = numAny(ra, ['RoleObjectId']);

  // обязательные по модели
  if (!Number.isFinite(projId) || !Number.isFinite(taskId as number)) {
    console.warn('[P6-XML] TASKRSRC пропущен (нет proj_id/task_id)', { projId, taskId });
    return null;
  }

  // PK: берём <ObjectId>, иначе синтетический числовой
  const objId = numAny(ra, ['ObjectId']);
  const taskrsrc_id: number = Number.isFinite(objId as number)
    ? (objId as number)
    : hash32ToNum(`${projId}|${taskId}|${rsrcId ?? ''}|${roleId ?? ''}`);

  // тип/флаги/источники
  const rsrcTypeTxt = txtAny(ra, ['ResourceType', 'Type']);
  const rateType    = txtAny(ra, ['RateType']);
  const cpqSrcType  = txtAny(ra, ['CostPerQtySourceType', 'CostPerQtySrcType']);
  const linkFlag    = txtAny(ra, ['CalculateCostsFromUnits', 'CostQtyLinkFlag']);

  // нагрузки/стоимости
  const remain_qty        = numAny(ra, ['RemainingUnits']);
  const target_qty        = numAny(ra, ['BudgetedUnits', 'TargetUnits']);
  const remain_qty_per_hr = numAny(ra, ['RemainingUnitsPerTime']);
  const target_qty_per_hr = numAny(ra, ['BudgetedUnitsPerTime', 'TargetUnitsPerTime']);

  const act_reg_qty = numAny(ra, ['ActualRegularUnits', 'ActRegularUnits']);
  const act_ot_qty  = numAny(ra, ['ActualOvertimeUnits', 'ActOvertimeUnits']);

  const cost_per_qty = numAny(ra, ['Rate', 'CostPerQty']); // цена за ед./час
  let target_cost  = numAny(ra, ['BudgetedCost', 'TargetCost']);
  // если target_cost отсутствует, считаем из единиц и ставки
  if (target_cost == null && target_qty != null && cost_per_qty != null) {
    target_cost = target_qty * cost_per_qty;
  }
  const remain_cost  = numAny(ra, ['RemainingCost']);
  const act_reg_cost = numAny(ra, ['ActualRegularCost', 'ActRegularCost']);
  const act_ot_cost  = numAny(ra, ['ActualOvertimeCost', 'ActOvertimeCost']);
  const act_cost_any = numAny(ra, ['ActualCost', 'ActCost']);

  // агрегаты
  const act_qty  = sumNullable(act_reg_qty, act_ot_qty);                // всего факт-единиц
  const act_cost = (act_reg_cost != null || act_ot_cost != null)
    ? sumNullable(act_reg_cost, act_ot_cost)
    : (act_cost_any ?? null);             // всего факт-стоимость
  const progress_cost_pct = (target_cost != null && target_cost > 0 && act_cost != null)
    ? clampPct((act_cost / target_cost) * 100)
    : null;

  // даты
  const act_start_date      = dtAny(ra, ['ActualStartDate']);
  const act_end_date        = dtAny(ra, ['ActualFinishDate']);
  const restart_date        = dtAny(ra, ['RestartDate']);
  const reend_date          = dtAny(ra, ['ReEndDate']);
  const target_start_date   = dtAny(ra, ['PlannedStartDate', 'TargetStartDate']);
  const target_end_date     = dtAny(ra, ['PlannedFinishDate', 'TargetFinishDate']);
  const rem_late_start_date = dtAny(ra, ['RemainingLateStartDate']);
  const rem_late_end_date   = dtAny(ra, ['RemainingLateFinishDate']);

  // прочее
  const pobs_id    = numAny(ra, ['OBSObjectId', 'ResponsibleManagerObjectId']);
  const skill      = numAny(ra, ['Proficiency', 'ProficiencyLevel', 'SkillLevel']);
  const relag      = numAny(ra, ['RelagDrtnHrCnt', 'RelagDuration', 'Relag']);
  const guid       = txtAny(ra, ['GUID', 'Guid']);
  const curv_id    = numAny(ra, ['CurveObjectId', 'SpreadCurveObjectId']);
  const unit_id    = numAny(ra, ['UnitOfMeasureObjectId', 'UOMObjectId', 'UnitObjectId']);
  const curr_id    = numAny(ra, ['CurrencyObjectId', 'CurrObjectId']);
  const create_user= txtAny(ra, ['CreateUser', 'CreateBy', 'AddByName']);
  const create_date= dtAny(ra, ['CreateDate', 'AddDate', 'DateCreated']);
  const hasHours   = txtAny(ra, ['HasRsrcHours', 'HasRsrchours']);
  const sum_id     = numAny(ra, ['TaskRsrcSumObjectId', 'TaskRsrcSummaryObjectId']);

  return {
    // обязательные
    taskrsrc_id,
    task_id: taskId as number,
    proj_id: projId,

    // связки
    rsrc_id: Number.isFinite(rsrcId as number) ? (rsrcId as number) : null,
    role_id: Number.isFinite(roleId as number) ? (roleId as number) : null,

    // флаги/типы
    cost_qty_link_flag: yn(linkFlag),
    rsrc_type: mapRsrcType(rsrcTypeTxt),
    rate_type: rateType ? rateType.toString().toUpperCase() : null,
    cost_per_qty_source_type: cpqSrcType ?? null,

    // нагрузки
    remain_qty,
    target_qty,
    remain_qty_per_hr,
    target_qty_per_hr,
    act_reg_qty,
    act_ot_qty,

    // стоимость
    cost_per_qty,
    target_cost,
    act_cost,
    remain_cost,
    act_reg_cost,
    act_ot_cost,
    // агрегаты/удобные поля
    act_qty,
    progress_cost_pct,

    // даты
    act_start_date,
    act_end_date,
    restart_date,
    reend_date,
    target_start_date,
    target_end_date,
    rem_late_start_date,
    rem_late_end_date,

    // прочее
    pobs_id,
    skill_level: skill,
    relag_drtn_hr_cnt: relag,
    guid: guid ?? null,
    curv_id,
    unit_id,
    curr_id,
    create_user: create_user ?? null,
    create_date,
    has_rsrchours: yn(hasHours),
    taskrsrc_sum_id: sum_id,
  };
}
