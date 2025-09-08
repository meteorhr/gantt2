// Самодостаточный парсер XER и P6 XML (Primavera P6) для браузера/Angular.

export type XERScalar = string | number | Date | null | undefined;

export interface XERHeader {
  raw: string[] | null;      // для XER — исходная строка ERMHDR; для XML — null
  productVersion?: string;
  exportDate?: string;
  projectOrContext?: string;
  userLogin?: string;
  userFullNameOrRole?: string;
  database?: string;
  moduleName?: string;
  baseCurrency?: string;
}

export interface XERTable {
  name: string;
  fields: string[];
  rows: Record<string, XERScalar>[];
}

export interface XERDocument {
  header: XERHeader | null;
  tables: Record<string, XERTable>;
}

export interface ParseOptions {
  coerceNumbers: boolean;
  coerceDates: boolean;
  trimCells: boolean;
  keepEmptyAsNull: boolean;
}

const TAB = "\t";
const RX_DATE = /^\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})?$/;

function isNumberLike(s: string): boolean {
  return /^-?\d+(?:\.\d+)?$/.test(s);
}

function safeFieldName(name: string): string {
  return name.replace(/\s+/g, "_").replace(/[^\w\-]/g, "");
}

function coerceScalar(raw: string, opt: ParseOptions): XERScalar {
  const s = opt.trimCells ? raw.trim() : raw;
  if (opt.keepEmptyAsNull && s.length === 0) return null;

  if (opt.coerceNumbers && isNumberLike(s)) {
    const n = Number(s);
    if (!Number.isNaN(n)) return n;
  }
  if (opt.coerceDates && RX_DATE.test(s)) {
    const dt = new Date(s.replace(" ", "T"));
    if (!isNaN(dt.getTime())) return dt;
  }
  return s;
}

export function parseXER(input: string, options?: Partial<ParseOptions>): XERDocument {
  const opt: ParseOptions = {
    coerceNumbers: true,
    coerceDates: true,
    trimCells: true,
    keepEmptyAsNull: true,
    ...options,
  };

  const lines = input.split(/\r?\n/);
  const doc: XERDocument = { header: null, tables: {} };

  let currentTable: XERTable | null = null;
  let currentFields: string[] = [];

  for (const rawLine of lines) {
    if (!rawLine || /^\s*$/.test(rawLine)) continue; // пустые/пробельные строки пропускаем

    // ERMHDR (допускаем ведущие пробелы)
    if (/^\s*ERMHDR/.test(rawLine)) {
      const parts = rawLine.trimStart().split(TAB);
      doc.header = {
        raw: parts,
        productVersion: parts[1],
        exportDate: parts[2],
        projectOrContext: parts[3],
        userLogin: parts[4],
        userFullNameOrRole: parts[5],
        database: parts[6],
        moduleName: parts[7],
        baseCurrency: parts[8],
      };
      continue;
    }

    // %T  — начало таблицы
    const mT = rawLine.match(/^\s*%T\t(.+)$/);
    if (mT) {
      const name = mT[1].trim();
      if (!doc.tables[name]) doc.tables[name] = { name, fields: [], rows: [] };
      currentTable = doc.tables[name];
      currentFields = [];
      continue;
    }

    // %F — список полей
    const mF = rawLine.match(/^\s*%F\t(.+)$/);
    if (mF) {
      if (!currentTable) throw new Error(`Поля без активной таблицы: ${rawLine}`);
      currentFields = mF[1].split(TAB).map(f => safeFieldName(opt.trimCells ? f.trim() : f));
      currentTable.fields = currentFields.slice();
      continue;
    }

    // %R — запись
    const mR = rawLine.match(/^\s*%R\t(.+)$/);
    if (mR) {
      if (!currentTable) throw new Error(`Запись без активной таблицы: ${rawLine}`);
      if (currentFields.length === 0) throw new Error(`В "${currentTable.name}" запись до %F.`);
      const values = mR[1].split(TAB);
      const row: Record<string, XERScalar> = {};
      const width = Math.min(values.length, currentFields.length);
      for (let i = 0; i < width; i++) row[currentFields[i]] = coerceScalar(values[i], opt);
      for (let i = width; i < currentFields.length; i++) {
        row[currentFields[i]] = opt.keepEmptyAsNull ? null : '';
      }
      currentTable.rows.push(row);
      continue;
    }

    // %E — конец файла
    if (/^\s*%E/.test(rawLine)) break;
  }

  // Добавим служебную таблицу SUMMARIZE
  doc.tables['SUMMARIZE'] = buildSummarizeTable(doc);
  return doc;
}

