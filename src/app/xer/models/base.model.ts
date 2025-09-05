// Общие базовые типы для XER-моделей

import { XERScalar } from '../xer-parser';

/** Базовая строка XER-таблицы: любые колонки со значениями XERScalar */
export interface XERRowBase {
  [key: string]: XERScalar; // string | number | Date | null
}

/** Да/Нет, как в P6 */
export type P6YesNo = 'Y' | 'N' | null;