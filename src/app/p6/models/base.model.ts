// Общие базовые типы для XER-моделей

import { P6Scalar } from '../parser/parser.types'; 

/** Базовая строка XER-таблицы: любые колонки со значениями XERScalar */
export interface XERRowBase {
  [key: string]: P6Scalar; // string | number | Date | null
}

/** Да/Нет, как в P6 */
export type P6YesNo = 'Y' | 'N' | null;