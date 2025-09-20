import { ConstraintNorm } from "../src/utils";

/** Минимальные типы под XER/XML таблицы, используемые в расчёте */
export interface TaskRow {
  task_id: number;              // уникальный ID активности
  proj_id: number;              // ID проекта
  clndr_id: number;          
  task_code?: string;           // код активности (Activity ID)
  task_name?: string;           // наименование
  wbs_id?: number | string;     // WBS (для удобной фильтрации/вывода)
  task_type?: string;           // TT_Task | TT_Mile | TT_StartMile | TT_FinMile | TT_LOE | TT_WBS | ...
  status_code?: string;         // Not Started/In Progress/Completed/...
  cstr_type?: string;
  cstr_date?: string | Date | null;
  total_float_hr_cnt?: number | null;
  remain_dur_hr_cnt?: number | null;
  orig_dur_hr_cnt?: number | null;
  early_start_date?: string | Date | null;
  early_end_date?: string | Date | null;
  late_start_date?: string | Date | null;
  late_end_date?: string | Date | null;
  act_start_date?: string | Date | null;
  act_end_date?: string | Date | null;
  // Возможные поля базового плана (разные XER/XML схемы)
  bl1_finish_date?: string | Date | null;
  bl_finish_date?: string | Date | null;
  baseline_finish_date?: string | Date | null;
  target_end_date?: string | Date | null;
  target_finish_date?: string | Date | null;
}

export interface DcmaCheck5Item {
  task_id: number;
  task_code?: string;
  task_name?: string;
  cstr_type?: string;                 // исходное значение P6
  cstr_date?: string | Date | null;
  isHard: boolean;                    // true, если нормализация распознала MS/MF
  normType?: string;                  // HARD_MS/HARD_MF/soft-variants/UNKNOWN
  hasDate?: boolean;                  // указана ли дата ограничения
}

export interface DcmaCheck5Result {
  proj_id: number;
  totalWithConstraints: number;     // активностей с любым распознанным ограничением
  hardCount: number;                // активностей с HARD_MS/HARD_MF
  softCount: number;                // активностей с любым soft-типом
  hardPercent: number;              // % Hard от totalWithConstraints
  threshold5PercentExceeded: boolean; // >5% — внимание
  details?: {
    hardList: DcmaCheck5Item[];
    softList: DcmaCheck5Item[];
    byType?: Record<ConstraintNorm, number>; // распределение по нормализованным типам
    dq?: {
      unknownType: number;          // нераспознанных типов (не попали в знаменатель)
      missingDateForHard: number;   // HARD_* без даты
      missingDateForSoft: number;   // SOFT_* без даты
      excludedWbs: number;          // исключённые WBS summary
    };
  };
}



export interface DcmaCheck6Item {
  task_id: number;
  task_code?: string;
  task_name?: string;
  total_float_hr_cnt: number;      // TF в часах
  total_float_days_8h: number;     // TF в днях по календарю задачи (деление на hours_per_day_used)
  hours_per_day_used?: number;     // часы/день, взятые из календаря активности
}

export interface DcmaCheck7Item {
  task_id: number;
  task_code?: string;
  task_name?: string;
  total_float_hr_cnt: number;   // TF в часах (отрицательный)
  total_float_days_8h: number;  // TF в днях по календарю задачи (деление на hours_per_day_used)
  hours_per_day_used?: number;  // часы/день из календаря задачи
}

export interface DcmaCheck7Result {
  proj_id: number;
  totalEligible: number;          // задачи, участвующие в проверке (без WBS)
  negativeFloatCount: number;     // TF < 0
  hasNegativeFloat: boolean;      // должно быть false
  details?: { 
    items: DcmaCheck7Item[];
    dq?: {
      unknownUnits: number;       // TotalFloatUnits не распознаны
      missingTf: number;          // нет TF ни в часах, ни в паре (TotalFloat, TotalFloatUnits)
      excludedWbs: number;        // исключённые WBS summary
    };
  };
}

