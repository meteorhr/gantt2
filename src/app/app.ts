import { Component, signal } from '@angular/core';
import { Node } from './gantt/models/gantt.model';
import { generateActivityData } from './ generate-activity-data';
import { GanttCanvasComponent } from './gantt/gantt-canvas.component';

interface RefLine {
  name: string;
  date: Date | string;   // можно '2025-12-01' или new Date(...)
  color: string;         // 'red' | '#f00' | 'rgb(...)'
  dash?: number[];       // опционально: штрих [6,4] и т.п.
}



@Component({
  selector: 'app-root',
  imports: [GanttCanvasComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('gantt2');

  activityData: Node[] = []

  refLines: RefLine[] = [
    { name: 'Baseline start', date: '2025-12-01', color: '#ff3b30', dash: [6,4] },
    { name: 'Gate 2',         date: new Date('2026-03-15'), color: 'teal' }
  ];

  constructor(){
    const g =  generateActivityData(100, { seed: 20250826, rootsCount: 5, criticalProbability: true  });
    console.log(g)
    this.activityData = g 
  }

 


  
  test: Node[] =  [
    {
      "id": "n1",
      "name": "Проект",
      "start": "2025-09-01",
      "finish": "2026-06-30",
      "complete": 10,
      "children": [
        {
          "id": "n1.1",
          "name": "Инициация",
          "start": "2025-09-01",
          "finish": "2025-10-15",
          "complete": 10,
          "children": [
            {
              "id": "n1.1.1",
              "name": "Формирование WBS",
              "start": "2025-09-01",
              "complete": 10,
              "finish": "2025-09-07",
              "baselineStart": "2025-09-01",
              "baselineFinish": "2025-09-05"
              
            },
            {
              "id": "n1.1.2",
              "name": "ФЭМ и CAR",
              "start": "2025-09-05",
              "complete": 10,
              "finish": "2025-10-10",
              "dependency": [
                "n1.1.1"
              ],

              
            }
          ],
          
            "baselineStart": "2025-09-01",
            "baselineFinish": "2025-10-15"
          
        },
        {
          "id": "n1.2",
          "name": "Проектирование и Закуп",
          "start": "2025-10-16",
          "finish": "2026-02-28",
          "children": [
            {
              "id": "n1.2.1",
              "complete": 10,
              "name": "P&ID и ТЗ",
              "start": "2025-10-16",
              "finish": "2025-12-01",
              "baselineStart": "2025-10-16",
               "baselineFinish": "2025-12-01"
              
            },
            {
              "id": "n1.2.2",
              "complete": 10,
              "name": "Тендер и Контракты",
              "start": "2025-12-02",
              "finish": "2026-02-28",
             "baselineStart": "2025-12-02",
              "baselineFinish": "2026-02-28"
              
            }
          ],
          "baselineStart": "2025-10-16",
          "baselineFinish": "2026-02-28"
          
        }
      ],
      "baselineStart": "2025-09-01",
       "baselineFinish": "2026-06-30"
      
    }
  ]


}
