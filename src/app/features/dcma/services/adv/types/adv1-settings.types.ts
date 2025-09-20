// src/app/dcma/services/adv/adv1-settings.types.ts

/** Advanced-настройки чек-1 (Logic) */
export interface DcmaCheck1Advanced {
  /** Показывать виджет/секцию чека на главной панели */
  showOnMain: boolean;

  // Фильтры по типам работ
  includeTaskResDep: boolean;
  includeMilestones: boolean;
  includeLoE: boolean;
  includeWbsSummary: boolean;
  includeCompleted: boolean;
  includeObsolete: boolean; // зарезервировано под будущее

  // Пороговые значения качества (меньше = лучше для % Missing Any)
  thresholds: {
    /** «Отлично» — <= этого значения */
    greatPct: number;
    /** «Средне» — <= этого значения, >great => «средне» */
    averagePct: number;
  };
}