import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { parseXER, summarize, buildSummarizeTable, XERTable, XERScalar, XERDocument } from './parser';
import { XerDexieService } from './dexie.service';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class XerLoaderService {
  private readonly http = inject(HttpClient);
  private readonly dexie = inject(XerDexieService);

  /**
   * Универсальная загрузка из assets:
   * - Сначала пытается открыть XML (assets/p6/project.xml),
   * - при ошибке — XER (assets/xer/project.xer).
   * Парсит, сохраняет в IndexedDB (Dexie) и печатает сводки.
   */
  async loadAndLogFromAssets(): Promise<void> {
    const xmlPath = 'assets/p6/project.xml';
    const xerPath = 'assets/xer/project.xer';

    let text: string | null = null;
    let isXml = false;

    // 1) Пробуем XML
    try {
      text = await firstValueFrom(this.http.get(xmlPath, { responseType: 'text' }));
      isXml = true;
    } catch {
      // 2) Фоллбэк на XER
      text = await firstValueFrom(this.http.get(xerPath, { responseType: 'text' }));
      isXml = false;
    }

    if (!text || text.length === 0) {
      throw new Error(`Файл не прочитан: ${xmlPath} или ${xerPath}`);
    }

    const doc = isXml ? parseP6XML(text) : parseXER(text);
    await this.dexie.saveDocument(doc);

    // Сводки/логи
    console.group(isXml ? '[P6-XML] Сводка' : '[XER] Сводка');
    console.log(summarize(doc));
    console.groupEnd();

    console.group(isXml ? '[P6-XML] Header' : '[XER] Header');
    console.log(JSON.stringify(doc.header, null, 2));
    console.groupEnd();

    console.group(isXml ? '[P6-XML] Таблицы (JSON)' : '[XER] Таблицы (JSON)');
    // Явно указываем тип значений, чтобы избежать TS18046 ('unknown').
    const tables = Object.values(doc.tables as Record<string, { name: string; fields: string[]; rows: unknown[] }>);
    for (const table of tables) {
      console.group(table.name);
      console.log(JSON.stringify(
        { name: table.name, fields: table.fields, rows: table.rows },
        replacerDates,
        2
      ));
      console.groupEnd();
    }
    console.groupEnd();
  }

  /**
   * Полная очистка всех таблиц в IndexedDB (Dexie).
   */
  async resetDb(): Promise<void> {
    await this.dexie.clear();
  }

  /**
   * Загрузить файл пользователя (.xer ИЛИ .xml), распарсить и сохранить таблицы в IndexedDB (Dexie).
   * Жёсткая проверка расширения и пустоты содержимого.
   */
  async loadFromFile(file: File): Promise<void> {
    await this.dexie.clear();

    const name = file?.name ?? '';
    const lower = name.toLowerCase();

    if (!(lower.endsWith('.xer') || lower.endsWith('.xml'))) {
      throw new Error(`Поддерживаются только файлы с расширениями .xer и .xml (получен: "${name}")`);
    }

    const text = await file.text();
    if (!text || text.length === 0) {
      throw new Error('Файл пустой или не удалось прочитать содержимое.');
    }

    const isXml = lower.endsWith('.xml');
    const doc = isXml ? parseP6XML(text) : parseXER(text);
    await this.dexie.saveDocument(doc);

    console.group(isXml ? '[P6-XML] Загрузка из файла' : '[XER] Загрузка из файла');
    console.log('File:', name);
    console.log(summarize(doc));
    console.groupEnd();
  }
}

function replacerDates(_key: string, value: unknown) {
  return value instanceof Date ? value.toISOString() : (value as any);
}

// ============================ P6 XML PARSER =============================
// Реализация парсера P6 XML в структуру XERDocument-подобных таблиц.
// Не конфликтует с имеющимися именами — хелперы имеют префикс P6.

