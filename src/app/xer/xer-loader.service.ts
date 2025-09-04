// src/app/xer/xer-loader.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { parseXER, summarize, XERDocument } from './xer-parser';

@Injectable({ providedIn: 'root' })
export class XerLoaderService {
  private readonly http = inject(HttpClient);

  /**
   * Загружает assets/xer/project.xer, парсит и печатает JSON в console.
   * Возвращает промис с полным документом.
   */
  async loadAndLogFromAssets(): Promise<XERDocument> {
    // Жёсткий путь без плейсхолдеров — файл положи сюда:
    // src/assets/xer/project.xer
    const path = 'assets/xer/project.xer';

    const text = await this.http.get(path, { responseType: 'text' }).toPromise();
    if (!text) throw new Error(`Файл не прочитан: ${path}`);

    const doc = parseXER(text);

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

    return doc;
  }
}

function replacerDates(_key: string, value: unknown) {
  return value instanceof Date ? value.toISOString() : value as any;
}
