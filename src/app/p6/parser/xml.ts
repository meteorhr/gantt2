// parser/xml.ts — парсер Primavera P6 XML в XERDocument-подобную структуру
import { mapWbsToProjwbsRow } from './mapper/projwbs.mapper.js';
import { mapActivityToTaskRow } from './mapper/task.mapper.js';
import { mapPredLinkToTaskpredRow } from './mapper/taskpred.mapper.js';
import { mapResAssignToTaskrsrcRow } from './mapper/taskrsrc.mapper.js';
import { mapResourceToRsrcRow } from './mapper/rsrc.mapper.js';
import { mapResourceRoleToRsrcroleRow } from './mapper/rsrcrole.mapper.js';
import type { P6Scalar, P6Table, P6Document } from './parser.types.ts';
import { mapCurrencyToCurrtypeRow } from './mapper/currtype.mapper.js';
import { mapCalendarToCalendarRow } from './mapper/calendar.mapper.js';

/* ---------------------- XML helpers ---------------------- */
function xmlText(el: Element | null, tag: string): string {
  if (!el) return '';
  const child = el.getElementsByTagName(tag)[0];
  return child?.textContent?.trim() ?? '';
}
function xmlAttr(el: Element | null, name: string): string {
  if (!el) return '';
  return el.getAttribute(name)?.trim() ?? '';
}

function xmlDate(el: Element | null, tag: string): Date | null {
  const s = xmlText(el, tag);
  if (!s) return null;
  const iso = s.includes('T') ? s : s.length === 10 ? `${s}T00:00:00` : s.replace(' ', 'T');
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}
function pushRow(tbl: P6Table, row: Record<string, P6Scalar>): void {
  for (const k of Object.keys(row)) {
    if (!tbl.fields.includes(k)) tbl.fields.push(k);
  }
  tbl.rows.push(row);
}

/* ===== mapper: Currency → CURRTYPE row ===== */

/* -- локальная SUMMARIZE -- */
function summarizeArrayLocal(doc: P6Document) {
  const arr: { name: string; i18n: string; value: string; i18nValue?: string; params?: Record<string, unknown> }[] = [];
  if (doc.header) {
    arr.push({ name: 'version',     i18n: 'summarize.version',     value: doc.header.productVersion ?? '' });
    arr.push({ name: 'exportDate',  i18n: 'summarize.exportDate',  value: doc.header.exportDate ?? '' });
    arr.push({ name: 'context',     i18n: 'summarize.context',     value: doc.header.projectOrContext ?? '' });
    arr.push({ name: 'user',        i18n: 'summarize.user',        value: `${doc.header.userLogin ?? ''} (${doc.header.userFullNameOrRole ?? ''})` });
    arr.push({ name: 'db',          i18n: 'summarize.db',          value: doc.header.database ?? '' });
    arr.push({ name: 'module',      i18n: 'summarize.module',      value: doc.header.moduleName ?? '' });
    arr.push({ name: 'baseCurrency',i18n: 'summarize.baseCurrency',value: doc.header.baseCurrency ?? '' });
  }
  for (const t of Object.values(doc.tables)) {
    arr.push({
      name: t.name,
      i18n: 'summarize.table.' + t.name,
      value: '',
      i18nValue: 'summarize.table.count',
      params: { rows: t.rows.length, fields: t.fields.length },
    });
  }
  return arr;
}
function buildSummarizeTableLocal(doc: P6Document): P6Table {
  const items = summarizeArrayLocal(doc);
  const fields = ['name', 'i18n', 'value', 'i18nValue', 'params'];
  const rows = items.map(it => ({
    name: it.name,
    i18n: it.i18n,
    value: it.value ?? '',
    i18nValue: it.i18nValue ?? '',
    params: it.params ? JSON.stringify(it.params) : '',
  })) as Record<string, P6Scalar>[];
  return { name: 'SUMMARIZE', fields, rows };
}



