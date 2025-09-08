// src/app/xer/models/udfvalue.model.ts
import { XERRowBase } from './base.model';

/** UDFVALUE — User Defined Field Values */
export interface UDFVALUERow extends XERRowBase {
  /** User Defined Field */            udf_type_id: number;

  /** Project */                       proj_id?: number | null;
  /** Activity Step Item (foreign key to owning record) */
  fk_id?: number | string | null;

  /** udf_code_id */                   udf_code_id?: number | null;
  /** udf_date */                      udf_date?: Date | string | null;
  /** udf_number */                    udf_number?: number | null;
  /** udf_text */                      udf_text?: string | null;
}
