// xer.ts — парсер XER
import type { P6Scalar, P6Header, P6Table, P6Document, ParseOptions } from './parser.types.ts';

const TAB = "\t";
const RX_DATE = /^\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})?$/;

function isNumberLike(s: string): boolean {
  return /^-?\d+(?:\.\d+)?$/.test(s);
}
function safeFieldName(name: string): string {
  return name.replace(/\s+/g, "_").replace(/[^\w\-]/g, "");
}

function coerceScalar(raw: string, opt: ParseOptions): P6Scalar {
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

/* Локальная версия SUMMARIZE, чтобы не тянуть значения (избегаем runtime-цикла) */
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

export function parseXER(input: string, options?: Partial<ParseOptions>): P6Document {
  const opt: ParseOptions = {
    coerceNumbers: true,
    coerceDates: true,
    trimCells: true,
    keepEmptyAsNull: true,
    ...options,
  };

  const lines = input.split(/\r?\n/);
  const doc: P6Document = { header: null, tables: {} };

  let currentTable: P6Table | null = null;
  let currentFields: string[] = [];

  for (const rawLine of lines) {
    if (!rawLine || /^\s*$/.test(rawLine)) continue; // пустые/пробельные строки

    // ERMHDR (допускаем ведущие пробелы)
    if (/^\s*ERMHDR/.test(rawLine)) {
      const parts = rawLine.trimStart().split(TAB);
      const header: P6Header = {
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
      doc.header = header;
      continue;
    }

    // %T — начало таблицы
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
      const row: Record<string, P6Scalar> = {};
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

  // Добавим служебную таблицу SUMMARIZE (локальная версия)
  doc.tables['SUMMARIZE'] = buildSummarizeTableLocal(doc);
  return doc;
}
