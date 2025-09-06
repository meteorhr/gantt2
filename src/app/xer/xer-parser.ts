// src/app/xer/xer-parser.ts
// Самодостаточный парсер XER (Primavera P6) для браузера/Angular.

export type XERScalar = string | number | Date | null | undefined;

export interface XERHeader {
  raw: string[];
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
    if (!rawLine) continue;

    if (rawLine.startsWith("ERMHDR")) {
      const parts = rawLine.split(TAB);
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

    if (rawLine.startsWith("%T" + TAB)) {
      const name = rawLine.substring(3).trim();
      if (!doc.tables[name]) doc.tables[name] = { name, fields: [], rows: [] };
      currentTable = doc.tables[name];
      currentFields = [];
      continue;
    }

    if (rawLine.startsWith("%F" + TAB)) {
      if (!currentTable) throw new Error(`Поля без активной таблицы: ${rawLine}`);
      currentFields = rawLine.substring(3).split(TAB).map(f => safeFieldName(opt.trimCells ? f.trim() : f));
      currentTable.fields = currentFields;
      continue;
    }

    if (rawLine.startsWith("%R" + TAB)) {
      if (!currentTable) throw new Error(`Запись без активной таблицы: ${rawLine}`);
      if (currentFields.length === 0) throw new Error(`В "${currentTable.name}" запись до %F.`);
      const values = rawLine.substring(3).split(TAB);
      const row: Record<string, XERScalar> = {};
      const width = Math.min(values.length, currentFields.length);
      for (let i = 0; i < width; i++) row[currentFields[i]] = coerceScalar(values[i], opt);
      for (let i = width; i < currentFields.length; i++) row[currentFields[i]] = null;
      currentTable.rows.push(row);
      continue;
    }

    if (rawLine.startsWith("%E")) break;
  }

  return doc;
}

export function summarize(doc: XERDocument): string {
  const out: string[] = [];
  out.push("=== ERMHDR ===");
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
  // точное совпадение
  const direct = doc.tables[name];
  if (direct) return direct;

  // без регистра
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
    console.warn(`[XER] Таблица "${name}" не найдена`);
    return;
  }
  console.group(`[XER] TABLE: ${t.name}`);
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
  return v instanceof Date ? v.toISOString() : v as any;
}
