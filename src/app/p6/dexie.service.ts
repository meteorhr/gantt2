// src/app/P6/dexie.service.ts
import { Injectable } from '@angular/core';
import Dexie, { Table } from 'dexie';
import { P6Document } from './parser/parser.types';


/**
 * Маппинг ключевых полей для основных P6-таблиц.
 * Если таблица отсутствует в маппинге, ключ будет подобран автоматически по данным (см. resolveKeyPath).
 */
const P6_PRIMARY_KEYS: Record<string, string> = {
    ACCOUNT: 'acct_id',
    ACTVCODE: 'actv_code_id',
    ACTVTYPE: 'actv_code_type_id',
    APPLYACTOPTIONS: '',
    ASGNMNTACAT: 'asgnmnt_catg_id',
    ASGNMNTCATTYPE: 'asgnmnt_catg_type_id',
    ASGNMNTCATVAL: 'asgnmnt_catg_id',
    BUDGCHNG: 'budg_chng_id',
    CALENDAR: 'clndr_id',
    COSTTYPE: 'cost_type_id',
    CURRTYPE: 'curr_id',
    DOCCATG: 'doc_catg_id',
    DOCSTAT: 'doc_status_id',
    DOCUMENT: 'doc_id',
    FINDATES: 'fin_dates_id',
    FUNDSRC: 'fund_id',
    ISSUHIST: '',
    MEMOTYPE: 'memo_type_id',
    OBS: 'obs_id',
    PCATTYPE: 'proj_catg_type_id',
    PCATVAL: 'proj_catg_id',
    PHASE: 'phase_id',
    PROJCOST: 'cost_item_id',
    PROJECT: 'proj_id',
    PROJEST: 'proj_est_id',
    PROJFUND: 'proj_fund_id',
    PROJISSU: 'issue_id',
    PROJPCAT: '',
    PROJTHRS: 'thresh_id',
    PROJWBS: 'wbs_id',
    PRORISK: 'risk_id',
    RCATTYPE: 'rsrc_catg_type_id',
    RCATVAL: 'rsrc_catg_id',
    RISKTYPE: 'risk_type_id',
    ROLECATTYPE: 'role_catg_type_id',
    ROLECATVAL: 'role_catg_id',
    ROLELIMIT: 'rolelimit_id',
    ROLERATE: 'role_rate_id',
    ROLERCAT: '',
    ROLES: 'role_id',
    RSRC: 'rsrc_id',
    RSRCCURV: 'curv_id',
    RSRCCURVDATA: 'curv_id',
    RSRCLEVELLIST: 'rsrc_level_list_id',
    RSRCRATE: 'rsrc_rate_id',
    RSRCRCAT: '',
    RSRCROLE: '',
    SCHEDOPTIONS: 'schedoptions_id',
    SHIFT: 'shift_id',
    SHIFTPER: 'shift_period_id',
    TASK: 'task_id',
    TASKACTV: '',
    TASKDOC: 'taskdoc_id',
    TASKFDBK: '',
    TASKFIN: '',
    TASKMEMO: 'memo_id',
    TASKNOTE: '',
    TASKPRED: 'task_pred_id',
    TASKPROC: 'proc_id',
    TASKRSRC: 'taskrsrc_id',
    TASKUSER: '',
    THRSPARM: 'thresh_parm_id',
    TRSRCFIN: '',
    UDFTYPE: 'udf_type_id',
    UDFVALUE: '',
    UMEASURE: 'unit_id',
    WBSBUDG: 'wbs_budg_id',
    WBSMEMO: 'wbs_memo_id',
    WBSRSRC_QTY: 'week_start',
    WBSSTEP: 'wbs_step_id',
    DASHBOARD: 'id'
};

/**
 * Вариант записи о схеме — оставлено для обратной совместимости, но теперь мы храним данные в отдельных object stores.
 * Файл остаётся типобезопасным и совместимым.
 */
export interface XerDbTableRecord {
  name: string;
  fields: string[];
  rows: any[];
  updatedAt: string; // ISO
  count: number;
}

class P6Db extends Dexie {
  // Декларативно Dexie требует хотя бы одну версию; начинаем с пустой схемы.
  constructor() {
    super('P6Db');
    this.version(1).stores({}); // пустая схема; object stores будут добавляться динамически через апгрейды
  }
}


@Injectable({ providedIn: 'root' })
export class P6DexieService {
  private readonly db = new P6Db();

