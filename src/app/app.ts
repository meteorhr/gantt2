import { Component, inject, OnInit, signal } from '@angular/core';
import { Node } from './gantt/models/gantt.model';
import { generateActivityData } from './ generate-activity-data';
import { GanttCanvasComponent } from './gantt/gantt-canvas.component';
import { XerLoaderService } from './xer/xer-loader.service';
import { getTable, parseXER } from './xer/xer-parser';
import { buildWbsTaskTree } from './xer/task-to-node.adapter';

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
export class App implements OnInit {
  protected readonly title = signal('gantt2');
  private readonly xer = inject(XerLoaderService);

  activityData: Node[] = []

  refLines: RefLine[] = [
    { name: "Current", date: new Date(), color: 'red'}, 
    { name: 'Baseline start', date: '2025-12-01', color: '#ff3b30', dash: [6,4] },
    { name: 'Gate 2',         date: new Date('2026-03-15'), color: 'teal' }
  ];

  constructor(){
    const g =  generateActivityData(100, { seed: 20250826, rootsCount: 5, criticalProbability: true  });
    console.log(g)
    this.activityData = g 
  }
  async ngOnInit(): Promise<void> {
    // 1) Загружаем и парсим XER: сервис возвращает XERDocument
    const doc = await this.xer.loadAndLogFromAssets();
  
    // 2) Берём таблицу TASK (без учёта регистра, бросит ошибку если не найдёт)
    //const taskTable: any = getTable(doc, 'TASK', { required: true });
  
    // 3) Выводим в консоль поля и несколько первых строк
    //console.group('[XER] TASK');
    //console.log('fields:', taskTable.fields);
    //console.log('rows:', taskTable.rows.length);
    //console.log( taskTable.rows)
    //console.groupEnd();
    
    //console.log(buildWbsTaskTree(doc))

    this.activityData =  buildWbsTaskTree(doc, {baselineSource: "none", debug: false})
  }

}
