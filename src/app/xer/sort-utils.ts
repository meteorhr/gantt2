// src/app/xer/sort-utils.ts
// Безопасные утилиты сортировки для ячеек XER (string | number | Date | null | undefined)

import type { XERScalar } from './xer-parser';

/** Пустые значения считаем "ниже" непустых */
function isEmpty(v: XERScalar): boolean {
  return v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v));
}

/** Приводим ячейку к примитиву для сравнения */
function toPrimitive(v: XERScalar): number | string {
  if (isEmpty(v)) return '';        // пустые как пустая строка
  if (v instanceof Date) return v.getTime(); // даты сравниваем по ms
  if (typeof v === 'number') return v;       // числа сравниваем численно
  return String(v);                          // всё остальное — строка
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Универсальный компаратор для ячеек */
export function compareCells(a: XERScalar, b: XERScalar): number {
  const aEmpty = isEmpty(a);
  const bEmpty = isEmpty(b);
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;   // пустые — в конец при сортировке по возрастанию
  if (bEmpty) return -1;

  const va = toPrimitive(a);
  const vb = toPrimitive(b);

  if (typeof va === 'number' && typeof vb === 'number') {
    return va - vb;
  }
  return collator.compare(String(va), String(vb));
}

/** Сортировка массива строк таблицы по имени поля */
export function sortByField<T extends Record<string, XERScalar>>(
  rows: T[],
  field: keyof T,
  asc: boolean = true
): T[] {
  const copy = rows.slice();
  copy.sort((ra, rb) => {
    const res = compareCells(ra[field] as XERScalar, rb[field] as XERScalar);
    return asc ? res : -res;
  });
  return copy;
}
