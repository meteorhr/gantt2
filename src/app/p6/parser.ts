// parser.ts — ядро типов + общие утилиты; ре-экспорт parseXER/parseP6XML из отдельных модулей

import { P6Document, P6Scalar, P6Table } from './parser/parser.types';

// реализация парсеров
export { parseXER } from './parser/xer';
export { parseP6XML } from './parser/xml';

/* ============================ Типы/интерфейсы ============================ */

export interface P6SummaryItem {
  name: string;
  i18n: string;           // ключ для заголовка
  value: string;          // текстовое значение (для хедера остаётся как есть)
  i18nValue?: string;     // ключ шаблона значения (для таблиц)
  params?: Record<string, unknown>; // параметры для i18n шаблона
}

/* ============================ helpers ============================ */

function nonEmpty(v: unknown): string {
  const s = String(v ?? '').trim();
  return s;
}

function hasXerRawHeader(doc: P6Document): boolean {
  const anyHeader = (doc as any)?.header as any;
  return Array.isArray(anyHeader?.raw) && anyHeader.raw.length > 0;
}

function tableNamesUpper(doc: P6Document): string[] {
  return Object.keys(doc.tables ?? {}).map(n => n.trim().toUpperCase());
}

/**
 * Надёжное определение формата уже распарсенного документа.
 * Источники правды по возрастанию "жёсткости":
 * 1) moduleName/productVersion содержат "xml"/"xer"
 * 2) XER-признаки: header.raw есть, или таблица ERMHDR присутствует
 */
function detectDocFormat(doc: P6Document): 'xml' | 'xer' | 'unknown' {
  const m = nonEmpty(doc.header?.moduleName).toLowerCase();
  const v = nonEmpty(doc.header?.productVersion).toLowerCase();

  if (m.includes('xml') || v.includes('xml') || m === 'p6-xml') return 'xml';
  if (m.includes('xer') || v.includes('xer') || m === 'p6-xer') return 'xer';

  // Признак XER №1: парсер XER обычно оставляет "сырую" шапку
  if (hasXerRawHeader(doc)) return 'xer';

  // Признак XER №2: в наборе таблиц есть ERMHDR
  const tnames = tableNamesUpper(doc);
  if (tnames.includes('ERMHDR')) return 'xer';

  return 'unknown';
}

/**
 * Опциональный хелпер: проставить разумные значения header.moduleName,
 * если парсер этого не сделал, чтобы сводка и логика UI были стабильнее.
 * Вызывайте сразу после parseXER/parseP6XML.
 */
export function ensureHeaderDefaults(doc: P6Document, formatHint?: 'xml' | 'xer'): void {
  const fmt = formatHint ?? detectDocFormat(doc);
  if (!doc.header) (doc as any).header = {};
  if (fmt === 'xer' && !doc.header!.moduleName) doc.header!.moduleName = 'P6-XER';
  if (fmt === 'xml' && !doc.header!.moduleName) doc.header!.moduleName = 'P6-XML';
}

/* ============================ Summarize ============================ */

