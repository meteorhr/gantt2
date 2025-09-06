import { Component, inject, OnInit, signal, ViewChild } from '@angular/core';
import { ColumnDef, Node } from './gantt/models/gantt.model';
import { generateActivityData } from './generate-activity-data';
import { GanttCanvasComponent } from './gantt/gantt-canvas.component';
import { XerLoaderService } from './xer/xer-loader.service';
import { buildWbsTaskTree } from './xer/task-to-node.adapter';
import { MatTabChangeEvent, MatTabsModule } from '@angular/material/tabs';
import { MatListModule } from '@angular/material/list';
import { summarizeArray } from './xer/xer-parser';
import { MatTableModule } from '@angular/material/table';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';
interface RefLine {
  name: string;
  date: Date | string;   // можно '2025-12-01' или new Date(...)
  color: string;         // 'red' | '#f00' | 'rgb(...)'
  dash?: number[];       // опционально: штрих [6,4] и т.п.
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [GanttCanvasComponent, MatTabsModule, MatListModule, MatTableModule, TranslocoModule],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit {
  protected readonly title = signal('gantt2');
  private readonly xer = inject(XerLoaderService);
  public xerSummaryArray: any[] = [];

  activityData: Node[] = []

  @ViewChild('gantt') gantt?: GanttCanvasComponent;

  refLines: RefLine[] = [
    { name: "Current", date: new Date(), color: 'red'}, 
    { name: 'Baseline start', date: '2025-12-01', color: '#ff3b30', dash: [6,4] },
    { name: 'Gate 2',         date: new Date('2026-03-15'), color: 'teal' }
  ];

  public columns: ColumnDef[] = [
    { key: 'task_code',  title: 'Task Code',    width: 120, minWidth: 60 },
    { key: 'task_type_label', title: 'Task Type', width: 60, minWidth: 60},
    { key: 'name',   title: 'Task',   width: 420, minWidth: 120 },
    { key: 'start',  title: 'Start',  width: 120, minWidth: 80 },
    { key: 'finish', title: 'Finish', width: 120, minWidth: 80 },
    { key: 'status_code_label', title: 'Status', width: 100, minWidth: 80 },
    { key: 'rsrc_names', title: 'Resources', width: 140, minWidth: 80 },
  ];

  constructor(private transloco: TranslocoService) {
    const g =  generateActivityData(100, { seed: 20250826, rootsCount: 5, criticalProbability: true  });
    console.log(g)
    this.activityData = g;
    // На случай, если вкладка Gantt уже видима
    setTimeout(() => this.gantt?.reflow());
  }

  onTabChange(ev: MatTabChangeEvent) {
    // Index 1 corresponds to the second tab (Gantt)
    if (ev.index === 1) {
      // Даем вкладке дорисоваться и пересчитать размеры холста
      setTimeout(() => this.gantt?.reflow());
    }
  }

  async ngOnInit(): Promise<void> {
    try {

      // 0) гарантируем активный язык и что его json загружен
      const active = this.transloco.getActiveLang() || 'en';
      // setActiveLang возвращает void в используемой версии — просто активируем язык
      this.transloco.setActiveLang(active);
      // Дождаться, когда словарь активного языка будет загружен
      await firstValueFrom(this.transloco.selectTranslation(active).pipe(take(1)));
      
      // 1) загрузка и разбор XER (возвращает XERDocument)
      const doc = await this.xer.loadAndLogFromAssets();

      // 2) строим WBS→TASK дерево (OPC-порядок: сначала задачи, затем WBS)
      const tree = buildWbsTaskTree(doc, {
        baselineSource: 'none',
        translate: (key) => this.transloco.translate(key),
        debug: false,
      });

      console.group('[XER] Build summary');
      console.log('WBS roots:', tree.length);
      console.log('Tasks total:', countTasks(tree));
      console.log('[XER] tasks with resources:', countTasksWithRes(tree));
      console.log('[XER] sample with resources:', findFirstWithRes(tree));
      console.groupEnd();

      console.log(tree)

      // 4) отдать в диаграмму
      this.activityData = tree;
      this.xerSummaryArray = summarizeArray(doc);
      // На случай, если вкладка Gantt уже видима
      setTimeout(() => this.gantt?.reflow());
    } catch (err) {
      console.error('[XER] Init failed:', err);
    }
  }
}

function countTasksWithRes(nodes: Node[]): number {
  let acc = 0;
  const walk = (arr: Node[]) => {
    for (const n of arr) {
      if (!n.children || n.children.length === 0) {
        if (Array.isArray(n.resources) && n.resources.length > 0) acc++;
      } else {
        walk(n.children);
      }
    }
  };
  walk(nodes);
  return acc;
}

function findFirstWithRes(nodes: Node[]): Node | null {
  const stack = [...nodes];
  while (stack.length) {
    const n = stack.shift()!;
    if (!n.children || n.children.length === 0) {
      if (n.resources && n.resources.length) return n;
    } else {
      stack.unshift(...n.children);
    }
  }
  return null;
}

// ——— вспомогательная функция для быстрой сводки ———
function countTasks(nodes: Node[]): number {
  let acc = 0;
  const walk = (arr: Node[]) => {
    for (const n of arr) {
      // у WBS есть children, у задач — тоже (но пустые); считаем листья-задачи
      if (!n.children || n.children.length === 0) {
        acc += 1;
      } else {
        walk(n.children);
      }
    }
  };
  walk(nodes);
  return acc;
}
