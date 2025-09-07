// src/app/xer/xer-loader.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { parseXER, summarize } from './xer-parser';
import { XerDexieService } from './xer-dexie.service';

@Injectable({ providedIn: 'root' })
export class XerLoaderService {
  private readonly http = inject(HttpClient);
  private readonly dexie = inject(XerDexieService);
  /**
   * Загружает assets/xer/project.xer, парсит и сохраняет в IndexedDB (Dexie).
   * Печатает краткую сводку в console. Ничего не возвращает.
   */
  async loadAndLogFromAssets(): Promise<void> {
    // Жёсткий путь без плейсхолдеров — файл положи сюда:
    // src/assets/xer/project.xer
    const path = 'assets/xer/project.xer';

    const text = await this.http.get(path, { responseType: 'text' }).toPromise();
    if (!text) throw new Error(`Файл не прочитан: ${path}`);

    const doc = parseXER(text);

    await this.dexie.saveDocument(doc);

    // 1) Краткая сводка
    console.group('[XER] Сводка');
    console.log(summarize(doc));
    console.groupEnd();

    // 2) Заголовок
    console.group('[XER] Header');
    console.log(JSON.stringify(doc.header, null, 2));
    console.groupEnd();

    // 3) По таблицам — полноценный JSON
    console.group('[XER] Таблицы (JSON)');
    Object.entries(doc.tables).forEach(([name, table]) => {
      console.group(name);
      console.log(JSON.stringify({ name: table.name, fields: table.fields, rows: table.rows }, replacerDates, 2));
      console.groupEnd();
    });
    console.groupEnd();

  }

  /**
   * Полная очистка всех таблиц в IndexedDB (Dexie).
   */
  async resetDb(): Promise<void> {
    await this.dexie.clear();
  }

  /**
   * Загрузить XER-файл с устройства, распарсить и сохранить таблицы в IndexedDB (Dexie).
   * Допускает только расширение .xer.
   */
  async loadFromFile(file: File): Promise<void> {
    await this.dexie.clear();
    const name = file?.name ?? '';
    if (!name.toLowerCase().endsWith('.xer')) {
      throw new Error(`Поддерживаются только файлы с расширением .xer (получен: "${name}")`);
    }
    const text = await file.text();
    if (!text || text.length === 0) {
      throw new Error('Файл пустой или не удалось прочитать содержимое.');
    }
    const doc = parseXER(text);
    await this.dexie.saveDocument(doc);

    // Логи — по желанию
    console.group('[XER] Загрузка из файла');
    console.log('File:', name);
    console.log(summarize(doc));
    console.groupEnd();
  }
}

function replacerDates(_key: string, value: unknown) {
  return value instanceof Date ? value.toISOString() : value as any;
}

