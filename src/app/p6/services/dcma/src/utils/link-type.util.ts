// src/app/p6/services/dcma/utils/link-type.util.ts
export type LinkType = 'FS' | 'SS' | 'FF' | 'SF' | 'UNKNOWN';

/**
 * Нормализует тип зависимости P6/XER/XML к одному из: FS/SS/FF/SF.
 * Поддерживает коды из разных источников (включая PR_* из XER),
 * числовые коды (0/1/2/3), и текстовые формы.
 */
export function normalizeLinkType(v: unknown): LinkType {
  if (v == null) return 'UNKNOWN';
  const s = String(v).trim().toUpperCase();
  if (!s) return 'UNKNOWN';

  const M: Record<string, Exclude<LinkType, 'UNKNOWN'>> = {
    // Finish-to-Start
    'FS': 'FS', 'PR_FS': 'FS', 'FS_REL': 'FS', '0': 'FS',
    'FINISH-TO-START': 'FS', 'FINISH TO START': 'FS', 'FINISHTOSTART': 'FS', 'FINISH START': 'FS',

    // Start-to-Start
    'SS': 'SS', 'PR_SS': 'SS', 'SS_REL': 'SS', '1': 'SS',
    'START-TO-START': 'SS', 'START TO START': 'SS', 'STARTTOSTART': 'SS', 'START START': 'SS',

    // Finish-to-Finish
    'FF': 'FF', 'PR_FF': 'FF', 'FF_REL': 'FF', '2': 'FF',
    'FINISH-TO-FINISH': 'FF', 'FINISH TO FINISH': 'FF', 'FINISHTOFINISH': 'FF', 'FINISH FINISH': 'FF',

    // Start-to-Finish
    'SF': 'SF', 'PR_SF': 'SF', 'SF_REL': 'SF', '3': 'SF',
    'START-TO-FINISH': 'SF', 'START TO FINISH': 'SF', 'STARTTOFINISH': 'SF', 'START FINISH': 'SF',
  };

  return M[s] ?? 'UNKNOWN';
}