export interface TaskPredRow {
  task_id: number;              // Successor (к кому ведёт связь)
  pred_task_id: number;         // Predecessor (от кого идёт связь)
  pred_type?: string;           // FS/SS/FF/SF (как в XML), в XER может быть код типа
  lag_hr_cnt?: number | null;   // лаг в часах (в XER часто в часах)
  lag_units?: string | null;   // нормализованные единицы (HOURS/DAYS/WEEKS/MONTHS/...)
  lag_raw?: string | null;     // исходное текстовое значение лага (если не часы)
  predecessor_code?: string;   // для деталей (если есть в маппере)
  successor_code?: string;     // для деталей (если есть в маппере)
}

export interface TaskRsrcRow {
  task_id: number;
  rsrc_id?: number | string;
  role_id?: number | string;
  qty?: number | null;
}

export interface DcmaCheck1Options {
  /** Типы активностей, которые исключаем из DCMA Logic eligibility (из знаменателя). */
  excludeTypes?: string[];
  /** Типы, считающиеся вехами (для автопроставления причин исключений). */
  milestoneTypes?: string[];
  /** Исключать COMPLETED из знаменателя (некоторые заказчики так требуют). */
  excludeCompleted?: boolean;
  /** Исключать LOE/Hammock/обслуживающие типы из знаменателя. */
  excludeLoEAndHammock?: boolean;
  /** Считать стартовые/финишные вехи допустимыми «открытыми концами» и не включать их в нарушения. */
  treatMilestonesAsExceptions?: boolean;
  /** Включать подробные списки. */
  includeLists?: boolean;
  /** Заказной маппинг статусов в нормализованные (NOT_STARTED/IN_PROGRESS/COMPLETED). */
  statusMap?: Record<string, 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED'>;
  /** Игнорировать связи, где противоположный конец LOE/Hammock, при определении hasPred/hasSucc. */
  ignoreLoEAndHammockLinksInLogic?: boolean;
  /** Вывести раздел Data Quality (DQ) и счётчики исключений. */
  includeDQ?: boolean;
}

export interface DcmaCheck1Item {
  task_id: number;
  task_code?: string;
  task_name?: string;
  wbs_id?: number | string;
  task_type?: string;
  status_code?: string;
  status_norm?: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'UNKNOWN';
  hasPredecessor: boolean;
  hasSuccessor: boolean;
  isMilestone: boolean;
  /** Причины/смягчающие обстоятельства для отсутствия предшественника/преемника */
  reasonMissingPred?: 'StartMilestone' | 'ProjectStart' | 'ExternalLink' | 'ExceptionByRule' | 'None';
  reasonMissingSucc?: 'FinishMilestone' | 'ProjectFinish' | 'ExternalLink' | 'ExceptionByRule' | 'None';
  /** Исключён ли из знаменателя по правилам (Completed/LoE/Hammock/Milestone исключения) */
  excludedFromEligible?: boolean;
}

export interface DcmaCheck1Result {
  proj_id: number;
  /** Исходный eligible (до исключений по правилам) */
  totalEligibleRaw: number;
  /** Итоговый eligible после исключений (denominator DCMA) */
  totalEligible: number;
  missingPredecessor: number;
  missingSuccessor: number;
  missingBoth: number;
  /** Уникальные активности, у которых отсутствует хотя бы один из концов логики (после исключений) */
  uniqueMissingAny: number;
  percentMissingAny: number; // % от totalEligible
  /** Сколько нарушителей допускается по правилу 5% (округление вверх) */
  threshold5PercentValue?: number;
  threshold5PercentExceeded: boolean;
  details?: {
    items: DcmaCheck1Item[];
    missingPredList: DcmaCheck1Item[];
    missingSuccList: DcmaCheck1Item[];
    missingBothList: DcmaCheck1Item[];
    exclusions?: {
      excludedWbs: number;
      excludedCompleted: number;
      excludedLoEOrHammock: number;
      excludedByType: Record<string, number>;
    };
    dq?: {
      duplicateLinks: number;
      selfLoops: number;
      orphanLinks: number;
    };
  };
}

