// src/app/xer/models/actvcode.model.ts
import { XERRowBase } from './base.model';


/**
 * ACTVCODE — Activity Code Values
 * Поля соответствуют XER "P6 EPPM Column Name".
 * Комментарии — "P6 EPPM Field".
 */
export interface ACTVCODERow extends XERRowBase {
  /** Разрешаем безопасный доступ по индексу для обобщённых утилит парсера */

  /** Unique ID */                           actv_code_id: number;

  /** Description */                         actv_code_name?: string | null;

  /** Activity Code (тип кода активности) */ actv_code_type_id?: number | null;

  /** Color (P6 EPPM only) */                color?: string | null;

  /** Parent Activity Code Value */          parent_actv_code_id?: number | null;

  /** Sort Order */                          seq_num?: number | null;

  /** Activity Code Value */                 short_name?: string | null;
}
