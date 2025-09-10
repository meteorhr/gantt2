// parser/mapper/taskrsrc.mapper.ts
import { TASKRSRCRow } from '../../models/taskrsrc.model';
import type { P6Scalar } from '../parser.types';

export interface XmlLookupMaps {
  actObjId_to_taskId: Map<number, number>;   // Activity.ObjectId -> TASK.task_id
  actObjId_to_projId: Map<number, number>;   // Activity.ObjectId -> PROJECT.proj_id
  resObjId_to_rsrcId: Map<number, number>;   // Resource.ObjectId -> RSRC.rsrc_id
  roleObjId_to_roleId: Map<number, number>;  // Role.ObjectId -> RSRCROLE.role_id (если ведёте)
}

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

/* ===== internal guards ===== */
function isMaps(arg: XmlLookupMaps | number): arg is XmlLookupMaps {
  return typeof arg === 'object'
    && arg !== null
    && 'actObjId_to_taskId' in arg
    && 'actObjId_to_projId' in arg;
}

/* ===== mapper ===== */
/**
 * Новый API (рекомендовано):
 *   mapResAssignToTaskrsrcRow(ra, maps, fallbackProjId?)
 *   - task_id / proj_id / rsrc_id / role_id резолвятся через XmlLookupMaps.
 *
 * Обратная совместимость (deprecated):
 *   mapResAssignToTaskrsrcRow(ra, projId)
 *   - proj_id берётся как есть, task_id = ActivityObjectId (что неверно для PK, но сохраняем поведение).
 */
