// parser.ts — ядро типов + общие утилиты; ре-экспорт parseXER/parseP6XML из отдельных модулей
/* ============================ Ре-экспорт парсеров ============================ */
// ВАЖНО: xer.ts и xml.ts импортируют из этого файла ТОЛЬКО типы (import type),

import { P6Document, P6Scalar, P6Table } from './parser/parser.types';

// поэтому здесь безопасно ре-экспортировать реализацию, избегая runtime-циклов.
export { parseXER } from './parser/xer';
export { parseP6XML } from './parser/xml';


/* ============================ Типы/интерфейсы ============================ */



/* ============================ Summarize ============================ */

export interface P6SummaryItem {
  name: string;
  i18n: string;           // ключ для заголовка
  value: string;          // текстовое значение (для хедера остаётся как есть)
  i18nValue?: string;     // ключ шаблона значения (для таблиц)
  params?: Record<string, unknown>; // параметры для i18n шаблона
}

export function summarizeArray(doc: P6Document): P6SummaryItem[] {
  const arr: P6SummaryItem[] = [];
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
  for (const t of Object.values(doc.tables)) {
    out.push(`${t.name}: ${t.rows.length} строк, ${t.fields.length} полей`);
  }
  return out.join("\n");
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

