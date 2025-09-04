// src/app/xer/resources.adapter.ts
import { RSRCRow } from './models/rsrc.model';
import { RSRCROLERow } from './models/rsrcrole.model';
import { TASKRSRCRow } from './models/taskrsrc.model';
import { ResourceAssignment } from '../gantt/models/gantt.model';
import { getRows, XERDocument } from './xer-parser';

export function buildResourceIndex(doc: XERDocument): Map<number, ResourceAssignment[]> {
  const result = new Map<number, ResourceAssignment[]>();

  const rsrcRows = getRows<RSRCRow>(doc, 'RSRC');
  const rsrcById = new Map<number, RSRCRow>();
  for (const r of rsrcRows) if (typeof r.rsrc_id === 'number') rsrcById.set(r.rsrc_id, r);

  const roleRows = getRows<RSRCROLERow>(doc, 'RSRCROLE');
  const roleByRsrc = new Map<number, RSRCROLERow>();
  for (const rr of roleRows) {
    if (typeof rr.rsrc_id === 'number' && !roleByRsrc.has(rr.rsrc_id)) roleByRsrc.set(rr.rsrc_id, rr);
  }

  const tx = getRows<TASKRSRCRow>(doc, 'TASKRSRC');
  for (const a of tx) {
    if (typeof a.task_id !== 'number' || typeof a.taskrsrc_id !== 'number') continue;

    const rsrc = (typeof a.rsrc_id === 'number') ? rsrcById.get(a.rsrc_id) : undefined;
    const rrole = (typeof a.rsrc_id === 'number') ? roleByRsrc.get(a.rsrc_id) : undefined;

    const ra: ResourceAssignment = {
      taskrsrc_id: a.taskrsrc_id,
      rsrc_id: a.rsrc_id ?? null,

      rsrc_name: rsrc?.rsrc_name ?? null,
      rsrc_short_name: rsrc?.rsrc_short_name ?? null,
      rsrc_type: a.rsrc_type ?? rsrc?.rsrc_type ?? null,

      role_id: a.role_id ?? rrole?.role_id ?? null,
      role_short_name: rrole?.role_short_name ?? null,
      role_name: rrole?.role_name ?? null,

      unit_id: a.unit_id ?? rsrc?.unit_id ?? null,
      curr_id: a.curr_id ?? rsrc?.curr_id ?? null,

      target_qty: a.target_qty ?? null,
      remain_qty: a.remain_qty ?? null,
      act_reg_qty: a.act_reg_qty ?? null,
      act_ot_qty: a.act_ot_qty ?? null,

      cost_per_qty: a.cost_per_qty ?? null,
      rate_type: a.rate_type ?? null,

      target_cost: a.target_cost ?? null,
      remain_cost: a.remain_cost ?? null,
      act_reg_cost: a.act_reg_cost ?? null,
      act_ot_cost: a.act_ot_cost ?? null,
    };

    const list = result.get(a.task_id) ?? [];
    list.push(ra);
    result.set(a.task_id, list);
  }

  for (const [_, list] of result) {
    list.sort((x, y) => {
      const lx = x.rsrc_type === 'RT_Labor' ? 0 : 1;
      const ly = y.rsrc_type === 'RT_Labor' ? 0 : 1;
      if (lx !== ly) return lx - ly;
      const rx = (x.role_short_name ?? '') + (x.rsrc_short_name ?? '');
      const ry = (y.role_short_name ?? '') + (y.rsrc_short_name ?? '');
      return rx.localeCompare(ry, undefined, { numeric: true, sensitivity: 'base' });
    });
  }

  return result;
}