// ==============================
// FILE: parser/mapper/task.mapper.ts
// ==============================
import type { P6Scalar } from '../parser.types.ts';

/* -------------------- helpers: xml → primitives -------------------- */
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
function numAny(el: Element, tags: string[]): number | null {
  for (const t of tags) {
    const v = num(el, t);
    if (v != null) return v;
  }
  return null;
}
function dt(el: Element, tag: string): Date | null {
  const s = txt(el, tag);
  if (!s) return null;
  // Поддержим форматы "YYYY-MM-DD", "YYYY-MM-DDTHH:mm:ss", "YYYY-MM-DD HH:mm:ss"
  const iso = s.includes('T') ? s : s.length === 10 ? `${s}T00:00:00` : s.replace(' ', 'T');
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

/* -------------------- dictionaries: code → label -------------------- */
const DICT_TASK_TYPE = {
  TT_Task: 'Task',
  TT_Rsrc: 'Resource Dependent',
  TT_LOE: 'Level of Effort',
  TT_WBS: 'WBS Summary',
  TT_Mile: 'Start Milestone',
  TT_StartMile: 'Start Milestone',
  TT_FinMile: 'Finish Milestone',
  TT_Hammock: 'Hammock',
  TT_Tmpl: 'Template Activity',
} as const;

const DICT_STATUS_CODE = {
  TK_NotStart: 'Not Started',
  TK_Active: 'In Progress',
  TK_Suspend: 'Suspended',
  TK_Complete: 'Completed',
  TK_Inactive: 'Inactive',
} as const;

const DICT_DURATION_TYPE = {
  DT_FixedDUR2: 'Fixed Duration',
  DT_FixedDUR: 'Fixed Duration',
  DT_FixedDrtn: 'Fixed Duration',
  DT_FixedUnits: 'Fixed Units',
  DT_FixedUnitsTime: 'Fixed Units/Time',
  DT_FixedWork: 'Fixed Work',
  DT_FixedRate: 'Fixed Rate',
  DT_None: 'None',
} as const;

const DICT_COMPLETE_PCT_TYPE = {
  CP_Drtn: 'Duration % Complete',
  CP_Units: 'Units % Complete',
  CP_Phys: 'Physical % Complete',
} as const;

const DICT_PRIORITY_TYPE = {
  PT_VeryLow: 'Very Low',
  PT_Low: 'Low',
  PT_Normal: 'Normal',
  PT_High: 'High',
  PT_VeryHigh: 'Very High',
  PT_Top: 'Top',
} as const;

/* -------------------- normalization & reverse maps -------------------- */
 type AnyDict = Record<string, string>;
function norm(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[%]/g, ' percent ')
    .replace(/[\/]+/g, ' / ')
    .replace(/[\s_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function makeReverse(dict: AnyDict, aliases: Record<string, string> = {}): Map<string, string> {
  const m = new Map<string, string>();
  for (const [code, label] of Object.entries(dict)) m.set(norm(label), code);
  for (const [aliasLabel, targetCode] of Object.entries(aliases)) m.set(norm(aliasLabel), targetCode);
  return m;
}

/* -------------------- aliases (XML-строки → коды) -------------------- */
const REV_TASK_TYPE = makeReverse(DICT_TASK_TYPE, {
  'task dependent': 'TT_Task',
  task: 'TT_Task',
  'resource dependent': 'TT_Rsrc',
  'level of effort': 'TT_LOE',
  'wbs summary': 'TT_WBS',
  'start milestone': 'TT_StartMile',
  'finish milestone': 'TT_FinMile',
  milestone: 'TT_Mile',
  hammock: 'TT_Hammock',
  'template activity': 'TT_Tmpl',
});
const REV_STATUS_CODE = makeReverse(DICT_STATUS_CODE, {
  'not started': 'TK_NotStart',
  'in progress': 'TK_Active',
  active: 'TK_Active',
  suspended: 'TK_Suspend',
  completed: 'TK_Complete',
  complete: 'TK_Complete',
  inactive: 'TK_Inactive',
});
const REV_DURATION_TYPE = makeReverse(DICT_DURATION_TYPE, {
  'fixed duration and units': 'DT_FixedDUR',
  'fixed duration & units': 'DT_FixedDUR',
  'fixed duration': 'DT_FixedDrtn',
  'fixed units/time': 'DT_FixedUnitsTime',
  'fixed units / time': 'DT_FixedUnitsTime',
  'fixed units time': 'DT_FixedUnitsTime',
  'fixed units': 'DT_FixedUnits',
  'fixed work': 'DT_FixedWork',
  'fixed rate': 'DT_FixedRate',
  none: 'DT_None',
  'fixed duration and units/time': 'DT_FixedUnitsTime',
  'fixed duration & units/time': 'DT_FixedUnitsTime',
});
const REV_COMPLETE_PCT_TYPE = makeReverse(DICT_COMPLETE_PCT_TYPE, {
  duration: 'CP_Drtn',
  units: 'CP_Units',
  physical: 'CP_Phys',
  'duration percent complete': 'CP_Drtn',
  'units percent complete': 'CP_Units',
  'physical percent complete': 'CP_Phys',
});
const REV_PRIORITY_TYPE = makeReverse(DICT_PRIORITY_TYPE, {
  'very low': 'PT_VeryLow',
  low: 'PT_Low',
  normal: 'PT_Normal',
  high: 'PT_High',
  'very high': 'PT_VeryHigh',
  top: 'PT_Top',
});

/* -------------------- safe converter: text → code -------------------- */
function toCode(reverse: Map<string, string>, value: string | null | undefined): string | null {
  if (!value) return null;
  const key = norm(value);
  return reverse.get(key) ?? null;
}

/* -------------------- milestone & boolean helpers -------------------- */
export function isMilestoneCode(code?: string | null): boolean {
  const k = (code ?? '').trim();
  return k === 'TT_StartMile' || k === 'TT_FinMile' || k === 'TT_Mile';
}
export function isStartMilestoneCode(code?: string | null): boolean {
  const k = (code ?? '').trim();
  return k === 'TT_StartMile' || k === 'TT_Mile';
}
export function isFinishMilestoneCode(code?: string | null): boolean {
  const k = (code ?? '').trim();
  return k === 'TT_FinMile' || k === 'TT_Mile';
}
function toBoolYN(v: string | null | undefined): boolean | null {
  if (v == null) return null;
  const s = String(v).trim().toLowerCase();
  if (s === 'y' || s === 'yes' || s === 'true' || s === '1') return true;
  if (s === 'n' || s === 'no' || s === 'false' || s === '0') return false;
  return null;
}

/* -------------------- main mapper -------------------- */
export function mapActivityToTaskRow(a: Element, projId: number): Record<string, P6Scalar> {
  const taskId = num(a, 'ObjectId'); // PK
  const calId = num(a, 'CalendarObjectId');
  const priRes = num(a, 'PrimaryResourceObjectId');
  const wbsId = num(a, 'WBSObjectId');

  // исходные тексты из XML
  const taskTypeTxt = txt(a, 'Type') || null;
  const statusTxt = txt(a, 'Status') || null;
  const durTypeTxt = txt(a, 'DurationType') || null;
  const pctTypeTxt = txt(a, 'PercentCompleteType') || null;
  const priorityTxt = txt(a, 'LevelingPriority') || null;

  // коды, рассчитанные по словарям
  const taskTypeCode = toCode(REV_TASK_TYPE, taskTypeTxt);
  const statusCode = toCode(REV_STATUS_CODE, statusTxt);
  const durationCode = toCode(REV_DURATION_TYPE, durTypeTxt);
  const completeCode = toCode(REV_COMPLETE_PCT_TYPE, pctTypeTxt);
  const priorityCode = toCode(REV_PRIORITY_TYPE, priorityTxt);

  // Стоимости (аккуратные фолбэки)
  const actual_labor_cost = numAny(a, ['ActualLaborCost']);
  const actual_nonlabor_cost = numAny(a, ['ActualNonLaborCost']);
  const actual_total_cost_any = numAny(a, ['ActualTotalCost']);

  const at_completion_labor_cost = numAny(a, ['AtCompletionLaborCost']);
  const at_completion_nonlabor_cost = numAny(a, ['AtCompletionNonLaborCost']);
  const at_completion_total_cost_any = numAny(a, ['AtCompletionTotalCost']);

  const planned_labor_cost = numAny(a, ['PlannedLaborCost']);
  const planned_nonlabor_cost = numAny(a, ['PlannedNonLaborCost']);
  const planned_total_cost_any = numAny(a, ['PlannedTotalCost']);

  const actual_total_cost =
    actual_total_cost_any != null ? actual_total_cost_any : (actual_labor_cost ?? 0) + (actual_nonlabor_cost ?? 0);

  const at_completion_total_cost =
    at_completion_total_cost_any != null
      ? at_completion_total_cost_any
      : (at_completion_labor_cost ?? 0) + (at_completion_nonlabor_cost ?? 0);

  const planned_total_cost =
    planned_total_cost_any != null ? planned_total_cost_any : (planned_labor_cost ?? 0) + (planned_nonlabor_cost ?? 0);

  // === ВАЖНО: даты в P6 XML чаще БЕЗ суффикса "Date" ===
  // ActualStart / ActualFinish
  const actStart = dt(a, 'ActualStart') ?? dt(a, 'ActualStartDate');
  const actFinish = dt(a, 'ActualFinish') ?? dt(a, 'ActualFinishDate');

  // EarlyStart / EarlyFinish
  const earlyStart = dt(a, 'EarlyStart') ?? dt(a, 'EarlyStartDate');
  const earlyFinish = dt(a, 'EarlyFinish') ?? dt(a, 'EarlyFinishDate');

  // LateStart / LateFinish
  const lateStart = dt(a, 'LateStart') ?? dt(a, 'LateStartDate');
  const lateFinish = dt(a, 'LateFinish') ?? dt(a, 'LateFinishDate');

  // PlannedStart / PlannedFinish
  const planStart = dt(a, 'PlannedStart') ?? dt(a, 'PlannedStartDate');
  const planFinish = dt(a, 'PlannedFinish') ?? dt(a, 'PlannedFinishDate');

  // RemainingEarly*, RemainingLate*
  const remEarlyStart = dt(a, 'RemainingEarlyStart') ?? dt(a, 'RemainingEarlyStartDate');
  const remEarlyFinish = dt(a, 'RemainingEarlyFinish') ?? dt(a, 'RemainingEarlyFinishDate');
  const remLateStart = dt(a, 'RemainingLateStart') ?? dt(a, 'RemainingLateStartDate');
  const remLateFinish = dt(a, 'RemainingLateFinish') ?? dt(a, 'RemainingLateFinishDate');

  // === TF и Longest Path ===
  const totalFloatRaw = numAny(a, ['TotalFloat']); // единицы могут не быть часами
  const totalFloatUnits = txt(a, 'TotalFloatUnits') || '';
  const floatPath = numAny(a, ['FloatPath']);
  const floatPathOrder = numAny(a, ['FloatPathOrder']);
  const onLongestPathRaw = txt(a, 'OnLongestPath'); // 'Y'/'N' или 'true'/'false'
  const onLongestPath = toBoolYN(onLongestPathRaw);

  const row: Record<string, P6Scalar> = {
    // Идентификаторы/общие (ключи первыми)
    task_id: taskId ?? null,
    proj_id: Number.isFinite(projId) ? projId : null,
    wbs_id: wbsId,

    task_code: txt(a, 'Id') || null,
    task_name: txt(a, 'Name') || null,

    // КОДЫ по словарям
    task_type: taskTypeCode,
    status_code: statusCode,
    duration_type: durationCode,
    complete_pct_type: completeCode,
    priority_type: priorityCode,

    // ОРИГИНАЛЬНЫЕ ТЕКСТЫ (для отображения/диагностики)
    task_type_txt: taskTypeTxt,
    status_txt: statusTxt,
    duration_type_txt: durTypeTxt,
    complete_pct_type_txt: pctTypeTxt,
    priority_type_txt: priorityTxt,

    // Прочее
    clndr_id: calId,
    rsrc_id: priRes,

    // Даты план/ран/поздн/факт/ожидаемые
    act_start_date: actStart,
    act_end_date: actFinish,
    early_start_date: earlyStart,
    early_end_date: earlyFinish,
    late_start_date: lateStart,
    late_end_date: lateFinish,
    plan_start_date: planStart,
    plan_end_date: planFinish,
    start_date: dt(a, 'StartDate') ?? actStart ?? earlyStart ?? planStart,
    end_date: dt(a, 'FinishDate') ?? actFinish ?? earlyFinish ?? planFinish,
    rem_early_start_date: remEarlyStart,
    rem_early_end_date: remEarlyFinish,
    rem_late_start_date: remLateStart,
    rem_late_end_date: remLateFinish,

    // Продолжительности/проценты
    act_total_drtn_hr_cnt: numAny(a, ['ActualDuration', 'ActualDurationHours']),
    rem_drtn_hr_cnt: numAny(a, ['RemainingDuration', 'RemainingDurationHours']),
    at_complete_drtn_hr_cnt: numAny(a, ['AtCompletionDuration', 'AtCompletionDurationHours']),
    plan_drtn_hr_cnt: numAny(a, ['PlannedDuration', 'PlannedDurationHours']),
    pct_complete: numAny(a, ['PercentComplete']),
    scope_pct_complete: numAny(a, ['ScopePercentComplete']),
    units_pct_complete: numAny(a, ['UnitsPercentComplete']),
    duration_pct_complete: numAny(a, ['DurationPercentComplete']),

    // Стоимости/трудозатраты
    at_complete_labor_cost: num(a, 'AtCompletionLaborCost'),
    at_complete_nonlabor_cost: num(a, 'AtCompletionNonLaborCost'),
    at_complete_labor_units: num(a, 'AtCompletionLaborUnits'),
    at_complete_nonlabor_units: num(a, 'AtCompletionNonLaborUnits'),
    plan_labor_cost: num(a, 'PlannedLaborCost'),
    plan_labor_units: num(a, 'PlannedLaborUnits'),
    plan_nonlabor_cost: num(a, 'PlannedNonLaborCost'),
    plan_nonlabor_units: num(a, 'PlannedNonLaborUnits'),
    rem_labor_cost: num(a, 'RemainingLaborCost'),
    rem_labor_units: num(a, 'RemainingLaborUnits'),
    rem_nonlabor_cost: num(a, 'RemainingNonLaborCost'),
    rem_nonlabor_units: num(a, 'RemainingNonLaborUnits'),

    actual_labor_cost,
    actual_nonlabor_cost,
    actual_total_cost,

    at_completion_labor_cost,
    at_completion_nonlabor_cost,
    at_completion_total_cost,

    planned_labor_cost,
    planned_nonlabor_cost,
    planned_total_cost,

    // ФИЗ. % — перевод из 0..1 к 0..100 при необходимости
    phys_complete_pct: (() => {
      const v = num(a, 'PhysicalPercentComplete');
      return v == null ? null : v <= 1 ? v * 100 : v;
    })(),

    // === Total Float и Longest Path ===
    // Сохраняем "сырое" поле TF и его юниты, чтобы утилита смогла корректно сконвертировать
    TotalFloat: totalFloatRaw,
    TotalFloatUnits: totalFloatUnits || null,

    // Для XER-совместимости оставим и «часовой» слот, если уверены, что XML отдаёт часы — обычно нет.
    // Поэтому НЕ умножаем/не делим здесь, а конвертацию делаем в float-summary.util.ts.
    // total_float_hr_cnt: null,

    // Longest Path маркеры
    float_path: floatPath,
    float_path_order: floatPathOrder,
    OnLongestPath: onLongestPathRaw || null, // Сохраняем исходное строковое значение под P6Scalar
    // Доп. нормализованные поля (без изменения существующей логики/контракта)
    OnLongestPath_bool: onLongestPath === null ? null : (onLongestPath ? 1 : 0), // 1/0/null — числовой вид
    OnLongestPath_norm: onLongestPath === null ? null : (onLongestPath ? 'Y' : 'N'), // 'Y'/'N'/null — строковый вид

    // Удобные флаги-вехи (для DCMA Logic/визуализаций)
    is_milestone: taskTypeCode == null ? null : (isMilestoneCode(taskTypeCode) ? 1 : 0),
    is_start_milestone: taskTypeCode == null ? null : (isStartMilestoneCode(taskTypeCode) ? 1 : 0),
    is_finish_milestone: taskTypeCode == null ? null : (isFinishMilestoneCode(taskTypeCode) ? 1 : 0),

    // Проценты/трудозатраты для агрегаторов
    act_work_qty: num(a, 'ActualLaborUnits'),
    target_work_qty: (() => {
      const atc = num(a, 'AtCompletionLaborUnits');
      if (atc != null) return atc;
      const act = num(a, 'ActualLaborUnits') ?? 0;
      const rem = num(a, 'RemainingLaborUnits') ?? 0;
      const plan = num(a, 'PlannedLaborUnits');
      if ((act + rem) > 0) return act + rem;
      return plan ?? null;
    })(),
  };

  return row;
}
