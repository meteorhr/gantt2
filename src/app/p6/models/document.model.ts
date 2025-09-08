// src/app/xer/models/document.model.ts
import { XERRowBase } from './base.model';

/** DOCUMENT — Work Products and Documents */
export interface DOCUMENTRow extends XERRowBase {

  /** Unique ID */                   doc_id: number;
  /** Title */                       doc_name?: string | null;
  /** Reference No. */               doc_short_name?: string | null;
  /** Description */                 doc_content?: string | null;
  /** Version */                     version_name?: string | null;

  /** Author */                      author_name?: string | null;
  /** Revision Date */               doc_date?: Date | string | null;
  /** Document Category */           doc_catg_id?: number | null;
  /** Status */                      doc_status_id?: number | null;
  /** Document Management Type */    doc_mgmt_type?: string | number | null;
  /** Deliverable */                 deliv_flag?: string | number | null; // Y/N или 1/0

  /** External Document Key */       cr_external_doc_key?: string | null;
  /** Private Location */            private_loc?: string | null;
  /** Public Location */             public_loc?: string | null;

  /** Parent Document */             parent_doc_id?: number | null;
  /** Project */                     proj_id?: number | null;
  /** Global Unique ID */            guid?: string | null;
  /** Methodology GUID */            tmpl_guid?: string | null;

  /** Sort Order */                  doc_seq_num?: number | null;
}