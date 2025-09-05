// src/app/xer/models/udftype.model.ts
import { XERRowBase } from './base.model';

/** UDFTYPE — User Defined Fields (метаданные UDF) */
export interface UDFTYPERow extends XERRowBase {

  /** Unique ID */                     udf_type_id: number;
  /** User Defined Field */            udf_type_name?: string | null;
  /** Title */                         udf_type_label?: string | null;
  /** Table */                         table_name?: string | null;
  /** Data Type */                     logical_data_type?: string | null;

  /** indicator_expression */          indicator_expression?: string | null;
  /** summary_indicator_expression */  summary_indicator_expression?: string | null;
  /** Secure Code */                   super_flag?: string | number | null;
}