export interface DcmaCheck2LinkItem {
  predecessor_task_id: number;
  successor_task_id: number;
  predecessor_code?: string;
  predecessor_name?: string;
  successor_code?: string;
  successor_name?: string;
  link_type?: string;        // FS/SS/FF/SF
  lag_hr_cnt: number;        // лаг в часах (отрицательный = lead)
  lag_days_8h: number;       // лаг, пересчитанный в днях (деление на hours_per_day_used)
  lag_units?: string | null;   // юниты из XER/XML
  lag_raw?: string | null;     // сырой текст из XER/XML
  hours_per_day_used?: number; // часы/день по календарю преемника
}

export interface DcmaCheck2Result {
  proj_id: number;
  totalRelationships: number;    // общее число связей внутри проекта (после дедупликации)
  leadCount: number;             // количество связей с отрицательным лагом
  leadPercent: number;           // % lead-связей от totalRelationships
  thresholdZeroViolated: boolean; // true, если есть хотя бы один lead
  details?: {
    leads: DcmaCheck2LinkItem[]; // подробный список lead-связей
    dq?: {                       // диагностические счётчики качества данных
      duplicateLinks: number;    // удалённых дублей
      selfLoops: number;         // отброшенных самосвязей
      externalLinks: number;     // отброшенных внешних связей (за пределами проекта)
    };
  };
}

export interface DcmaCheck3LinkItem {
  predecessor_task_id: number;
  successor_task_id: number;
  predecessor_code?: string;
  predecessor_name?: string;
  successor_code?: string;
  successor_name?: string;
  link_type?: string;        // FS/SS/FF/SF
  lag_hr_cnt: number;        // лаг в часах (положительный = lag)
  lag_days_8h: number;       // лаг, пересчитанный в днях (деление на hours_per_day_used)
  lag_units?: string | null; // юниты из XER/XML
  lag_raw?: string | null;   // сырой текст из XER/XML
  hours_per_day_used?: number; // часы/день по календарю преемника
}

export interface DcmaCheck3Result {
  proj_id: number;
  totalRelationships: number;     // общее число связей внутри проекта
  lagCount: number;                // количество связей с положительным лагом
  lagPercent: number;              // % lag-связей от totalRelationships
  threshold5PercentExceeded: boolean; // true, если доля lag > 5%
  details?: {
    lags: DcmaCheck3LinkItem[];    // подробный список lag-связей
    dq?: {
      duplicateLinks: number;
      selfLoops: number;
      externalLinks: number;
    };
  };
}

export interface DcmaCheck4NonFsItem {
  predecessor_task_id: number;
  successor_task_id: number;
  predecessor_code?: string;
  successor_code?: string;
  link_type: 'FS' | 'SS' | 'FF' | 'SF' | 'UNKNOWN';
}

export interface DcmaCheck4Result {
  proj_id: number;
  totalRelationships: number;
  countFS: number;
  countSS: number;
  countFF: number;
  countSF: number;
  percentFS: number;                 // % FS от totalRelationships
  //fsThreshold90Failed: boolean;      
  // // true, если percentFS < 90
  details?: { 
    nonFsList: DcmaCheck4NonFsItem[];
    dq?: {
      duplicateLinks: number;
      selfLoops: number;
      externalLinks: number;
      unknownType: number;
    };
  };
}

export interface DcmaCheck6Result {
  proj_id: number;
  totalEligible: number;         // eligible-активности (исключая WBS Summary)
  highFloatCount: number;        // TF > 44 дней
  highFloatPercent: number;
  threshold5PercentExceeded: boolean;
  details?: { 
    items: DcmaCheck6Item[];
    dq?: {
      unknownUnits: number;      // TotalFloatUnits не распознаны
      missingTf: number;         // нет TF ни в часах, ни в паре (TotalFloat, TotalFloatUnits)
      excludedWbs: number;       // исключённые WBS
    };
  };
}