/* ============================ P6 XML ============================= */

function xmlText(el: Element | null, tag: string): string {
  if (!el) return '';
  const child = el.getElementsByTagName(tag)[0];
  return child?.textContent?.trim() ?? '';
}
function xmlNum(el: Element | null, tag: string): number | null {
  const s = xmlText(el, tag);
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function xmlDate(el: Element | null, tag: string): Date | null {
  const s = xmlText(el, tag);
  if (!s) return null;
  const iso = s.includes('T') ? s : s.length === 10 ? `${s}T00:00:00` : s.replace(' ', 'T');
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}
function pushRow(tbl: XERTable, row: Record<string, XERScalar>): void {
  // гарантируем поля
  for (const k of Object.keys(row)) {
    if (!tbl.fields.includes(k)) tbl.fields.push(k);
  }
  tbl.rows.push(row);
}

/**
 * Парсер P6 XML -> XERDocument-подобная структура (header + tables).
 * Поддерживает ключевые сущности: PROJECT, WBS, TASK (Activities), TASKRSRC (ResourceAssignments),
 * RSRC (Resources), FINANCIAL_PERIOD, PERIOD_ACT (Stored Periods/Time-Phased при наличии).
 */
export function parseP6XML(input: string): XERDocument {
  const parser = new DOMParser();
  const xml = parser.parseFromString(input, 'application/xml');

  // Проверка на ошибки парсинга
  const err = xml.getElementsByTagName('parsererror')[0];
  if (err) {
    throw new Error('Некорректный P6 XML: parsererror');
  }

  const doc: XERDocument = { header: null, tables: {} };

  // Заголовок (пытаемся вытащить максимум доступного)
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

  // Таблицы-коллекторы
  const T_PROJECT: XERTable = { name: 'PROJECT', fields: [], rows: [] };
  const T_WBS: XERTable = { name: 'WBS', fields: [], rows: [] };
  const T_TASK: XERTable = { name: 'TASK', fields: [], rows: [] };
  const T_TASKRSRC: XERTable = { name: 'TASKRSRC', fields: [], rows: [] };
  const T_RSRC: XERTable = { name: 'RSRC', fields: [], rows: [] };
  const T_FINPER: XERTable = { name: 'FINANCIAL_PERIOD', fields: [], rows: [] };
  const T_PERIOD_ACT: XERTable = { name: 'PERIOD_ACT', fields: [], rows: [] }; // time-phased actuals/units/cost (если присутствуют)

  

  // ====== PROJECTS / PROJECT ======
  const projects = Array.from(xml.getElementsByTagName('Project'));
  for (const p of projects) {
    const row: Record<string, XERScalar> = {
      proj_id: xmlText(p, 'ObjectId'),
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
    const currentProjId = (row['proj_id'] ?? '') as string;
 

    // ====== WBS ======
    const wbsNodes = Array.from(p.getElementsByTagName('WBS'));
    for (const w of wbsNodes) {
      const wr: Record<string, XERScalar> = {
        proj_id: currentProjId,
        wbs_obj_id: xmlText(w, 'ObjectId'),
        wbs_id: xmlText(w, 'Code') || xmlText(w, 'Id'),
        wbs_name: xmlText(w, 'Name'),
        parent_wbs_obj_id: xmlText(w, 'ParentObjectId'),
        seq_num: xmlNum(w, 'SequenceNumber'),
      };
      pushRow(T_WBS, wr);
    }

    // ====== RESOURCES ======
    const rsrcNodes = Array.from(p.getElementsByTagName('Resource'));
    for (const r of rsrcNodes) {
      const rr: Record<string, XERScalar> = {
        proj_id: currentProjId,
        rsrc_obj_id: xmlText(r, 'ObjectId'),
        rsrc_id: xmlText(r, 'Id'),
        rsrc_name: xmlText(r, 'Name'),
        rsrc_type: xmlText(r, 'Type'),
        unit_price: xmlNum(r, 'PricePerUnit'),
        default_units_per_time: xmlNum(r, 'DefaultUnitsPerTime'),
      };
      pushRow(T_RSRC, rr);
    }

    // ====== ACTIVITIES (TASK) ======
    const actNodes = Array.from(p.getElementsByTagName('Activity'));
    for (const a of actNodes) {
      const tr: Record<string, XERScalar> = {
        proj_id: currentProjId,
        task_obj_id: xmlText(a, 'ObjectId'),
        task_id: xmlText(a, 'Id'),
        task_name: xmlText(a, 'Name'),
        wbs_obj_id: xmlText(a, 'WBSObjectId'),
        start_date: xmlDate(a, 'StartDate'),
        finish_date: xmlDate(a, 'FinishDate'),
        planned_start_date: xmlDate(a, 'PlannedStartDate'),
        planned_finish_date: xmlDate(a, 'PlannedFinishDate'),
        remaining_duration: xmlNum(a, 'RemainingDuration'),
        percent_complete_type: xmlText(a, 'PercentCompleteType'),
        phys_complete_pct: xmlNum(a, 'PhysicalPercentComplete'),
        complete_pct: xmlNum(a, 'PercentComplete'),
        calendar_id: xmlText(a, 'CalendarObjectId'),
      };
      pushRow(T_TASK, tr);
    }

    // ====== RESOURCE ASSIGNMENTS (TASKRSRC) ======
    const raNodes = Array.from(p.getElementsByTagName('ResourceAssignment'));
    for (const ra of raNodes) {
      const rar: Record<string, XERScalar> = {
        proj_id: currentProjId,
        task_obj_id: xmlText(ra, 'ActivityObjectId'),
        rsrc_obj_id: xmlText(ra, 'ResourceObjectId'),
        role_obj_id: xmlText(ra, 'RoleObjectId'),
        budget_qty: xmlNum(ra, 'BudgetedUnits'),
        target_qty: xmlNum(ra, 'BudgetedUnits'), // синоним для совместимости
        act_qty: xmlNum(ra, 'ActualUnits'),
        remain_qty: xmlNum(ra, 'RemainingUnits'),
        at_completion_qty: xmlNum(ra, 'AtCompletionUnits'),
        unit_price: xmlNum(ra, 'Rate'),
        budget_cost: xmlNum(ra, 'BudgetedCost'),
        target_cost: xmlNum(ra, 'BudgetedCost'), // синоним
        act_total_cost: xmlNum(ra, 'ActualCost'),
        remain_cost: xmlNum(ra, 'RemainingCost'),
        at_completion_total_cost: xmlNum(ra, 'AtCompletionCost'),
        cost_account: xmlText(ra, 'CostAccountId') || xmlText(ra, 'CostAccountObjectId'),
      };
      pushRow(T_TASKRSRC, rar);

      // ====== TIME-PHASED / STORED PERIOD PERFORMANCE (если присутствует в XML) ======
      // В разных выгрузках Oracle структура может отличаться. Обрабатываем два распространённых варианта:
      // 1) Вложенные узлы <PeriodPerformance><Period>...</Period></PeriodPerformance>
      // 2) Узлы <SpreadPeriod> внутри <Spread> или <TimeDistributedData>
      const ppNodes = Array.from(ra.getElementsByTagName('PeriodPerformance'));
      for (const pp of ppNodes) {
        const periods = Array.from(pp.getElementsByTagName('Period'));
        for (const per of periods) {
          const pr: Record<string, XERScalar> = {
            proj_id: currentProjId,
            task_obj_id: xmlText(ra, 'ActivityObjectId'),
            rsrc_obj_id: xmlText(ra, 'ResourceObjectId'),
            period_name: xmlText(per, 'Name'),
            period_start: xmlDate(per, 'StartDate'),
            period_finish: xmlDate(per, 'FinishDate'),
            act_units: xmlNum(per, 'ActualUnits'),
            act_cost: xmlNum(per, 'ActualCost'),
            bcwp_cost: xmlNum(per, 'EarnedCost') ?? null,
            bcws_cost: xmlNum(per, 'PlannedCost') ?? null,
          };
          pushRow(T_PERIOD_ACT, pr);
        }
      }
      // Fallback: SpreadPeriod
      const spreadNodes = Array.from(ra.getElementsByTagName('SpreadPeriod'));
      for (const sp of spreadNodes) {
        const spr: Record<string, XERScalar> = {
          proj_id: currentProjId,
          task_obj_id: xmlText(ra, 'ActivityObjectId'),
          rsrc_obj_id: xmlText(ra, 'ResourceObjectId'),
          period_start: xmlDate(sp, 'StartDate'),
          period_finish: xmlDate(sp, 'FinishDate'),
          plan_units: xmlNum(sp, 'PlannedUnits'),
          plan_cost: xmlNum(sp, 'PlannedCost'),
          act_units: xmlNum(sp, 'ActualUnits'),
          act_cost: xmlNum(sp, 'ActualCost'),
        };
        // Чтобы таблица была «узкой», добавим поле period_name, если есть
        const nm = xmlText(sp, 'Name');
        if (nm) spr['period_name'] = nm;
        pushRow(T_PERIOD_ACT, spr);
      }
    }

    // ====== FINANCIAL PERIODS (если раздел присутствует) ======
    const fpNodes = Array.from(p.getElementsByTagName('FinancialPeriod'));
    for (const fp of fpNodes) {
      const fpr: Record<string, XERScalar> = {
        proj_id: currentProjId,
        finper_obj_id: xmlText(fp, 'ObjectId') || xmlText(fp, 'Id'),
        name: xmlText(fp, 'Name'),
        start_date: xmlDate(fp, 'StartDate'),
        end_date: xmlDate(fp, 'FinishDate') || xmlDate(fp, 'EndDate'),
      };
      pushRow(T_FINPER, fpr);
    }
  }

  // Регистрируем таблицы, даже если они пустые (для предсказуемости структуры)
  doc.tables[T_PROJECT.name] = T_PROJECT;
  doc.tables[T_WBS.name] = T_WBS;
  doc.tables[T_TASK.name] = T_TASK;
  doc.tables[T_TASKRSRC.name] = T_TASKRSRC;
  doc.tables[T_RSRC.name] = T_RSRC;
  doc.tables[T_FINPER.name] = T_FINPER;
  doc.tables[T_PERIOD_ACT.name] = T_PERIOD_ACT;

  // Служебная сводка
  doc.tables['SUMMARIZE'] = buildSummarizeTable(doc);
  return doc;
}

/* ============================ SUMMARIZE ========================== */

export function summarize(doc: XERDocument): string {
  const out: string[] = [];
  out.push("=== HEADER ===");
  if (doc.header) {
    out.push(
      `Version: ${doc.header.productVersion ?? ""}`,
      `Export date: ${doc.header.exportDate ?? ""}`,
      `Context: ${doc.header.projectOrContext ?? ""}`,
      `User: ${doc.header.userLogin ?? ""} (${doc.header.userFullNameOrRole ?? ""})`,
      `DB: ${doc.header.database ?? ""}`,
      `Module: ${doc.header.moduleName ?? ""}`,
      `Base currency: ${doc.header.baseCurrency ?? ""}`,
    );
  } else {
    out.push("— отсутствует —");
  }
  out.push("\n=== Таблицы ===");
  for (const t of Object.values(doc.tables)) out.push(`${t.name}: ${t.rows.length} строк, ${t.fields.length} полей`);
  return out.join("\n");
}

export interface XERSummaryItem {
  name: string;
  i18n: string;           // ключ для заголовка
  value: string;          // текстовое значение (для хедера остаётся как есть)
  i18nValue?: string;     // ключ шаблона значения (для таблиц)
  params?: Record<string, unknown>; // параметры для i18n шаблона
}

export function summarizeArray(doc: XERDocument): XERSummaryItem[] {
  const arr: XERSummaryItem[] = [];
  if (doc.header) {
    arr.push({ name: 'version', i18n: 'summarize.version', value: doc.header.productVersion ?? '' });
    arr.push({ name: 'exportDate', i18n: 'summarize.exportDate', value: doc.header.exportDate ?? '' });
    arr.push({ name: 'context', i18n: 'summarize.context', value: doc.header.projectOrContext ?? '' });
    arr.push({ name: 'user', i18n: 'summarize.user', value: `${doc.header.userLogin ?? ''} (${doc.header.userFullNameOrRole ?? ''})` });
    arr.push({ name: 'db', i18n: 'summarize.db', value: doc.header.database ?? '' });
    arr.push({ name: 'module', i18n: 'summarize.module', value: doc.header.moduleName ?? '' });
    arr.push({ name: 'baseCurrency', i18n: 'summarize.baseCurrency', value: doc.header.baseCurrency ?? '' });
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

/** Построить XER-таблицу SUMMARIZE из summarizeArray (params сериализуем в JSON-строку) */
export function buildSummarizeTable(doc: XERDocument): XERTable {
  const items = summarizeArray(doc);
  const fields = ['name', 'i18n', 'value', 'i18nValue', 'params'];
  const rows = items.map(it => ({
    name: it.name,
    i18n: it.i18n,
    value: it.value ?? '',
    i18nValue: it.i18nValue ?? '',
    params: it.params ? JSON.stringify(it.params) : '',
  })) as Record<string, XERScalar>[];
  return { name: 'SUMMARIZE', fields, rows };
}

/* ------------------------------------------------------------------ */
/*                УДОБНЫЕ ХЕЛПЕРЫ ДЛЯ ПОЛУЧЕНИЯ ТАБЛИЦ                */
/* ------------------------------------------------------------------ */

function norm(name: string): string {
  return name.trim().toUpperCase();
}

/** Возвращает таблицу по имени (без учёта регистра). */
export function getTable(
  doc: XERDocument,
  name: string,
  opts?: { required?: boolean }
): XERTable | null {
  const wanted = norm(name);
  const direct = doc.tables[name];
  if (direct) return direct;
  for (const t of Object.values(doc.tables)) {
    if (norm(t.name) === wanted) return t;
  }
  if (opts?.required) {
    const available = Object.keys(doc.tables).join(", ");
    throw new Error(`Таблица "${name}" не найдена. Доступны: ${available}`);
  }
  return null;
}

/** Возвращает строки таблицы как массив T[]. Если нет — [] или ошибка при required. */
export function getRows<T extends Record<string, XERScalar> = Record<string, XERScalar>>(
  doc: XERDocument,
  name: string,
  opts?: { required?: boolean }
): T[] {
  const t = getTable(doc, name, opts);
  return (t?.rows as T[]) ?? [];
}

/** Печатает таблицу в консоль: поля и строки (все или первые N). */
export function printTable(
  doc: XERDocument,
  name: string,
  limit?: number
): void {
  const t = getTable(doc, name);
  if (!t) {
    console.warn(`[XER/XML] Таблица "${name}" не найдена`);
    return;
  }
  console.group(`[XER/XML] TABLE: ${t.name}`);
  console.log('fields:', t.fields);
  if (typeof limit === 'number') {
    console.log(`rows (first ${Math.min(limit, t.rows.length)} of ${t.rows.length}):`);
    const cut = t.rows.slice(0, limit);
    console.log(JSON.stringify(cut, dateReplacer, 2));
  } else {
    console.log(`rows (${t.rows.length}):`);
    console.log(JSON.stringify(t.rows, dateReplacer, 2));
  }
  console.groupEnd();
}

function dateReplacer(_k: string, v: unknown) {
  return v instanceof Date ? v.toISOString() : (v as any);
}