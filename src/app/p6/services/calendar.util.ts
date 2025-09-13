import { CALENDARRow, TaskRow } from "../models";

function getHoursPerDayForTask(task: TaskRow | undefined, calById: Map<string | number, CALENDARRow>, fallback = 8): number {
  if (!task) return fallback;
  const cal = task.clndr_id ? calById.get(task.clndr_id) : undefined;
  const h = cal?.["hours_per_day_eff"] 
        ?? cal?.day_hr_cnt 
        ?? (cal?.week_hr_cnt ? cal.week_hr_cnt / 5 : null) 
        ?? (cal?.month_hr_cnt ? cal.month_hr_cnt / 21.667 : null) 
        ?? (cal?.year_hr_cnt ? cal.year_hr_cnt / 260 : null);
  return (typeof h === 'number' && h > 0) ? h : fallback;
}