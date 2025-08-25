import { Component, signal } from '@angular/core';
import { WbsCanvasTableComponent, WbsNode } from './wbs-canvas-table.component';

interface RefLine {
  name: string;
  date: Date | string;   // можно '2025-12-01' или new Date(...)
  color: string;         // 'red' | '#f00' | 'rgb(...)'
  dash?: number[];       // опционально: штрих [6,4] и т.п.
}


@Component({
  selector: 'app-root',
  imports: [WbsCanvasTableComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('gantt2');

  refLines: RefLine[] = [
    { name: 'Baseline start', date: '2025-12-01', color: '#ff3b30', dash: [6,4] },
    { name: 'Gate 2',         date: new Date('2026-03-15'), color: 'teal' }
  ];

  activityData: WbsNode[] = [
    {
      id: 'n1',
      name: 'Проект',
      start: '2025-09-01',
      finish: '2026-06-30',
      children: [
        {
          id: 'n1.1',
          name: 'Инициация',
          start: '2025-09-01',
          finish: '2025-10-15',
          children: [
            { id: 'n1.1.1', name: 'Формирование WBS', start: '2025-09-01', finish: '2025-09-07' },
            { id: 'n1.1.2', name: 'ФЭМ и CAR',        start: '2025-09-05', finish: '2025-10-10' },
          ]
        },
        {
          id: 'n1.2',
          name: 'Проектирование и Закуп',
          start: '2025-10-16',
          finish: '2026-02-28',
          children: [
            { id: 'n1.2.1', name: 'P&ID и ТЗ',         start: '2025-10-16', finish: '2025-12-01' },
            { id: 'n1.2.2', name: 'Тендер и Контракты', start: '2025-12-02', finish: '2026-02-28' },
          ]
        },
      ]
    }
  ];

}