function p6XmlText(el: Element | null, tag: string): string {
  if (!el) return '';
  const child = el.getElementsByTagName(tag)[0];
  return child?.textContent?.trim() ?? '';
}
function p6XmlNum(el: Element | null, tag: string): number | null {
  const s = p6XmlText(el, tag);
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function p6XmlDate(el: Element | null, tag: string): Date | null {
  const s = p6XmlText(el, tag);
  if (!s) return null;
  const iso = s.includes('T') ? s : (s.length === 10 ? `${s}T00:00:00` : s.replace(' ', 'T'));
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}
function p6PushRow(tbl: XERTable, row: Record<string, XERScalar>): void {
  for (const k of Object.keys(row)) {
    if (!tbl.fields.includes(k)) tbl.fields.push(k);
  }
  tbl.rows.push(row);
}

export function parseP6XML(input: string): XERDocument {
  const parser = new DOMParser();
  const xml = parser.parseFromString(input, 'application/xml');
  const err = xml.getElementsByTagName('parsererror')[0];
  if (err) {
    throw new Error('Некорректный P6 XML: parsererror');
  }

  const doc: XERDocument = { header: null, tables: {} };

  const projectsRoot = xml.getElementsByTagName('Projects')[0] || xml.documentElement;
  const exportDate = projectsRoot.getAttribute('ExportDate') || '';
  const productVersion = projectsRoot.getAttribute('Version') || projectsRoot.getAttribute('xmlns') || '';
  const baseCurrency = projectsRoot.getAttribute('BaseCurrency') || '';

  doc.header = {
    raw: null,
    productVersion,
    exportDate,
    projectOrContext: xml.getElementsByTagName('Project')[0]?.getElementsByTagName('Id')[0]?.textContent ?? '',
    userLogin: '',
    userFullNameOrRole: '',
    database: '',
    moduleName: 'P6-XML',
    baseCurrency,
  };

  const T_PROJECT: XERTable = { name: 'PROJECT', fields: [], rows: [] };
  const T_WBS: XERTable = { name: 'WBS', fields: [], rows: [] };
  const T_TASK: XERTable = { name: 'TASK', fields: [], rows: [] };
  const T_TASKRSRC: XERTable = { name: 'TASKRSRC', fields: [], rows: [] };
  const T_RSRC: XERTable = { name: 'RSRC', fields: [], rows: [] };
  const T_FINPER: XERTable = { name: 'FINANCIAL_PERIOD', fields: [], rows: [] };
  const T_PERIOD_ACT: XERTable = { name: 'PERIOD_ACT', fields: [], rows: [] };

  const projects = Array.from(xml.getElementsByTagName('Project'));
  for (const p of projects) {
    const prow: Record<string, XERScalar> = {
      proj_id: p6XmlText(p, 'ObjectId') || p6XmlText(p, 'Id'),
      proj_short_name: p6XmlText(p, 'Id'),
      proj_url: p6XmlText(p, 'WebUrl'),
      guid: p6XmlText(p, 'GUID') || p6XmlText(p, 'Guid'),
      plan_start_date: p6XmlDate(p, 'PlannedStartDate') || p6XmlDate(p, 'StartDate'),
      plan_end_date: p6XmlDate(p, 'PlannedFinishDate') || p6XmlDate(p, 'FinishDate'),
      scd_end_date: p6XmlDate(p, 'ScheduledFinishDate'),
      fcst_start_date: p6XmlDate(p, 'ForecastStartDate'),
      add_date: p6XmlDate(p, 'CreateDate'),
      add_by_name: p6XmlText(p, 'CreateUser'),
      last_baseline_update_date: p6XmlDate(p, 'LastBaselineUpdateDate'),
      last_level_date: p6XmlDate(p, 'LastLevelDate'),
      base_currency: p6XmlText(p, 'BaseCurrency') || (doc.header?.baseCurrency ?? ''),
      data_date: p6XmlDate(p, 'DataDate'),
      name: p6XmlText(p, 'Name'),
      status: p6XmlText(p, 'Status'),
    };
    p6PushRow(T_PROJECT, prow);
    const currentProjId = (prow['proj_id'] ?? '') as string;

    const wbsNodes = Array.from(p.getElementsByTagName('WBS'));
    for (const w of wbsNodes) {
      const wr: Record<string, XERScalar> = {
        proj_id: currentProjId,
        wbs_obj_id: p6XmlText(w, 'ObjectId'),
        wbs_id: p6XmlText(w, 'Code') || p6XmlText(w, 'Id'),
        wbs_name: p6XmlText(w, 'Name'),
        parent_wbs_obj_id: p6XmlText(w, 'ParentObjectId'),
        seq_num: p6XmlNum(w, 'SequenceNumber'),
      };
      p6PushRow(T_WBS, wr);
    }

    const rsrcNodes = Array.from(p.getElementsByTagName('Resource'));
    for (const r of rsrcNodes) {
      const rr: Record<string, XERScalar> = {
        proj_id: currentProjId,
        rsrc_obj_id: p6XmlText(r, 'ObjectId'),
        rsrc_id: p6XmlText(r, 'Id'),
        rsrc_name: p6XmlText(r, 'Name'),
        rsrc_type: p6XmlText(r, 'Type'),
        unit_price: p6XmlNum(r, 'PricePerUnit'),
        default_units_per_time: p6XmlNum(r, 'DefaultUnitsPerTime'),
      };
      p6PushRow(T_RSRC, rr);
    }

    const actNodes = Array.from(p.getElementsByTagName('Activity'));
    for (const a of actNodes) {
      const tr: Record<string, XERScalar> = {
        proj_id: currentProjId,
        task_obj_id: p6XmlText(a, 'ObjectId'),
        task_id: p6XmlText(a, 'Id'),
        task_name: p6XmlText(a, 'Name'),
        wbs_obj_id: p6XmlText(a, 'WBSObjectId'),
        start_date: p6XmlDate(a, 'StartDate'),
        finish_date: p6XmlDate(a, 'FinishDate'),
        planned_start_date: p6XmlDate(a, 'PlannedStartDate'),
        planned_finish_date: p6XmlDate(a, 'PlannedFinishDate'),
        remaining_duration: p6XmlNum(a, 'RemainingDuration'),
        percent_complete_type: p6XmlText(a, 'PercentCompleteType'),
        phys_complete_pct: p6XmlNum(a, 'PhysicalPercentComplete'),
        complete_pct: p6XmlNum(a, 'PercentComplete'),
        calendar_id: p6XmlText(a, 'CalendarObjectId'),
      };
      p6PushRow(T_TASK, tr);
    }

    const raNodes = Array.from(p.getElementsByTagName('ResourceAssignment'));
    for (const ra of raNodes) {
      const rar: Record<string, XERScalar> = {
        proj_id: currentProjId,
        task_obj_id: p6XmlText(ra, 'ActivityObjectId'),
        rsrc_obj_id: p6XmlText(ra, 'ResourceObjectId'),
        role_obj_id: p6XmlText(ra, 'RoleObjectId'),
        budget_qty: p6XmlNum(ra, 'BudgetedUnits'),
        target_qty: p6XmlNum(ra, 'BudgetedUnits'),
        act_qty: p6XmlNum(ra, 'ActualUnits'),
        remain_qty: p6XmlNum(ra, 'RemainingUnits'),
        at_completion_qty: p6XmlNum(ra, 'AtCompletionUnits'),
        unit_price: p6XmlNum(ra, 'Rate'),
        budget_cost: p6XmlNum(ra, 'BudgetedCost'),
        target_cost: p6XmlNum(ra, 'BudgetedCost'),
        act_total_cost: p6XmlNum(ra, 'ActualCost'),
        remain_cost: p6XmlNum(ra, 'RemainingCost'),
        at_completion_total_cost: p6XmlNum(ra, 'AtCompletionCost'),
        cost_account: p6XmlText(ra, 'CostAccountId') || p6XmlText(ra, 'CostAccountObjectId'),
      };
      p6PushRow(T_TASKRSRC, rar);

      const ppNodes = Array.from(ra.getElementsByTagName('PeriodPerformance'));
      for (const pp of ppNodes) {
        const periods = Array.from(pp.getElementsByTagName('Period'));
        for (const per of periods) {
          const pr: Record<string, XERScalar> = {
            proj_id: currentProjId,
            task_obj_id: p6XmlText(ra, 'ActivityObjectId'),
            rsrc_obj_id: p6XmlText(ra, 'ResourceObjectId'),
            period_name: p6XmlText(per, 'Name'),
            period_start: p6XmlDate(per, 'StartDate'),
            period_finish: p6XmlDate(per, 'FinishDate'),
            act_units: p6XmlNum(per, 'ActualUnits'),
            act_cost: p6XmlNum(per, 'ActualCost'),
            bcwp_cost: p6XmlNum(per, 'EarnedCost') ?? null,
            bcws_cost: p6XmlNum(per, 'PlannedCost') ?? null,
          };
          p6PushRow(T_PERIOD_ACT, pr);
        }
      }

      const spreadNodes = Array.from(ra.getElementsByTagName('SpreadPeriod'));
      for (const sp of spreadNodes) {
        const spr: Record<string, XERScalar> = {
          proj_id: currentProjId,
          task_obj_id: p6XmlText(ra, 'ActivityObjectId'),
          rsrc_obj_id: p6XmlText(ra, 'ResourceObjectId'),
          period_start: p6XmlDate(sp, 'StartDate'),
          period_finish: p6XmlDate(sp, 'FinishDate'),
          plan_units: p6XmlNum(sp, 'PlannedUnits'),
          plan_cost: p6XmlNum(sp, 'PlannedCost'),
          act_units: p6XmlNum(sp, 'ActualUnits'),
          act_cost: p6XmlNum(sp, 'ActualCost'),
        };
        const nm = p6XmlText(sp, 'Name');
        if (nm) spr['period_name'] = nm;
        p6PushRow(T_PERIOD_ACT, spr);
      }
    }

    const fpNodes = Array.from(p.getElementsByTagName('FinancialPeriod'));
    for (const fp of fpNodes) {
      const fpr: Record<string, XERScalar> = {
        proj_id: currentProjId,
        finper_obj_id: p6XmlText(fp, 'ObjectId') || p6XmlText(fp, 'Id'),
        name: p6XmlText(fp, 'Name'),
        start_date: p6XmlDate(fp, 'StartDate'),
        end_date: p6XmlDate(fp, 'FinishDate') || p6XmlDate(fp, 'EndDate'),
      };
      p6PushRow(T_FINPER, fpr);
    }
  }

  doc.tables[T_PROJECT.name] = T_PROJECT;
  doc.tables[T_WBS.name] = T_WBS;
  doc.tables[T_TASK.name] = T_TASK;
  doc.tables[T_TASKRSRC.name] = T_TASKRSRC;
  doc.tables[T_RSRC.name] = T_RSRC;
  doc.tables[T_FINPER.name] = T_FINPER;
  doc.tables[T_PERIOD_ACT.name] = T_PERIOD_ACT;

  // Предполагаем, что buildSummarizeTable уже объявлен выше в этом модуле.
  doc.tables['SUMMARIZE'] = buildSummarizeTable(doc);
  return doc;
}