// src/app/xer/resources.adapter.ts
import { RSRCRow } from './models/rsrc.model';
import { RSRCROLERow } from './models/rsrcrole.model';
import { TASKRSRCRow } from './models/taskrsrc.model';
import { ResourceAssignment } from '../gantt/models/gantt.model';
import { getRows, XERDocument } from './xer-parser';
import { XerDexieService } from './xer-dexie.service';

function buildResourceIndexFromLists(
  rsrcRows: RSRCRow[],
  roleRows: RSRCROLERow[],
  tx: TASKRSRCRow[],
): Map<number, ResourceAssignment[]> {
  const result = new Map<number, ResourceAssignment[]>();

  const rsrcById = new Map<number, RSRCRow>();
  for (const r of rsrcRows) if (typeof r.rsrc_id === 'number') rsrcById.set(r.rsrc_id, r);

  const roleByRsrc = new Map<number, RSRCROLERow>();
  for (const rr of roleRows) {
    if (typeof rr.rsrc_id === 'number' && !roleByRsrc.has(rr.rsrc_id)) roleByRsrc.set(rr.rsrc_id, rr);
  }

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

export function buildResourceIndex(doc: XERDocument): Map<number, ResourceAssignment[]> {
  {
    const rsrcRows = getRows<RSRCRow>(doc, 'RSRC');
    const roleRows = getRows<RSRCROLERow>(doc, 'RSRCROLE');
    const tx       = getRows<TASKRSRCRow>(doc, 'TASKRSRC');
    return buildResourceIndexFromLists(rsrcRows, roleRows, tx);
  }
}

/** Построить индекс назначений напрямую из IndexedDB (все проекты) */
export async function buildResourceIndexFromIndexedDb(
  dexie: XerDexieService
): Promise<Map<number, ResourceAssignment[]>> {
  const [rsrcRows, roleRows, tx] = await Promise.all([
    dexie.getRows('RSRC'),
    dexie.getRows('RSRCROLE'),
    dexie.getRows('TASKRSRC'),
  ]);
  return buildResourceIndexFromLists(
    rsrcRows as RSRCRow[],
    roleRows as RSRCROLERow[],
    tx as TASKRSRCRow[],
  );
}

/** Построить индекс назначений для одного проекта по proj_id (фильтруем TASKRSRC по проекту/задачам) */
export async function buildResourceIndexByProjectFromIndexedDb(
  dexie: XerDexieService,
  projectId: number
): Promise<Map<number, ResourceAssignment[]>> {
  const pid = Number(projectId);
  const [rsrcRows, roleRows, txAll, taskAll] = await Promise.all([
    dexie.getRows('RSRC'),
    dexie.getRows('RSRCROLE'),
    dexie.getRows('TASKRSRC'),
    dexie.getRows('TASK'),
  ]);
  const projectTasks = (taskAll as any[]).filter(r => Number(r?.proj_id) === pid);
  const taskIdSet = new Set<number>(projectTasks.map((t: any) => Number(t?.task_id)));

  const tx = (txAll as any[]).filter(r =>
    Number(r?.proj_id) === pid || taskIdSet.has(Number(r?.task_id))
  ) as TASKRSRCRow[];

  return buildResourceIndexFromLists(
    rsrcRows as RSRCRow[],
    roleRows as RSRCROLERow[],
    tx,
  );
}