/* ---------------------- Основной парсер ---------------------- */
export function parseP6XML(input: string): P6Document {
  const parser = new DOMParser();
  const xml = parser.parseFromString(input, 'application/xml');

  const err = xml.getElementsByTagName('parsererror')[0];
  if (err) throw new Error('Некорректный P6 XML: parsererror');

  const doc: P6Document = { header: null, tables: {} };

  // header
  const root = xml.documentElement;
  const exportDate = root.getAttribute('ExportDate') || '';
  const productVersion = root.getAttribute('Version') || root.getAttribute('xmlns') || '';
  const baseCurrency = root.getAttribute('BaseCurrency') || '';

  doc.header = {
    raw: null,
    productVersion,
    exportDate,
    projectOrContext: (xml.getElementsByTagName('Project')[0]?.getElementsByTagName('Id')[0]?.textContent ?? '').trim(),
    userLogin: '',
    userFullNameOrRole: '',
    database: '',
    moduleName: 'P6-XML',
    baseCurrency,
  };

  // таблицы
  const T_PROJECT:   P6Table = { name: 'PROJECT',   fields: [], rows: [] };
  const T_PROJWBS:   P6Table = { name: 'PROJWBS',       fields: [], rows: [] };
  const T_TASK:      P6Table = { name: 'TASK',      fields: [], rows: [] };
  const T_TASKPRED:  P6Table = { name: 'TASKPRED',  fields: [], rows: [] };
  const T_TASKRSRC:  P6Table = { name: 'TASKRSRC',  fields: [], rows: [] };
  const T_RSRC:      P6Table = { name: 'RSRC',      fields: [], rows: [] };
  const T_RSRCROLE:  P6Table = { name: 'RSRCROLE',  fields: [], rows: [] };

  const T_CURRTYPE: P6Table = { name: 'CURRTYPE', fields: [], rows: [] };
  const T_CALENDAR: P6Table = { name: 'CALENDAR', fields: [], rows: [] };

  const seenRsrc    = new Set<number>();
  const seenRsrcRole = new Set<number>();
  const seenCurr = new Set<number>();
  const pushRsrcUnique = (row: Record<string, P6Scalar>) => {
    const id = row['rsrc_id'] as number;
    if (!Number.isFinite(id) || seenRsrc.has(id)) return;
    seenRsrc.add(id);
    pushRow(T_RSRC, row);
  };
  const pushRsrcRoleUnique = (row: Record<string, P6Scalar>) => {
    const id = row['rsrc_role_id'] as number;
    if (!Number.isFinite(id) || seenRsrcRole.has(id)) return;
    seenRsrcRole.add(id);
    pushRow(T_RSRCROLE, row);
  };
  const pushCurrUnique = (row: Record<string, P6Scalar>) => {
    const id = row['curr_id'] as number;
    if (!Number.isFinite(id) || seenCurr.has(id)) return;
    seenCurr.add(id);
    pushRow(T_CURRTYPE, row);
  };
  const seenClndr = new Set<number>();
  const pushClndrUnique = (row: Record<string, P6Scalar>) => {
    const id = row['clndr_id'] as number;
    if (!Number.isFinite(id) || seenClndr.has(id)) return;
    seenClndr.add(id);
    pushRow(T_CALENDAR, row);
  };


  const allProjects = Array.from(xml.getElementsByTagName('Project'));
  const projects = allProjects.filter(p =>
    p.getElementsByTagName('WBS').length > 0 ||
    p.getElementsByTagName('Activity').length > 0 ||
    p.getElementsByTagName('ActivityDefaultDurationType').length > 0
  );

  

  for (const p of projects) {
    const projIdStr = xmlAttr(p, 'ObjectId') || xmlText(p, 'ObjectId');
    const projIdNum = Number(projIdStr);
    if (!Number.isFinite(projIdNum)) {
      console.warn('[P6-XML] Пропущен PROJECT без валидного ObjectId', { projIdStr });
      continue;
    }



    // PROJECT
    const row: Record<string, P6Scalar> = {
      proj_id: projIdNum,
      proj_short_name: xmlText(p, 'Id'),
      proj_url: xmlText(p, 'WebUrl'),
      guid: xmlText(p, 'GUID') || xmlText(p, 'Guid'),
      plan_start_date: xmlDate(p, 'PlannedStartDate') || xmlDate(p, 'StartDate'),
      plan_end_date: xmlDate(p, 'PlannedFinishDate') || xmlDate(p, 'FinishDate'),
      scd_end_date: xmlDate(p, 'ScheduledFinishDate'),
      fcst_start_date: xmlDate(p, 'ForecastStartDate'),
      add_date: xmlDate(p, 'CreateDate'),
      add_by_name: xmlText(p, 'CreateUser'),
      last_baseline_update_date: xmlDate(p, 'LastBaselineUpdateDate'),
      last_level_date: xmlDate(p, 'LastLevelDate'),
      base_currency: xmlText(p, 'BaseCurrency') || doc.header?.baseCurrency || '',
      data_date: xmlDate(p, 'DataDate'),
      name: xmlText(p, 'Name'),
      status: xmlText(p, 'Status'),
    };
    pushRow(T_PROJECT, row);

    // TASK (+ TASKPRED внутри Activity)
    const actNodes = Array.from(p.getElementsByTagName('Activity'));
    for (const a of actNodes) {
      const taskRow = mapActivityToTaskRow(a, projIdNum);
      if (!Number.isFinite(taskRow['task_id'] as number)) {
        console.warn('[P6-XML] Пропущена TASK без валидного task_id', taskRow);
        continue;
      }
      pushRow(T_TASK, taskRow as Record<string, P6Scalar>);

      // связи-предшественники
      const preds = Array.from(a.getElementsByTagName('PredecessorLink'));
      for (const link of preds) {
        const pr = mapPredLinkToTaskpredRow(link, projIdNum, taskRow['task_id'] as number);
        if (pr) pushRow(T_TASKPRED, pr);
      }
    }

    const relNodes = Array.from(p.getElementsByTagName('Relationship'));
    for (const rel of relNodes) {
      const pr = mapPredLinkToTaskpredRow(rel, projIdNum, null);
      if (pr)  pushRow(T_TASKPRED, pr);
    }

    // WBS
    const wbsNodes = Array.from(p.getElementsByTagName('WBS'));
    for (const w of wbsNodes) {
      const wbsRow = mapWbsToProjwbsRow(w, projIdNum);
      pushRow(T_PROJWBS, wbsRow);
    }

    const rsrcNodes = Array.from(p.getElementsByTagName('Resource'));
    for (const r of rsrcNodes) {
      const rr = mapResourceToRsrcRow(r, projIdNum);
      if (rr) pushRsrcUnique(rr);
    
      const rRoles = Array.from(r.getElementsByTagName('ResourceRole'));
      for (const rRole of rRoles) {
        const rrr = mapResourceRoleToRsrcroleRow(rRole, rr?.['rsrc_id'] as number);
        if (rrr) pushRsrcRoleUnique(rrr);
      }
    }

    // CALENDAR — календари проекта
    const calNodes = Array.from(p.getElementsByTagName('Calendar'));
    for (const c of calNodes) {
      const cr = mapCalendarToCalendarRow(c, projIdNum);
      if (cr) pushClndrUnique(cr);
    }

    // TASKRSRC — назначения ресурсов
    const raNodes = Array.from(p.getElementsByTagName('ResourceAssignment'));
    for (const ra of raNodes) {
      const tr = mapResAssignToTaskrsrcRow(ra, projIdNum);
      if (tr) pushRow(T_TASKRSRC, tr);
    }
    
  }

  // ===== ГЛОБАЛЬНЫЕ RSRC (корневой уровень) =====
  const globalRsrc = Array.from(xml.getElementsByTagName('Resource'));
  for (const r of globalRsrc) {
    const rr = mapResourceToRsrcRow(r, /* projId */ NaN);
    if (rr) pushRsrcUnique(rr);

    // на случай, если роли вложены внутрь Resource на корне
    const rRoles = Array.from(r.getElementsByTagName('ResourceRole'));
    for (const rRole of rRoles) {
      const rrr = mapResourceRoleToRsrcroleRow(rRole, rr?.['rsrc_id'] as number);
      if (rrr) pushRsrcRoleUnique(rrr);
    }
  }

  // ===== ГЛОБАЛЬНЫЕ RSRCROLE (если идут отдельным списком) =====
  const globalRsrcRoles = Array.from(xml.getElementsByTagName('ResourceRole'));
  for (const rr of globalRsrcRoles) {
    const row = mapResourceRoleToRsrcroleRow(rr, null);
    if (row) pushRsrcRoleUnique(row);
  }

  // ===== ГЛОБАЛЬНЫЕ CALENDAR (корневой уровень) =====
  const globalCalendars = Array.from(xml.getElementsByTagName('Calendar'));
  for (const c of globalCalendars) {
    const row = mapCalendarToCalendarRow(c, null);
    if (row) pushClndrUnique(row);
  }

  // ===== ГЛОБАЛЬНЫЕ CURRTYPE (Currency) =====
  const curNodes = Array.from(xml.getElementsByTagName('Currency'));
  for (const cu of curNodes) {
    const row = mapCurrencyToCurrtypeRow(cu);
    if (row) pushCurrUnique(row);
  }


  // регистрируем таблицы
  doc.tables[T_PROJECT.name]  = T_PROJECT;
  doc.tables[T_PROJWBS.name]  = T_PROJWBS;
  doc.tables[T_TASK.name]     = T_TASK;
  doc.tables[T_TASKPRED.name] = T_TASKPRED;
  doc.tables[T_TASKRSRC.name] = T_TASKRSRC;
  doc.tables[T_RSRC.name]     = T_RSRC;
  doc.tables[T_RSRCROLE.name] = T_RSRCROLE;
  doc.tables[T_CURRTYPE.name] = T_CURRTYPE;
  doc.tables[T_CALENDAR.name] = T_CALENDAR;

  // SUMMARIZE
  doc.tables['SUMMARIZE'] = buildSummarizeTableLocal(doc);
  return doc;
}
