// src/app/xer/sort-utils.ts
// Безопасные утилиты сортировки для ячеек XER (string | number | Date | null | undefined)

import { P6Scalar } from "./parser/parser.types";



/** Пустые значения считаем "ниже" непустых */
function isEmpty(v: P6Scalar): boolean {
  return v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v));
}

/** Приводим ячейку к примитиву для сравнения */
function toPrimitive(v: P6Scalar): number | string {
  if (isEmpty(v)) return '';        // пустые как пустая строка
  if (v instanceof Date) return v.getTime(); // даты сравниваем по ms
  if (typeof v === 'number') return v;       // числа сравниваем численно
  return String(v);                          // всё остальное — строка
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Универсальный компаратор для ячеек */
export function compareCells(a: P6Scalar, b: P6Scalar): number {
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
export function sortByField<T extends Record<string, P6Scalar>>(
  rows: T[],
  field: keyof T,
  asc: boolean = true
): T[] {
  const copy = rows.slice();
  copy.sort((ra, rb) => {
    const res = compareCells(ra[field] as P6Scalar, rb[field] as P6Scalar);
    return asc ? res : -res;
  });
  return copy;
}