  /**
   * Гарантирует наличие object store для таблицы XER.
   * Если стора нет — поднимаем версию БД и добавляем store с заданным ключом.
   */
  private async ensureStore(tableName: string, keyPath: string): Promise<void> {
    const exists = this.db.tables.some(t => t.name === tableName);
    if (!exists) {
      const nextVersion = Math.floor(this.db.verno) + 1;
      this.db.close();
      this.db.version(nextVersion).stores({ [tableName]: keyPath });
      await this.db.open();
      return;
    }
    // Проверка совпадения текущего ключа
    const tbl = this.db.table(tableName) as Table<any, any>;
    const currentKeyPath = (tbl.schema.primKey as any).keyPath;
    const current = Array.isArray(currentKeyPath) ? currentKeyPath.join(',') : currentKeyPath;
    if (current === keyPath) {
      return;
    }
    // Переопределяем store с новым ключом: удаляем и создаём заново
    const v1 = Math.floor(this.db.verno) + 1;
    this.db.close();
    this.db.version(v1).stores({ [tableName]: null });
    const v2 = v1 + 1;
    this.db.version(v2).stores({ [tableName]: keyPath });
    await this.db.open();
  }

  /**
   * Попытаться определить ключевое поле по данным.
   * Алгоритм:
   * 1) Явный маппинг P6_PRIMARY_KEYS.
   * 2) Если первый ряд содержит один из следующих кандидатов — взять его.
   * 3) Иначе — автоинкремент '++$id'.
   */
  private resolveKeyPath(tableName: string, rows: any[]): string {
    // Нормализуем имя таблицы к UPPERCASE для словаря
    const tUpper = tableName.toUpperCase();
    const hasExplicit = Object.prototype.hasOwnProperty.call(P6_PRIMARY_KEYS, tUpper);
    if (hasExplicit) {
      const explicit = P6_PRIMARY_KEYS[tUpper];
      // Пустая строка в словаре означает "нет естественного ключа" — используем сквозной _id
      return explicit && explicit.length > 0 ? explicit : '_id';
    }
  
    // Если таблица отсутствует в словаре — пробуем угадать по данным
    const sample = rows.find(r => !!r) ?? {};
    const lc = tableName.toLowerCase();
    const candidates = new Set<string>([
      `${lc}_id`,
      'id',
      'guid',
      // Часто встречающиеся P6 ключи
      'curr_id',
      'proj_id',
      'task_id',
      'wbs_id',
      'clndr_id',
      'rsrc_id',
      'role_id',
      'taskrsrc_id',
      'actv_code_id',
      'actvtype_id',
      'actv_code_type_id',
      'task_pred_id'
    ]);
    for (const c of candidates) {
      if (Object.prototype.hasOwnProperty.call(sample, c)) {
        return c;
      }
    }
    // Fallback: явное сквозное нумерование по полю _id
    return '_id';
  }

  /** Сохранить одну таблицу XER в отдельный object store с именем tableName. */
  async saveTable(tableName: string, rows: any[], fields: string[] = []): Promise<void> {
    const keyPath = this.resolveKeyPath(tableName, rows);
    // Если естественного ключа нет — нумеруем строки 1..N и пишем в поле _id
    let data = rows;
    if (keyPath === '_id') {
      data = rows.map((r, i) => ({ ...r, _id: i + 1 }));
    }
    await this.ensureStore(tableName, keyPath);
    const table = this.db.table(tableName) as Table<any, any>;

    // Очистим предыдущие данные таблицы, чтобы не зарастать старыми строками
    await table.clear();
    if (data.length) {
      await table.bulkPut(data);
    }

    // Доп. мета (fields/updatedAt/count) при необходимости можно вынести в отдельный служебный store.
  }

  /** Сохранить таблицу в указанный store (storeName), вычисляя ключ по базовому имени (baseTableName). */
  private async saveTableAs(storeName: string, baseTableName: string, rows: any[], fields: string[] = []): Promise<void> {
    const keyPath = this.resolveKeyPath(baseTableName, rows);
    let data = rows;
    if (keyPath === '_id') {
      data = rows.map((r, i) => ({ ...r, _id: i + 1 }));
    }
    await this.ensureStore(storeName, keyPath);
    const table = this.db.table(storeName) as Table<any, any>;
    await table.clear();
    if (data.length) {
      await table.bulkPut(data);
    }
  }

  /**
   * Сохранить весь документ:
   * - Если options.prefix пустой — сохраняем как стандартные stores (имена = исходные названия таблиц)
   * - Если options.prefix задан — сохраняем в stores с именами `${prefix}${TableName}`
   */
  async saveDocument(doc: P6Document, options?: { prefix?: string }): Promise<void> {
    const prefix = (options?.prefix ?? '').trim();
    for (const [name, table] of Object.entries(doc.tables)) {
      const rows = Array.isArray(table.rows) ? table.rows : [];
      const fields = Array.isArray(table.fields) ? table.fields : [];
      const storeName = prefix ? `${prefix}${name}` : name;
      await this.saveTableAs(storeName, name, rows, fields);
    }
  }

