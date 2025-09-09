export type P6Scalar = string | number | Date | null | undefined;

export interface P6Header {
  raw: string[] | null;      // для XER — исходная строка ERMHDR; для XML — null
  productVersion?: string;
  exportDate?: string;
  projectOrContext?: string;
  userLogin?: string;
  userFullNameOrRole?: string;
  database?: string;
  moduleName?: string;
  baseCurrency?: string;
}

export interface P6Table {
  name: string;
  fields: string[];
  rows: Record<string, P6Scalar>[];
}

export interface P6Document {
  header: P6Header | null;
  tables: Record<string, P6Table>;
}

export interface ParseOptions {
  coerceNumbers: boolean;
  coerceDates: boolean;
  trimCells: boolean;
  keepEmptyAsNull: boolean;
}