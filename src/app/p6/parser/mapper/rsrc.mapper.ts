// parser/mapper/rsrc.mapper.ts
import type { P6Scalar } from '../parser.types';

/* ---------- helpers ---------- */
function txt(el: Element, tag: string): string {
  const n = el.getElementsByTagName(tag)[0];
  return n?.textContent?.trim() ?? '';
}
function txtAny(el: Element, tags: string[]): string | null {
  for (const t of tags) {
    const v = txt(el, t);
    if (v) return v;
  }
  return null;
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
    if (v !== null) return v;
  }
  return null;
}
function ynFrom(el: Element, tags: string[]): 'Y' | 'N' | null {
  const raw = txtAny(el, tags);
  if (raw == null) return null;
  const s = raw.trim().toLowerCase();
  if (s === 'y' || s === 'yes' || s === 'true' || s === '1') return 'Y';
  if (s === 'n' || s === 'no' || s === 'false' || s === '0') return 'N';
  // иногда P6 пишет уже 'Y'/'N'
  if (raw === 'Y' || raw === 'N') return raw as 'Y' | 'N';
  return null;
}

/* ---------- mapper ---------- */
/**
 * Преобразовать <Resource> -> RSRCRow-совместимый объект.
 * Возвращает null, если отсутствует валидный rsrc_id (ObjectId).
 */
export function mapResourceToRsrcRow(r: Element, projId: number): Record<string, P6Scalar> | null {
  const id = num(r, 'ObjectId'); // PK
  if (id == null) {
    console.warn('[P6-XML] RSRC пропущен (нет ObjectId)');
    return null;
  }

  const row: Record<string, P6Scalar> = {
    // base (обычно в XERRowBase есть proj_id — оставим его)
    proj_id: Number.isFinite(projId) ? projId : null,

    // === RSRCRow ===
    rsrc_id: id,

    rsrc_short_name: txtAny(r, ['Id']) ?? null,
    rsrc_name: txtAny(r, ['Name']) ?? null,
    rsrc_title_name: txtAny(r, ['Title', 'TitleName']) ?? null,
    rsrc_type: txtAny(r, ['Type']) ?? null, // Labor / Nonlabor / Material

    parent_rsrc_id: numAny(r, ['ParentObjectId']),
    role_id: numAny(r, ['PrimaryRoleObjectId', 'RoleObjectId']),

    clndr_id: numAny(r, ['CalendarObjectId']),
    curr_id: numAny(r, ['CurrencyObjectId', 'CurrencyId']),
    unit_id: numAny(r, ['UnitOfMeasureObjectId', 'UOMObjectId', 'UnitId']),
    shift_id: numAny(r, ['ShiftObjectId']),
    location_id: numAny(r, ['LocationObjectId']),

    def_qty_per_hr: numAny(r, ['DefaultUnitsPerTime', 'DefaultUnitsPerHour', 'DefaultQtyPerHour']),
    cost_qty_type: txtAny(r, ['CostQuantityType', 'PriceTimeUnits', 'RateTimeUnits']) ?? null,
    def_cost_qty_link_flag: ynFrom(r, ['CalcCostsFromUnitsFlag', 'CalculateCostsFromUnitsFlag', 'DefCostQtyLinkFlag']),

    ot_flag: ynFrom(r, ['OvertimeFlag', 'OvertimeAllowed', 'OTFlag']),
    ot_factor: numAny(r, ['OvertimeFactor', 'OTFactor']),

    active_flag: ynFrom(r, ['ActiveFlag']),
    auto_compute_act_flag: ynFrom(r, ['AutoComputeActuals', 'AutoComputeActualsFlag']),
    timesheet_flag: ynFrom(r, ['TimesheetFlag', 'UsesTimesheets']),

    email_addr: txtAny(r, ['EmailAddress']) ?? null,
    office_phone: txtAny(r, ['OfficePhone', 'Phone', 'WorkPhone']) ?? null,
    other_phone: txtAny(r, ['OtherPhone', 'MobilePhone', 'CellPhone']) ?? null,

    employee_code: txtAny(r, ['EmployeeId', 'EmployeeCode']) ?? null,
    user_id: txtAny(r, ['UserLoginName', 'UserName', 'UserId', 'LoginName']) ?? null,

    rsrc_seq_num: numAny(r, ['SequenceNumber', 'SortOrder']),

    guid: txtAny(r, ['GUID', 'Guid']) ?? null,
    rsrc_notes: txtAny(r, ['ResourceNotes', 'Notes']) ?? null,

    xfer_notstart_day_cnt: numAny(r, ['TransferNotStartedDays', 'XferNotStartDays', 'XferNotStartedDayCount', 'NotStartedViewWindow']),
    xfer_complete_day_cnt: numAny(r, ['TransferCompletedDays', 'XferCompleteDays', 'XferCompletedDayCount', 'CompletedViewWindow']),
  };

  return row;
}