  /** Получить все строки произвольной таблицы (store) по имени */
  async getRows(tableName: string): Promise<any[]> {
    const exists = this.db.tables.some(t => t.name === tableName);
    if (!exists) return [];
    const table = this.db.table(tableName) as Table<any, any>;
    return table.toArray();
  }
  

  /** Забрать все сохранённые таблицы и восстановить XERDocument для дальнейшей обработки (buildWbsTaskTree и т.д.) */
  async getDocument(): Promise<P6Document> {
    const tablesList = this.db.tables.map(t => t.name);

    const tables: Record<string, { name: string; fields: string[]; rows: any[] }> = {};
    for (const name of tablesList) {
      const rows = await this.getRows(name);
      const fields = rows.length ? Object.keys(rows[0]) : [];
      tables[name] = { name, fields, rows };
    }
    return { header: null, tables };
  }

  /**
   * Удалить все STORES, имена которых начинаются с указанного префикса.
   * Внимание: это удаление самих object stores (через bump версии), а не просто очистка данных.
   */
  async deleteTablesByPrefix(prefix: string): Promise<void> {
    const p = (prefix ?? '').trim();
    if (!p) return;
    const names = this.db.tables.map(t => t.name).filter(n => typeof n === 'string' && n.startsWith(p));
    if (names.length === 0) return;
    const nextVersion = Math.floor(this.db.verno) + 1;
    const schema: Record<string, string | null> = {};
    for (const n of names) {
      schema[n] = null; // удалить store
    }
    this.db.close();
    this.db.version(nextVersion).stores(schema);
    await this.db.open();
  }

  /**
   * Удалить из БД все СТАНДАРТНЫЕ stores (без префикса), которых НЕТ в списке keepNames.
   * Под «стандартным» понимаем имя в формате UPPER_SNAKE_CASE (например, PROJECT, TASKPRED, WBSRSRC_QTY).
   * Рекомендуется использовать префиксы кандидатов вида 'cand__' (с разделителем), чтобы исключить совпадения.
   */
  async deleteTablesNotIn(keepNames: string[]): Promise<void> {
    const keep = new Set((keepNames ?? []).map(s => String(s)));
    const isStandardName = (n: string) => /^[A-Z][A-Z0-9_]*$/.test(n);
    const toDrop = this.db.tables
      .map(t => t.name)
      .filter(n => isStandardName(n) && !keep.has(n));

    if (toDrop.length === 0) return;

    const nextVersion = Math.floor(this.db.verno) + 1;
    const schema: Record<string, string | null> = {};
    for (const n of toDrop) {
      schema[n] = null; // удалить store
    }
    this.db.close();
    this.db.version(nextVersion).stores(schema);
    await this.db.open();
  }

  /** Очистить все object stores (данные) */
  async clear(): Promise<void> {
    await Promise.all(this.db.tables.map(t => t.clear()));
  }

  /** Удалить данные одной таблицы (store) по имени */
  async deleteTable(name: string): Promise<void> {
    const exists = this.db.tables.some(t => t.name === name);
    if (!exists) return;
    const table = this.db.table(name) as Table<any, any>;
    await table.clear();
  }

  /** Миграция ключа store на ключ из словаря P6_PRIMARY_KEYS (с перезаписью данных) */
  async migrateStoreKeyToExplicit(tableName: string): Promise<void> {
    const rows = await this.getRows(tableName);
    await this.saveTable(tableName, rows);
  }
  
  /** Специальный метод: CURRTYPE → ключ curr_id (устранить "$id") */
  async migrateCurrtypeToCurrId(): Promise<void> {
    const rows = await this.getRows('CURRTYPE'); // читаем до смены схемы
    await this.ensureStore('CURRTYPE', 'curr_id'); // пересоздать store с правильным keyPath
    const table = this.db.table('CURRTYPE') as Table<any, any>;
    await table.clear();
    if (rows.length) {
      await table.bulkPut(rows); // запишем обратно — у объектов уже есть curr_id
    }
  }

  /** Получить все строки таблицы PROJECT */
  async getProjectRows(): Promise<any[]> {
    return this.getRows('PROJECT');
  }

  /** Найти одну строку PROJECT по proj_id */
  async getProjectById(proj_id: number): Promise<any | undefined> {
    const rows = await this.getProjectRows();
    return rows.find((r: any) => Number(r?.proj_id) === Number(proj_id));
  }

  public async ensureCandidateStores(): Promise<void> {
    await this.ensureStore('C_PROJECT', 'proj_id');
    await this.ensureStore('C_TASK', 'task_id');
    await this.ensureStore('C_TASKRSRC', 'id');
    await this.ensureStore('C_RSRC', 'rsrc_id');
    await this.ensureStore('C_SUMMARIZE', 'id');
    await this.ensureStore('C_CALENDAR', 'clndr_id');
  }

  public async ensureDashboardStore(): Promise<void> {
     await this.ensureStore('DASHBOARD', 'id');
  }

}