export interface DcmaCheck7Item {
  task_id: number;
  task_code?: string;
  task_name?: string;
  total_float_hr_cnt: number;
  total_float_days_8h: number;
}


export interface DcmaCheck8Item {
  task_id: number;
  task_code?: string;
  task_name?: string;
  remain_dur_hr_cnt: number;    // оставшаяся длительность в часах
  remain_dur_days_8h: number;   // в днях по календарю задачи (деление на hours_per_day_used)
  hours_per_day_used?: number;  // часы/день из календаря активности
}

export interface DcmaCheck8Result {
  proj_id: number;
  totalEligible: number;        // незавершённые задачи (исключая WBS)
  highDurationCount: number;    // незавершённые с Remaining > 44 дней
  highDurationPercent: number;  // % от незавершённых
  threshold5PercentExceeded: boolean;
  details?: { 
    items: DcmaCheck8Item[];
    dq?: {
      excludedWbs: number;
      excludedCompleted: number;     // сколько отброшено как Completed при формировании знаменателя
      excludedLoEOrHammock: number;  // если исключили LOE/Hammock из знаменателя
      missingRemainDur: number;      // отсутствует Remaining Duration в часах и альтернативных полях
      negativeRemainDur: number;     // Remaining < 0 (отброшены из расчёта)
      usedAltRemainField: number;    // взяли Remaining из альтернативных полей (rem_drtn_hr_cnt/RemainingDuration/RemainingDurationHours)
    };
  };
}

export interface DcmaCheck9ForecastItem {
  task_id: number;
  task_code?: string;
  task_name?: string;
  early_start_date?: string | Date | null;
  early_end_date?: string | Date | null;
  late_start_date?: string | Date | null;
  late_end_date?: string | Date | null;
}

export interface DcmaCheck9ActualItem {
  task_id: number;
  task_code?: string;
  task_name?: string;
  act_start_date?: string | Date | null;
  act_end_date?: string | Date | null;
}

export interface DcmaCheck9Result {
  proj_id: number;
  dataDateISO: string;                 // ISO дата статуса проекта
  invalidForecastCount: number;        // 9a: ES/EF/LS/LF < Data Date (для незавершённых)
  invalidActualCount: number;          // 9b: AS/AF > Data Date
  hasInvalidDates: boolean;            // должно быть false
  details?: {
    forecast: DcmaCheck9ForecastItem[];
    actual: DcmaCheck9ActualItem[];
    dq?: {
      tasksCheckedForecast: number;    // сколько задач прошло проверку 9a
      tasksCheckedActual: number;      // сколько задач прошло проверку 9b
      missingForecastFields: number;   // где все ES/EF/LS/LF отсутствуют
      missingActualFields: number;     // где AS и AF отсутствуют
      parseErrors: number;             // ошибки парсинга дат
    };
  };
}

export interface DcmaCheck10Item {
  task_id: number;
  task_code?: string;
  task_name?: string;
  eff_dur_hr_cnt: number;      // эффективная длительность (часы) для порога 1 день
  eff_dur_days: number;        // eff_dur_hr_cnt / hours_per_day_used
  hours_per_day_used?: number; // часы/день (из календаря задачи или фолбэк)
}

export interface DcmaCheck10Result {
  proj_id: number;
  hoursPerDay: number;                 // глобальный фолбэк на случай отсутствия календаря
  totalEligible: number;               // задачи с длительностью ≥ 1 дня (и не WBS)
  withoutResourceCount: number;        // без назначенных ресурсов (TASKRSRC)
  percentWithoutResource: number;      // % от totalEligible
  details?: {
    items: DcmaCheck10Item[];          // список задач без ресурсов
    dq?: {
      excludedWbs: number;             // исключённые WBS summary
      excludedMilestones: number;      // исключённые вехи
      excludedLoEOrHammock: number;    // исключённые LOE/Hammock (если применено)
      missingDuration: number;         // нет данных по длительности
      negativeDuration: number;        // отрицательная длительность
      usedAltDurationField: number;    // использовали альтернативные поля для длительности
      calendarFallbackCount: number;   // сколько задач использовало фолбэк часов/день (нет валидного календаря)
    };
  };
}