export function mapResAssignToTaskrsrcRow(
  ra: Element,
  maps: XmlLookupMaps,
  fallbackProjId?: number
): Record<string, P6Scalar> | null;
export function mapResAssignToTaskrsrcRow(
  ra: Element,
  projId: number
): Record<string, P6Scalar> | null;
// реализация
export function mapResAssignToTaskrsrcRow(
  ra: Element,
  mapsOrProjId: XmlLookupMaps | number,
  fallbackProjId?: number
): Record<string, P6Scalar> | null {
  // источники ID из XML
  const actObjId = numAny(ra, ['ActivityObjectId', 'TaskObjectId', 'ActObjectId']);
  const rsrcObjId = numAny(ra, ['ResourceObjectId']);
  const roleObjId = numAny(ra, ['RoleObjectId']);

  if (!Number.isFinite(actObjId as number)) {
    console.warn('[P6-XML] TASKRSRC пропущен (нет ActivityObjectId)');
    return null;
  }

  // Резолвим ключи через maps (новый путь) либо оставляем поведение (deprecated)
  let task_id: number | null = null;
  let proj_id: number | null = null;
  let rsrc_id: number | null = null;
  let role_id: number | null = null;

  if (isMaps(mapsOrProjId)) {
    const maps = mapsOrProjId;
    task_id = maps.actObjId_to_taskId.get(actObjId!) ?? null;
    proj_id = maps.actObjId_to_projId.get(actObjId!) ?? (Number.isFinite(fallbackProjId as number) ? (fallbackProjId as number) : null);
    rsrc_id = Number.isFinite(rsrcObjId as number)
      ? (maps.resObjId_to_rsrcId.get(rsrcObjId as number) ?? (rsrcObjId as number))
      : null;
    role_id = Number.isFinite(roleObjId as number)
      ? (maps.roleObjId_to_roleId.get(roleObjId as number) ?? (roleObjId as number))
      : null;

    if (!Number.isFinite(task_id as number) || !Number.isFinite(proj_id as number)) {
      console.warn('[P6-XML] TASKRSRC пропущен (не удалось зарезолвить task_id/proj_id через maps)', { actObjId, task_id, proj_id });
      return null;
    }
  } else {
    // deprecated режим: proj_id приходит числом, task_id = ActivityObjectId (как было)
    proj_id = Number(mapsOrProjId);
    task_id = actObjId as number;
    rsrc_id = Number.isFinite(rsrcObjId as number) ? (rsrcObjId as number) : null;
    role_id = Number.isFinite(roleObjId as number) ? (roleObjId as number) : null;

    if (!Number.isFinite(proj_id)) {
      console.warn('[P6-XML] TASKRSRC пропущен (нет proj_id в deprecated режиме)');
      return null;
    }
  }

  // PK: берём <ObjectId>, иначе синтетический числовой
  const objId = numAny(ra, ['ObjectId']);
  const taskrsrc_id: number = Number.isFinite(objId as number)
    ? (objId as number)
    : hash32ToNum(`${proj_id}|${task_id}|${rsrc_id ?? ''}|${role_id ?? ''}`);

  // тип/флаги/источники
  const rsrcTypeTxt = txtAny(ra, ['ResourceType', 'Type']);
  const rateType    = txtAny(ra, ['RateType']);
  const cpqSrcType  = txtAny(ra, ['CostPerQtySourceType', 'CostPerQtySrcType']);
  const linkFlag    = txtAny(ra, ['CalculateCostsFromUnits', 'CostQtyLinkFlag']);

  // нагрузки (единицы)
  const remain_qty        = numAny(ra, ['RemainingUnits', 'RemainUnits', 'RemainingQty']);
  // RA-level AtCompletionUnits (если есть) — приоритетнее Budgeted/Target
  const at_comp_qty       = numAny(ra, ['AtCompletionUnits', 'AtCompleteUnits', 'AtCompUnits']);
  const target_qty_raw    = numAny(ra, ['BudgetedUnits', 'TargetUnits']);
  const target_qty_per_hr = numAny(ra, ['BudgetedUnitsPerTime', 'TargetUnitsPerTime']);
  const remain_qty_per_hr = numAny(ra, ['RemainingUnitsPerTime']);

  const act_reg_qty = numAny(ra, ['ActualRegularUnits', 'ActRegularUnits']);
  const act_ot_qty  = numAny(ra, ['ActualOvertimeUnits', 'ActOvertimeUnits']);
  const act_units_any = numAny(ra, ['ActualUnits', 'ActUnits', 'ActualQty']); // фолбэк, если нет разбивки reg/ot
  const cur_qty = numAny(ra, ['ThisPeriodUnits', 'CurUnits', 'ThisPeriodQty']); // «период» если дан в XML

  // Стоимости
  const cost_per_qty   = numAny(ra, ['Rate', 'CostPerQty']); // цена за ед./час
  let target_cost      = numAny(ra, ['BudgetedCost', 'TargetCost']);
  const at_comp_cost   = numAny(ra, ['AtCompletionCost', 'AtCompleteCost', 'AtCompCost']);
  const remain_cost    = numAny(ra, ['RemainingCost']);
  const act_reg_cost   = numAny(ra, ['ActualRegularCost', 'ActRegularCost']);
  const act_ot_cost    = numAny(ra, ['ActualOvertimeCost', 'ActOvertimeCost']);
  const act_cost_any   = numAny(ra, ['ActualCost', 'ActCost']);

  // агрегаты по единицам
  const act_qty = (act_reg_qty != null || act_ot_qty != null)
    ? sumNullable(act_reg_qty, act_ot_qty)
    : (act_units_any ?? null);

  // целевой объём (budget/at-completion) с умными фолбэками
  let target_qty = at_comp_qty ?? target_qty_raw ?? null;
  if (target_qty == null && (act_qty != null || remain_qty != null)) {
    // чаще всего XML не содержит BudgetedUnits, но есть Actual + Remaining
    target_qty = (act_qty ?? 0) + (remain_qty ?? 0);
  }

  // целевая стоимость
  if (target_cost == null) {
    if (at_comp_cost != null) {
      target_cost = at_comp_cost;
    } else if (target_qty != null && cost_per_qty != null) {
      target_cost = target_qty * cost_per_qty;
    }
  }

  // факт-стоимость
  const act_cost = (act_reg_cost != null || act_ot_cost != null)
    ? sumNullable(act_reg_cost, act_ot_cost)
    : (act_cost_any ?? null);

  const progress_cost_pct = (target_cost != null && target_cost > 0 && act_cost != null)
    ? clampPct((act_cost / target_cost) * 100)
    : null;

  // даты
  const act_start_date      = dtAny(ra, ['ActualStartDate']);
  const act_end_date        = dtAny(ra, ['ActualFinishDate']);
  const restart_date        = dtAny(ra, ['RestartDate', 'ResumeDate']);
  const reend_date          = dtAny(ra, ['ReEndDate']);
  const target_start_date   = dtAny(ra, ['PlannedStartDate', 'TargetStartDate']);
  const target_end_date     = dtAny(ra, ['PlannedFinishDate', 'TargetFinishDate']);
  const rem_late_start_date = dtAny(ra, ['RemainingLateStartDate']);
  const rem_late_end_date   = dtAny(ra, ['RemainingLateFinishDate']);

  // прочее
  const pobs_id     = numAny(ra, ['OBSObjectId', 'ResponsibleManagerObjectId']);
  const skill       = numAny(ra, ['Proficiency', 'ProficiencyLevel', 'SkillLevel']);
  const relag       = numAny(ra, ['RelagDrtnHrCnt', 'RelagDuration', 'Relag']);
  const guid        = txtAny(ra, ['GUID', 'Guid']);
  const curv_id     = numAny(ra, ['CurveObjectId', 'SpreadCurveObjectId']);
  const unit_id     = numAny(ra, ['UnitOfMeasureObjectId', 'UOMObjectId', 'UnitObjectId']);
  const curr_id     = numAny(ra, ['CurrencyObjectId', 'CurrObjectId']);
  const create_user = txtAny(ra, ['CreateUser', 'CreateBy', 'AddByName']);
  const create_date = dtAny(ra, ['CreateDate', 'AddDate', 'DateCreated']);
  const hasHours    = txtAny(ra, ['HasRsrcHours', 'HasRsrchours']);
  const sum_id      = numAny(ra, ['TaskRsrcSumObjectId', 'TaskRsrcSummaryObjectId']);

  return {
    // обязательные
    taskrsrc_id,
    task_id: task_id as number,
    proj_id: proj_id as number,

    // связки
    rsrc_id,
    role_id,

    // флаги/типы
    cost_qty_link_flag: yn(linkFlag),
    rsrc_type: mapRsrcType(rsrcTypeTxt),
    rate_type: rateType ? rateType.toString().toUpperCase() : null,
    cost_per_qty_source_type: cpqSrcType ?? null,

    // нагрузки (единицы)
    remain_qty,
    target_qty,
    remain_qty_per_hr,
    target_qty_per_hr,
    act_reg_qty,
    act_ot_qty,
    act_qty,
    cur_qty, // ← This Period Units, если есть в XML

    // стоимость
    cost_per_qty,
    target_cost,
    act_cost,
    remain_cost,
    act_reg_cost,
    act_ot_cost,

    // прогресс по стоимости
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

/** Синтетическое назначение из Activity.*Units для PrimaryResource */
export function synthesizeTaskrsrcFromActivity(
  actEl: Element,
  maps: XmlLookupMaps
): TASKRSRCRow | null {
  const get = (tag: string) => actEl.getElementsByTagName(tag)[0]?.textContent?.trim() ?? '';
  const toNum = (v: any) => (v === '' || v == null) ? null : (Number(v));

  const actObjId  = toNum(get('ObjectId'));
  if (!actObjId) return null;

  const task_id   = maps.actObjId_to_taskId.get(actObjId) ?? null;
  const proj_id   = maps.actObjId_to_projId.get(actObjId) ?? null;
  const primResId = toNum(get('PrimaryResourceObjectId'));
  const rsrc_id   = primResId ? (maps.resObjId_to_rsrcId.get(primResId) ?? primResId) : null;

  // Берём AC/REM/PLAN с уровня активности
  const actualUnits    = toNum(get('ActualLaborUnits')) ?? 0;
  const remainingUnits = toNum(get('RemainingLaborUnits')) ?? 0;

  // AtCompletion лучше вычислять как Actual + Remaining
  let atCompletionUnits = (actualUnits ?? 0) + (remainingUnits ?? 0);
  if (!atCompletionUnits || atCompletionUnits === 0) {
    // Фолбэк на план, если и AC и REM нули
    atCompletionUnits = toNum(get('AtCompletionLaborUnits'))
                     ?? toNum(get('PlannedLaborUnits'))
                     ?? 0;
  }

  // Генерируем стабильный отрицательный id, чтобы не пересечься с реальными ObjectId
  const syntheticId = -(actObjId * 1_000_000 + (primResId ?? 0));

  const row: any = {
    taskrsrc_id: syntheticId,
    task_id,
    proj_id,
    rsrc_id,
    role_id: null,

    target_qty: atCompletionUnits,
    remain_qty: remainingUnits,
    act_reg_qty: actualUnits,
    act_ot_qty: 0,
    act_qty: actualUnits,
    cur_qty: null, // без PeriodPerformance вычислить нельзя
  };

  return row as TASKRSRCRow;
}
