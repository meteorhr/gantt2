import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { parseXER, summarize, buildSummarizeTable, parseP6XML } from './parser';
import { XerDexieService } from './dexie.service';
import { firstValueFrom } from 'rxjs';
import { P6Document, P6Scalar, P6Table } from './parser/parser.types';

@Injectable({ providedIn: 'root' })
export class XerLoaderService {
  private readonly http = inject(HttpClient);
  private readonly dexie = inject(XerDexieService);

  /**
   * Универсальная загрузка из assets:
   * - Сначала пытается открыть XML (assets/p6/project.xml),
   * - при ошибке — XER (assets/xer/project.xer).
   * Парсит, сохраняет в IndexedDB (Dexie) и печатает сводки.
   */
  async loadAndLogFromAssets(): Promise<void> {
    const xmlPath = 'assets/p6/project.xml';
    const xerPath = 'assets/xer/project.xer';

    let text: string | null = null;
    let isXml = false;

    // 1) Пробуем XML
    try {
      text = await firstValueFrom(this.http.get(xmlPath, { responseType: 'text' }));
      isXml = true;
    } catch {
      // 2) Фоллбэк на XER
      text = await firstValueFrom(this.http.get(xerPath, { responseType: 'text' }));
      isXml = false;
    }

    if (!text || text.length === 0) {
      throw new Error(`Файл не прочитан: ${xmlPath} или ${xerPath}`);
    }

    const doc = isXml ? parseP6XML(text) : parseXER(text);
    await this.dexie.saveDocument(doc);

    // Сводки/логи
    console.group(isXml ? '[P6-XML] Сводка' : '[XER] Сводка');
    console.log(summarize(doc));
    console.groupEnd();

    console.group(isXml ? '[P6-XML] Header' : '[XER] Header');
    console.log(JSON.stringify(doc.header, null, 2));
    console.groupEnd();

    console.group(isXml ? '[P6-XML] Таблицы (JSON)' : '[XER] Таблицы (JSON)');
    // Явно указываем тип значений, чтобы избежать TS18046 ('unknown').
    const tables = Object.values(doc.tables as Record<string, { name: string; fields: string[]; rows: unknown[] }>);
    for (const table of tables) {
      console.group(table.name);
      console.log(JSON.stringify(
        { name: table.name, fields: table.fields, rows: table.rows },
        replacerDates,
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
   * Жёсткая проверка расширения и пустоты содержимого.
   */
  async loadFromFile(file: File): Promise<void> {
    await this.dexie.clear();

    const name = file?.name ?? '';
    const lower = name.toLowerCase();

    if (!(lower.endsWith('.xer') || lower.endsWith('.xml'))) {
      throw new Error(`Поддерживаются только файлы с расширениями .xer и .xml (получен: "${name}")`);
    }

    const text = await file.text();
    if (!text || text.length === 0) {
      throw new Error('Файл пустой или не удалось прочитать содержимое.');
    }

    const isXml = lower.endsWith('.xml');
    const doc = isXml ? parseP6XML(text) : parseXER(text);
    await this.dexie.saveDocument(doc);

    console.group(isXml ? '[P6-XML] Загрузка из файла' : '[XER] Загрузка из файла');
    console.log('File:', name);
    console.log(summarize(doc));
    console.groupEnd();
  }
}

function replacerDates(_key: string, value: unknown) {
  return value instanceof Date ? value.toISOString() : (value as any);
}