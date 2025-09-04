import { XERScalar } from '../xer-parser';
export interface XERRowBase { [k: string]: XERScalar; }

export interface RSRCROLERow extends XERRowBase {
  rsrc_id: number;
  role_id: number;
  skill_level: number | null;
  role_short_name: string | null;
  role_name: string | null;
  rsrc_short_name: string | null;
  rsrc_name: string | null;
  rsrc_type: string | null;
  rsrc_role_id: number | null;
}