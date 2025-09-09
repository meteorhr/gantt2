// parser/mapper/task.mapper.ts
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
function dt(el: Element, tag: string): Date | null {
  const s = txt(el, tag);
  if (!s) return null;
  const iso = s.includes('T') ? s : s.length === 10 ? `${s}T00:00:00` : s.replace(' ', 'T');
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

/* -------------------- dictionaries: code → label -------------------- */
// Исходные словари (ваши) сохранены как есть.
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
    .replace(/[\/]+/g, ' / ')             // сохранить семантику units/time
    .replace(/[\s_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function makeReverse(dict: AnyDict, aliases: Record<string, string> = {}): Map<string, string> {
  const m = new Map<string, string>();
  // сначала основная карта: label → code
  for (const [code, label] of Object.entries(dict)) {
    m.set(norm(label), code);
  }
  // затем алиасы: aliasLabel → targetCode
  for (const [aliasLabel, targetCode] of Object.entries(aliases)) {
    m.set(norm(aliasLabel), targetCode);
  }
  return m;
}

/* -------------------- aliases (XML-строки → коды) -------------------- */
// Покрываем формулировки из P6 XML (в т.ч. "Task Dependent", "Fixed Duration and Units", и т.д.)
const REV_TASK_TYPE = makeReverse(DICT_TASK_TYPE, {
  'task dependent': 'TT_Task',
  'task': 'TT_Task',
  'resource dependent': 'TT_Rsrc',
  'level of effort': 'TT_LOE',
  'wbs summary': 'TT_WBS',
  'start milestone': 'TT_StartMile', // предпочитаем явный стартовый код
  'finish milestone': 'TT_FinMile',
  'milestone': 'TT_Mile',
  'hammock': 'TT_Hammock',
  'template activity': 'TT_Tmpl',
});

const REV_STATUS_CODE = makeReverse(DICT_STATUS_CODE, {
  'not started': 'TK_NotStart',
  'in progress': 'TK_Active',
  'active': 'TK_Active',
  'suspended': 'TK_Suspend',
  'completed': 'TK_Complete',
  'complete': 'TK_Complete',
  'inactive': 'TK_Inactive',
});

// DurationType в P6 часто "Fixed Duration and Units" / "Fixed Units/Time"
const REV_DURATION_TYPE = makeReverse(DICT_DURATION_TYPE, {
  'fixed duration and units': 'DT_FixedDUR',      // маппим на один из кодов Fixed Duration
  'fixed duration & units': 'DT_FixedDUR',
  'fixed duration': 'DT_FixedDrtn',
  'fixed units/time': 'DT_FixedUnitsTime',
  'fixed units / time': 'DT_FixedUnitsTime',
  'fixed units time': 'DT_FixedUnitsTime',
  'fixed units': 'DT_FixedUnits',
  'fixed work': 'DT_FixedWork',
  'fixed rate': 'DT_FixedRate',
  'none': 'DT_None',
  // встречается в данных: "Fixed Duration and Units/Time" — сведём к Units/Time
  'fixed duration and units/time': 'DT_FixedUnitsTime',
  'fixed duration & units/time': 'DT_FixedUnitsTime',
});

const REV_COMPLETE_PCT_TYPE = makeReverse(DICT_COMPLETE_PCT_TYPE, {
  'duration': 'CP_Drtn',
  'units': 'CP_Units',
  'physical': 'CP_Phys',
  'duration percent complete': 'CP_Drtn',
  'units percent complete': 'CP_Units',
  'physical percent complete': 'CP_Phys',
});

const REV_PRIORITY_TYPE = makeReverse(DICT_PRIORITY_TYPE, {
  'very low': 'PT_VeryLow',
  'low': 'PT_Low',
  'normal': 'PT_Normal',
  'high': 'PT_High',
  'very high': 'PT_VeryHigh',
  'top': 'PT_Top',
});

/* -------------------- safe converter: text → code -------------------- */
function toCode(reverse: Map<string, string>, value: string | null | undefined): string | null {
  if (!value) return null;
  const key = norm(value);
  return reverse.get(key) ?? null;
}

/* -------------------- main mapper -------------------- */
export function mapActivityToTaskRow(a: Element, projId: number): Record<string, P6Scalar> {
  const taskId = num(a, 'ObjectId'); // PK
  const calId  = num(a, 'CalendarObjectId');
  const priRes = num(a, 'PrimaryResourceObjectId');
  const wbsId  = num(a, 'WBSObjectId');

  // исходные тексты из XML
  const taskTypeTxt   = txt(a, 'Type') || null;
  const statusTxt     = txt(a, 'Status') || null;
  const durTypeTxt    = txt(a, 'DurationType') || null;
  const pctTypeTxt    = txt(a, 'PercentCompleteType') || null;
  const priorityTxt   = txt(a, 'LevelingPriority') || null;

  // коды, рассчитанные по словарям
  const taskTypeCode  = toCode(REV_TASK_TYPE, taskTypeTxt);
  const statusCode    = toCode(REV_STATUS_CODE, statusTxt);
  const durationCode  = toCode(REV_DURATION_TYPE, durTypeTxt);
  const completeCode  = toCode(REV_COMPLETE_PCT_TYPE, pctTypeTxt);
  const priorityCode  = toCode(REV_PRIORITY_TYPE, priorityTxt);

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

    // ОРИГИНАЛЬНЫЕ ТЕКСТЫ (оставляем для отображения/отладки)
    task_type_txt: taskTypeTxt,
    status_txt: statusTxt,
    duration_type_txt: durTypeTxt,
    complete_pct_type_txt: pctTypeTxt,
    priority_type_txt: priorityTxt,

    // Прочее
    clndr_id: calId,
    rsrc_id: priRes,

    // Даты план/ран/поздн/факт/ожидаемые
    act_start_date: dt(a, 'ActualStartDate'),
    act_end_date: dt(a, 'ActualFinishDate'),
    early_start_date: dt(a, 'EarlyStartDate'),
    early_end_date: dt(a, 'EarlyFinishDate'),
    late_start_date: dt(a, 'LateStartDate'),
    late_end_date: dt(a, 'LateFinishDate'),
    plan_start_date: dt(a, 'PlannedStartDate'),
    plan_end_date: dt(a, 'PlannedFinishDate'),
    start_date: dt(a, 'StartDate'),
    end_date: dt(a, 'FinishDate'),
    rem_early_start_date: dt(a, 'RemainingEarlyStartDate'),
    rem_early_end_date: dt(a, 'RemainingEarlyFinishDate'),
    rem_late_start_date: dt(a, 'RemainingLateStartDate'),
    rem_late_end_date: dt(a, 'RemainingLateFinishDate'),

    // Продолжительности/проценты
    act_total_drtn_hr_cnt: num(a, 'ActualDuration'),
    rem_drtn_hr_cnt: num(a, 'RemainingDuration'),
    at_complete_drtn_hr_cnt: num(a, 'AtCompletionDuration'),
    plan_drtn_hr_cnt: num(a, 'PlannedDuration'),
    pct_complete: num(a, 'PercentComplete'),
    scope_pct_complete: num(a, 'ScopePercentComplete'),
    units_pct_complete: num(a, 'UnitsPercentComplete'),
    duration_pct_complete: num(a, 'DurationPercentComplete'),

    // Стоимости/трудозатраты (если нужно)
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
  };

  return row;
}
