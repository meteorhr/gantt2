// src/app/p6/loader.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { parseXER, parseP6XML, summarize, buildSummarizeTable } from './parser';
import { P6DexieService } from './dexie.service';

@Injectable({ providedIn: 'root' })
export class LoaderService {
  private readonly http = inject(HttpClient);
  private readonly dexie = inject(P6DexieService);

  /** Простая сигнатура для определения формата по содержимому */
  private sniffFormat(raw: string): 'xml' | 'xer' {
    const s = raw.trimStart();
    if (s.startsWith('<')) return 'xml';
    // XER обычно таб- или пробел-разделён, первые строки — «%T ...», «%F ...», «%R ...»
    if (s.startsWith('%T') || s.includes('\t') || s.includes('\r\n')) return 'xer';
    return 'xer';
  }

  /**
   * Универсальная загрузка из assets.
   * Можно оставить только XER или XML; ниже — пример с XER.
   */
  async loadAndLogFromAssets(): Promise<void> {
    // пример: грузим XER из ассетов
    const xerPath = 'assets/xer/project.xer';
    const text = await firstValueFrom(this.http.get(xerPath, { responseType: 'text' }));

    const fmt = this.sniffFormat(text);
    const doc = fmt === 'xml' ? parseP6XML(text) : parseXER(text);

    // перезапишем SUMMARIZE с новым билдом (только непустые поля)
    doc.tables['SUMMARIZE'] = buildSummarizeTable(doc);

    await this.dexie.clear();
    await this.dexie.saveDocument(doc);

    console.group(fmt === 'xml' ? '[P6-XML] Сводка' : '[XER] Сводка');
    console.log(summarize(doc));
    console.groupEnd();

    console.group(fmt === 'xml' ? '[P6-XML] Header' : '[XER] Header');
    console.log(JSON.stringify(doc.header, null, 2));
    console.groupEnd();

    console.group(fmt === 'xml' ? '[P6-XML] Таблицы (JSON)' : '[XER] Таблицы (JSON)]');
    const tables = Object.values(doc.tables as Record<string, { name: string; fields: string[]; rows: unknown[] }>);
    for (const table of tables) {
      if (!table.rows?.length) continue; // печатаем только непустые
      console.group(table.name);
      console.log(JSON.stringify(
        { name: table.name, fields: table.fields, rows: table.rows },
        (_k, v) => v instanceof Date ? (v as Date).toISOString() : v,
        2
      ));
      console.groupEnd();
    }
    console.groupEnd();
  }

  /**
   * Полная очистка всех таблиц в IndexedDB (Dexie).
   */
  async resetDb(): Promise<void> {
    await this.dexie.clear();
  }

  /**
   * Загрузить файл пользователя (.xer ИЛИ .xml), распарсить и сохранить таблицы в IndexedDB (Dexie).
   * Формат определяется по расширению и по сигнатуре текста (sniff), чтобы не зависеть от неверного расширения.
   */
  async loadFromFile(file: File, opts?: { candidate?: boolean }): Promise<void> {
    const isCandidate = !!opts?.candidate;
    if (!isCandidate) { await this.dexie.clear(); }

    const name = file?.name ?? '';
    const lower = name.toLowerCase();

    if (!(lower.endsWith('.xer') || lower.endsWith('.xml'))) {
      throw new Error(`Поддерживаются только файлы с расширениями .xer и .xml (получен: "${name}")`);
    }

    const text = await file.text();
    if (!text || text.length === 0) {
      throw new Error('Файл пустой или не удалось прочитать содержимое.');
    }

    const sniffed = this.sniffFormat(text);
    const isXmlByExt = lower.endsWith('.xml');
    const fmt = isXmlByExt ? 'xml' : (sniffed === 'xml' ? 'xml' : 'xer');

    const doc = fmt === 'xml' ? parseP6XML(text) : parseXER(text);

    // BASE vs CANDIDATE:
    // - Base (isCandidate=false): сохраняем обычные таблицы, пересчитываем SUMMARIZE умной функцией.
    // - Candidate (isCandidate=true): берём ТОЛЬКО стандартные таблицы и сохраним их с префиксом "С_".
    if (isCandidate) {
      
      const t: any = doc.tables || {};
      const pick = (n: string) => {
        const tab = t?.[n];
        return tab ? { name: n, fields: tab.fields ?? [], rows: tab.rows ?? [] } : { name: n, fields: [], rows: [] };
      };
      doc.tables = {
        PROJECT:   pick('PROJECT'),
        TASK:      pick('TASK'),
        TASKRSRC:  pick('TASKRSRC'),
        RSRC:      pick('RSRC'),
        SUMMARIZE: pick('SUMMARIZE'),
        CALENDAR:  pick('CALENDAR'),
      };
    } else {
      try { await this.dexie.ensureCandidateStores(); } catch (e) {
        console.warn('[Dexie] ensureCandidateStores failed on base init:', e);
      }
      // Base: умный пересчёт SUMMARIZE поверх распарсенного документа
      doc.tables['SUMMARIZE'] = buildSummarizeTable(doc);
    }

    if (!isCandidate) {
      const present = Object.keys(doc.tables);
      await this.dexie.deleteTablesNotIn(present);
    }
    await this.dexie.saveDocument(doc, { prefix: isCandidate ? 'C_' : '' });

    if (!isCandidate) {
      // On base init, pre-create empty candidate tables with Latin 'C_' prefix.
      try {
        await this.dexie.ensureDashboardStore();
        await this.dexie.ensureCandidateStores();
      } catch (e) {
        console.warn('[Dexie] ensureCandidateStores failed on base init:', e);
      }
    }

    console.group(fmt === 'xml' ? '[P6-XML] Загрузка из файла' : '[XER] Загрузка из файла');
    console.log('File:', name);
    console.log(summarize(doc));
    console.groupEnd();
  }
}
