export interface DcmaActivityFilters {
    /** Включать задачи типов TT_Task / TT_Rsrc (Task/resource dependent) */
    taskResourceDependent: boolean; // default: true
    /** Включать Milestones (TT_Mile, TT_StartMile, TT_FinMile) в знаменатель */
    milestones: boolean; // default: true
    /** Включать LOE/Hammock/Summary (TT_LOE, TT_Hammock, TT_Summary) в знаменатель */
    levelOfEffort: boolean; // default: false
    /** Включать WBS summary (TT_WBS) в знаменатель */
    wbsSummary: boolean; // default: false
    /** Включать завершённые задачи (если false — исключать из знаменателя) */
    completed: boolean; // default: true
    /** Включать «Obsolete/Inactive/Cancelled» (если false — исключать) */
    obsolete: boolean; // default: true
  }
  
  export interface DcmaThresholds {
    /** Great Performance порог, %, настраиваемый пользователем */
    greatPct: number;   // default: 5
    /** Average Performance порог, %, настраиваемый пользователем */
    averagePct: number; // default: 25
  }
  
  /** Item детализированного списка Check 1 */
  export interface DcmaCheck1Item {
    task_id: number;
    task_code?: string | null;
    task_name?: string | null;
    wbs_id?: number | null;
    task_type?: string | null;
    status_code?: string | null;
    status_norm: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'UNKNOWN';
    hasPredecessor: boolean;
    hasSuccessor: boolean;
    isMilestone: boolean;
    reasonMissingPred: 'None' | 'StartMilestone' | 'ExternalLink' | 'ExceptionByRule';
    reasonMissingSucc: 'None' | 'FinishMilestone' | 'ExternalLink' | 'ExceptionByRule';
    excludedFromEligible: boolean;
  }
  
  /** Сырые строки из P6 (минимум, который нужен чеку) */
  export interface TaskRow {
    proj_id: number;
    task_id: number;
    wbs_id?: number | null;
    task_code?: string | null;
    task_name?: string | null;
    task_type?: string | null;
    status_code?: string | null;
  }
  
  export interface TaskPredRow {
    task_id: number;       // successor
    pred_task_id: number;  // predecessor
    pred_type?: string | null;
    lag_hr_cnt?: number | null;
  }
  
  export interface DcmaCheck1Options {
    excludeTypes?: string[] | Set<string>;
    milestoneTypes?: string[] | Set<string>;
    includeLists?: boolean;
    excludeCompleted?: boolean;
    excludeLoEAndHammock?: boolean;
    treatMilestonesAsExceptions?: boolean;
    statusMap?: Record<string, 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'UNKNOWN'>;
    ignoreLoEAndHammockLinksInLogic?: boolean;
    includeDQ?: boolean;
  
    /** Новое: панель Activity Filters */
    activityFilters?: Partial<DcmaActivityFilters>;
    /** Новое: пользовательские пороги (Great/Average) */
    thresholds?: Partial<DcmaThresholds>;
    /** Новое: какие статусы трактовать как obsolete/inactive/cancelled */
    statusObsoleteKeys?: string[]; // default: ['INACTIVE','TK_INACTIVE','OBSOLETE','CANCELLED']
  }
  
  export interface DcmaCheck1Result {
    proj_id: number;
    totalEligibleRaw: number;
    totalEligible: number;
    missingPredecessor: number;
    missingSuccessor: number;
    missingBoth: number;
    uniqueMissingAny: number;
    percentMissingAny: number;
    threshold5PercentValue: number;      // исторический DCMA-порог 5% в штуках
    threshold5PercentExceeded: boolean;  // percentMissingAny > 5
  
    /** Новое: возвращаем применённые пороги и оценку */
    thresholdGreatPct: number;           // применённый Great, %
    thresholdAveragePct: number;         // применённый Average, %
    performance: 'Great' | 'Average' | 'Poor';
  
    /** Новое: возвращаем применённые фильтры активности */
    appliedActivityFilters?: DcmaActivityFilters;
  
    details?: {
      items: DcmaCheck1Item[];
      missingPredList: DcmaCheck1Item[];
      missingSuccList: DcmaCheck1Item[];
      missingBothList: DcmaCheck1Item[];
      exclusions: {
        excludedWbs: number;
        excludedCompleted: number;
        excludedLoEOrHammock: number;
        excludedByType: Record<string, number>;
        /** Новое: исключено как obsolete/inactive */
        excludedObsolete?: number;
        /** Новое: исключены Task/Resource dependent, если выключен фильтр */
        excludedTaskResource?: number;
        /** Новое: исключены Milestones, если выключен фильтр */
        excludedMilestones?: number;
      };
      dq?: {
        duplicateLinks: number;
        selfLoops: number;
        orphanLinks: number;
      };
    };
  }  