export interface DcmaCheck11Item {
  task_id: number;
  task_code?: string;
  task_name?: string;
  act_finish?: string | Date | null;
  baseline_finish?: string | Date | null;
}

export interface DcmaCheck11Result {
  proj_id: number;
  totalCompleted: number;                // завершённых (без WBS)
  evaluatedCompleted: number;            // завершённых, у которых есть BL Finish и AF → участвуют в расчёте
  missedCount: number;                   // AF > BL Finish среди evaluatedCompleted
  missedPercent: number;                 // % от evaluatedCompleted
  threshold5PercentExceeded: boolean;    // >5% — внимание
  details?: {
    items: DcmaCheck11Item[];            // только нарушители (AF > BL)
    dq?: {
      excludedWbs: number;               // исключено WBS
      missingBaselineFinish: number;     // завершённых без BL Finish — не смогли оценить
      missingActualFinish: number;       // завершённых без AF — не смогли оценить
      baselineFieldUsage?: Record<string, number>; // статистика использованных BL полей
    };
  };
};

export interface DcmaCheck12Result {
  proj_id: number;
  simulatedDelayDays: number;           // имитация добавления длительности (дней)
  criticalCount: number;                // размер множества «критических» (TF≈0)
  floatThresholdHours: number;          // порог TF для отбора критических (часы)
  startNodesOnCP: number;               // узлы КП без предшественников в КП
  endNodesOnCP: number;                 // узлы КП без преемников в КП
  isSingleChain: boolean;               // на КП ровно 1 стартовый и 1 конечный узел
  reachedProjectFinish: boolean;        // конечный узел КП совпадает с проектным финишем (по forecast)
  testPassLikely: boolean;              // эвристический вывод: true => тест вероятно пройдёт
  details?: {
    criticalTaskIds: number[];
    dq?: {
      duplicateLinks: number;           // удалённые дубликаты связей при построении подграфа
      selfLoops: number;                // отброшенные самосвязи
      externalLinks: number;            // отброшенные внешние связи
      components: number;               // количество компонент связности в подграфе КП
    };
  };
}

export interface DcmaCheck13Result {
  proj_id: number;
  dataDateISO?: string;                 // дата статуса (PROJECT)
  forecastFinishISO?: string;           // прогнозный финиш проекта (по задачам)
  baselineFinishISO?: string | null;    // базовый финиш проекта (по задачам)
  criticalPathLengthDays?: number | null; // CPL (дни) = (ForecastFinish - DataDate)
  projectTotalFloatDays?: number | null;  // PTF (дни) = (BaselineFinish - ForecastFinish)
  cpli?: number | null;                 // (CPL + PTF) / CPL
  cpliWithin5pct?: boolean | null;      // цель ≈ 1.0 (±5%)
}

export interface DcmaCheck14Result {
  proj_id: number;
  dataDateISO: string;                 // дата статуса проекта
  plannedToComplete: number;           // задачи, которые по БП должны быть завершены к DD
  actuallyCompleted: number;           // фактически завершённые к DD
  bei: number | null;                  // BEI = actuallyCompleted / plannedToComplete
  beiWithin95pct: boolean | null;      // цель ≈ 1.0 (не ниже 0.95)
  details?: {
    plannedButNotCompleted: Array<{ task_id: number; task_code?: string; task_name?: string; baseline_finish?: string | Date | null }>; // BL<=DD, AF отсутствует/в будущем
    completedAheadOfPlan: Array<{ task_id: number; task_code?: string; task_name?: string; act_finish?: string | Date | null; baseline_finish?: string | Date | null }>; // AF<=DD, но BL>DD
  };
}


export type CalendarSource = 'successor' | 'predecessor' | 'fixed';