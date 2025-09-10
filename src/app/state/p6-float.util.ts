// src/app/state/p6-float.util.ts
export function isCriticalTaskRow(t: any, hoursPerDay = 8): boolean {
    const pickProp = <T = unknown>(obj: any, keys: string[]): T | undefined => {
      if (!obj) return undefined as any;
      for (const k of keys) {
        if (Object.prototype.hasOwnProperty.call(obj, k)) return obj[k] as T;
        const found = Object.keys(obj).find(ok => ok.toLowerCase() === k.toLowerCase());
        if (found) return obj[found] as T;
      }
      return undefined as any;
    };
    const toNum = (v: unknown): number | null => {
      if (v === null || v === undefined || v === '') return null;
      const n = typeof v === 'number' ? v : Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const toDate = (v: unknown): Date | null => {
      if (!v) return null;
      const d = v instanceof Date ? v : new Date(String(v).replace(' ', 'T'));
      return Number.isFinite(d.valueOf()) ? d : null;
    };
    const diffH = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 3_600_000;
  
    // 1) Явные часы
    const tfh = toNum(pickProp(t, ['total_float_hr_cnt','TotalFloatHours','TF_Hours','tf_hours']));
    if (tfh != null) return tfh <= 0;
  
    // 2) Явные дни (для знака конверсия не важна, 0 и знак сохраняются)
    const tfd = toNum(pickProp(t, ['total_float_day_cnt','TotalFloatDays','TF_Days','tf_days']));
    if (tfd != null) return tfd <= 0;
  
    // 3) Неоднозначный TotalFloat + Units
    const tf = toNum(pickProp(t, ['TotalFloat','total_float','TF','Float']));
    if (tf != null) {
      const units = String(
        pickProp(t, ['TotalFloatUnits','FloatUnits','Units','DurationUnits']) ?? ''
      ).toLowerCase();
      // знак/нулевое значение одинаковы в днях и в часах
      return tf <= 0;
    }
  
    // 4) Расчёт по датам: min(LF-EF, LS-ES) в часах
    const ES = toDate(pickProp(t, ['early_start_date','EarlyStart']));
    const EF = toDate(pickProp(t, ['early_end_date','EarlyFinish']));
    const LS = toDate(pickProp(t, ['late_start_date','LateStart']));
    const LF = toDate(pickProp(t, ['late_end_date','LateFinish']));
    const diffs: number[] = [];
    if (EF && LF) diffs.push(diffH(EF, LF));
    if (ES && LS) diffs.push(diffH(ES, LS));
    if (diffs.length) return Math.min(...diffs) <= 0;
  
    // 5) Фолбэки-маркеры
    const fp  = toNum(pickProp(t, ['float_path','FloatPath']));
    const fpo = toNum(pickProp(t, ['float_path_order','FloatPathOrder']));
    if (fp === 1 || fpo === 1) return true;
    const lp = pickProp(t, ['OnLongestPath','IsOnLongestPath','Critical']);
    if (lp !== undefined) {
      const s = String(lp).trim().toLowerCase();
      if (['y','yes','true','1'].includes(s)) return true;
    }
  
    return false;
  }
  