export function summarizeArray(doc: P6Document): P6SummaryItem[] {
  const arr: P6SummaryItem[] = [];

  // 0) Тип файла
  const fmt = detectDocFormat(doc);
  arr.push({
    name: 'fileType',
    i18n: 'summarize.fileType',
    value: fmt.toUpperCase()
  });

  if (doc.header) {
    // Добавляем только существующие и непустые поля
    const pushIf = (name: string, i18n: string, value?: string | null) => {
      const v = nonEmpty(value);
      if (v) arr.push({ name, i18n, value: v });
    };

    pushIf('version',     'summarize.version',     doc.header.productVersion);
    pushIf('exportDate',  'summarize.exportDate',  doc.header.exportDate);
    pushIf('context',     'summarize.context',     doc.header.projectOrContext);

    // userLogin или userFullNameOrRole — добавим только если хоть что-то есть
    const userLogin = nonEmpty(doc.header.userLogin);
    const userFull  = nonEmpty(doc.header.userFullNameOrRole);
    if (userLogin || userFull) {
      arr.push({
        name: 'user',
        i18n: 'summarize.user',
        value: userFull ? `${userLogin} (${userFull})` : (userLogin || userFull)
      });
    }
    pushIf('db',          'summarize.db',          doc.header.database);
    pushIf('module',      'summarize.module',      doc.header.moduleName);

    // baseCurrency — в XER обычно есть, в XML может отсутствовать: не показываем пустое
    pushIf('baseCurrency','summarize.baseCurrency',doc.header.baseCurrency);
  }

  // Таблицы — только те, где есть строки
  for (const t of Object.values(doc.tables)) {
    const rowsCount = t.rows?.length ?? 0;
    if (rowsCount <= 0) continue;

    arr.push({
      name: t.name,
      i18n: 'summarize.table.' + t.name,
      value: '',
      i18nValue: 'summarize.table.count',
      params: { rows: rowsCount, fields: t.fields.length }
    });
  }

  return arr;
}

/** Построить XER-таблицу SUMMARIZE из summarizeArray (params сериализуем в JSON-строку) */
export function buildSummarizeTable(doc: P6Document): P6Table {
  const items = summarizeArray(doc);
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

export function summarize(doc: P6Document): string {
  const out: string[] = [];
  out.push('=== HEADER ===');

  const fmt = detectDocFormat(doc);
  out.push(`File type: ${fmt.toUpperCase()}`);

  if (doc.header) {
    const pushIf = (label: string, v?: string | null) => {
      const s = nonEmpty(v);
      if (s) out.push(`${label}: ${s}`);
    };

    pushIf('Version',    doc.header.productVersion);
    pushIf('Export date',doc.header.exportDate);
    pushIf('Context',    doc.header.projectOrContext);

    const userLogin = nonEmpty(doc.header.userLogin);
    const userFull  = nonEmpty(doc.header.userFullNameOrRole);
    if (userLogin || userFull) {
      out.push(`User: ${userFull ? `${userLogin} (${userFull})` : (userLogin || userFull)}`);
    }

    pushIf('DB',         doc.header.database);
    pushIf('Module',     doc.header.moduleName);
    pushIf('Base currency', doc.header.baseCurrency);
  } else {
    out.push('— отсутствует —');
  }

  out.push('\n=== Таблицы (только непустые) ===');
  for (const t of Object.values(doc.tables)) {
    const rowsCount = t.rows?.length ?? 0;
    if (rowsCount <= 0) continue;
    out.push(`${t.name}: ${rowsCount} строк, ${t.fields.length} полей`);
  }
  return out.join('\n');
}

/* ============================ Навигация по таблицам ============================ */

function norm(name: string): string {
  return name.trim().toUpperCase();
}

/** Возвращает таблицу по имени (без учёта регистра). */
export function getTable(
  doc: P6Document,
  name: string,
  opts?: { required?: boolean }
): P6Table | null {
  const wanted = norm(name);
  const direct = (doc.tables as Record<string, P6Table | undefined>)[name];
  if (direct) return direct;
  for (const t of Object.values(doc.tables)) {
    if (norm(t.name) === wanted) return t;
  }
  if (opts?.required) {
    const available = Object.keys(doc.tables).join(', ');
    throw new Error(`Таблица "${name}" не найдена. Доступны: ${available}`);
  }
  return null;
}

/** Возвращает строки таблицы как массив T[]. Если нет — [] или ошибка при required. */
export function getRows<T extends Record<string, P6Scalar> = Record<string, P6Scalar>>(
  doc: P6Document,
  name: string,
  opts?: { required?: boolean }
): T[] {
  const t = getTable(doc, name, opts);
  return (t?.rows as T[]) ?? [];
}

/** Печатает таблицу в консоль: поля и строки (все или первые N). */
export function printTable(
  doc: P6Document,
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

export function dateReplacer(_k: string, v: unknown) {
  return v instanceof Date ? v.toISOString() : (v as any);
}
