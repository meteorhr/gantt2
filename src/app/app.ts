import { Component, inject, OnInit, signal, ViewChild } from '@angular/core';
import { ColumnDef, Node } from './gantt/models/gantt.model';
import { generateActivityData } from './generate-activity-data';
import { GanttCanvasComponent } from './gantt/gantt-canvas.component';
import { XerLoaderService } from './xer/xer-loader.service';
import { buildWbsTaskByProjectTreeFromIndexedDb } from './xer/task-to-node.adapter';
import { MatTabChangeEvent, MatTabsModule } from '@angular/material/tabs';
import { MatListModule } from '@angular/material/list';
import { MatTableModule } from '@angular/material/table';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';
import { XerDexieService } from './xer/xer-dexie.service';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatButtonModule } from '@angular/material/button';

interface RefLine {
  name: string;
  date: Date | string;   // можно '2025-12-01' или new Date(...)
  color: string;         // 'red' | '#f00' | 'rgb(...)'
  dash?: number[];       // опционально: штрих [6,4] и т.п.
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    GanttCanvasComponent, 
    MatTabsModule, 
    MatListModule, 
    MatIconModule,
    MatButtonModule,
    MatCardModule,
    MatProgressBarModule,
    MatTableModule, 
    TranslocoModule],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit {
  protected readonly title = signal('ScheduleVision');
  private readonly xer = inject(XerLoaderService);
  private readonly dexie = inject(XerDexieService);
  public xerSummaryArray: any[] = [];
  readonly isReady = signal(false);
readonly loading = signal(false);
readonly error = signal<string | null>(null);

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
    { key: 'complete_pct_type_label', title: '%', width: 60, minWidth: 40, align: 'right' },

  

    { key: 'start',  title: 'Act. Start',  width: 120, minWidth: 80 },
    { key: 'finish', title: 'Act. Finish', width: 120, minWidth: 80 },

    { key: 'earlyStart',  title: 'Ear. Start',  width: 120, minWidth: 80 },
    { key: 'earlyFinish', title: 'Ear. Finish', width: 120, minWidth: 80 },

    { key: 'lateStart',  title: 'Late Start',  width: 120, minWidth: 80 },
    { key: 'lateFinish', title: 'Late Finish', width: 120, minWidth: 80 },

    { key: 'expectEnd', title: 'Expect End', width: 120, minWidth: 80 },

  

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
    await this.dexie.clear();
    this.isReady.set(false);
    this.loading.set(false);
    this.error.set(null);

    try {

      // 0) гарантируем активный язык и что его json загружен
      const active = this.transloco.getActiveLang() || 'en';
      // setActiveLang возвращает void в используемой версии — просто активируем язык
      this.transloco.setActiveLang(active);
      // Дождаться, когда словарь активного языка будет загружен
      await firstValueFrom(this.transloco.selectTranslation(active).pipe(take(1)));
      
      // 1) загрузка и разбор XER (возвращает XERDocument)
      await this.xer.loadAndLogFromAssets();

      const project_id = 421;

      // 2) строим WBS→TASK дерево (OPC-порядок: сначала задачи, затем WBS)
      const tree = await buildWbsTaskByProjectTreeFromIndexedDb(
        this.dexie,                       // <-- передаём сервис
        project_id,
        {
          baselineSource: 'none',
          translate: (key) => this.transloco.translate(key),
          debug: false,
        }
      );

      console.group('[XER] Build summary');
      console.log('WBS roots:', tree.length);
      console.log('Tasks total:', countTasks(tree));
      console.log('[XER] tasks with resources:', countTasksWithRes(tree));
      console.log('[XER] sample with resources:', findFirstWithRes(tree));
      console.groupEnd();

      console.log(tree)

      // 4) отдать в диаграмму
      this.activityData = tree;
      const sumRows = await this.dexie.getRows('SUMMARIZE');
      this.xerSummaryArray = (sumRows as any[]).map(r => ({ ...r, params: r && r.params ? JSON.parse(String(r.params)) : {} }));
      // На случай, если вкладка Gantt уже видима
      setTimeout(() => this.gantt?.reflow());
    } catch (err) {
      console.error('[XER] Init failed:', err);
    }
  }

  async onFileSelected(ev: Event): Promise<void> {
  const input = ev.target as HTMLInputElement;
  const file = input?.files && input.files.length ? input.files[0] : null;
  if (!file) return;
  this.loading.set(true);
  this.error.set(null);
  try {
    await this.xer.loadFromFile(file);

    const projects = await this.dexie.getRows('PROJECT');
    if (!projects.length || projects[0]?.proj_id == null) {
      throw new Error('Таблица PROJECT пуста или proj_id отсутствует.');
    }
    const project_id = Number(projects[0].proj_id);
    if (!Number.isFinite(project_id)) {
      throw new Error('Некорректный proj_id в таблице PROJECT.');
    }

    const tree = await buildWbsTaskByProjectTreeFromIndexedDb(
      this.dexie,
      project_id,
      {
        baselineSource: 'none',
        translate: (key) => this.transloco.translate(key),
        debug: false,
      }
    );
    this.activityData = tree;

    const sumRows = await this.dexie.getRows('SUMMARIZE');
    this.xerSummaryArray = (sumRows as any[]).map(r => ({
      ...r,
      params: r && r.params ? JSON.parse(String(r.params)) : {}
    }));

    this.isReady.set(true);
    this.loading.set(false);
    setTimeout(() => this.gantt?.reflow());
  } catch (e: any) {
    console.error('[XER] File load failed:', e);
    this.error.set(typeof e?.message === 'string' ? e.message : 'Не удалось загрузить файл.');
    this.loading.set(false);
    this.isReady.set(false);
  } finally {
    if (input) input.value = '';
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


