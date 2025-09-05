// src/app/xer/models/rsrc.model.ts
import { XERRowBase } from './base.model';

/** RSRC — Resources */
export interface RSRCRow extends XERRowBase {

  /** Unique ID */                 rsrc_id: number;

  /** Resource ID */               rsrc_short_name?: string | null;
  /** Resource Name */             rsrc_name?: string | null;
  /** Title */                     rsrc_title_name?: string | null;
  /** Resource Type */             rsrc_type?: string | null;

  /** Parent Resource */           parent_rsrc_id?: number | null;
  /** Primary Role */              role_id?: number | null;

  /** Calendar */                  clndr_id?: number | null;
  /** Currency Name */             curr_id?: number | null;
  /** Unit of Measure */           unit_id?: number | null;
  /** Shift */                     shift_id?: number | null;
  /** Location */                  location_id?: number | null;

  /** Default Units / Time */      def_qty_per_hr?: number | null;
  /** Price Time Units */          cost_qty_type?: string | null;
  /** Calculate costs from units */def_cost_qty_link_flag?: string | number | null;

  /** Overtime Allowed */          ot_flag?: string | number | null;
  /** Overtime Factor */           ot_factor?: number | null;

  /** Active */                    active_flag?: string | number | null;
  /** Auto Compute Actuals */      auto_compute_act_flag?: string | number | null;
  /** Uses timesheets */           timesheet_flag?: string | number | null;

  /** Email Address */             email_addr?: string | null;
  /** Office Phone */              office_phone?: string | null;
  /** Other Phone */               other_phone?: string | null;

  /** Employee ID */               employee_code?: string | null;
  /** User Login Name */           user_id?: string | null;

  /** Sort Order */                rsrc_seq_num?: number | null;

  /** Global Unique ID */          guid?: string | null;
  /** Resource Notes */            rsrc_notes?: string | null;

  /** Not-Started View Window */   xfer_notstart_day_cnt?: number | null;
  /** Completed View Window */     xfer_complete_day_cnt?: number | null;
}
