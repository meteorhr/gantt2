import { AfterViewInit, Component, ViewChild, effect, inject } from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';
import { MatCardModule } from '@angular/material/card';
import { GanttCanvasComponent } from '../../gantt/gantt-canvas.component';
import { AppStateService } from '../../state/app-state.service';
import { NgIf } from '@angular/common';

@Component({
  selector: 'sv-gantt-tab',
  standalone: true,
  imports: [TranslocoModule, MatCardModule, GanttCanvasComponent],
  template: `
    <div style="padding: 8px; height: calc(100vh - 200px);">
      @if (!wm.isReady()) {
        <div class="mat-body" style="padding:8px;opacity:.7">
          {{ 'loading' | transloco }}
        </div>
      } @else {
        @defer (on viewport; prefetch on idle) {
          <gantt-canvas
            #gantt
            style="height: calc(100vh - 210px);"
            [data]="wm.activityData()"
            [refLines]="wm.refLines()"
            [columns]="wm.columns()">
          </gantt-canvas>
        } @placeholder {
          <div class="mat-body" style="padding:8px;opacity:.7">
            {{ 'loading' | transloco }}
          </div>
        }
      }
    </div>
  `,
})
export class GanttTabComponent implements AfterViewInit {
  readonly wm = inject(AppStateService);
  @ViewChild('gantt') gantt?: GanttCanvasComponent;

  constructor() {
    // Автоперерисовка при смене данных
    effect(() => {
      // чтение сигналов, чтобы эффект подписался
      const _ = this.wm.activityData();
      queueMicrotask(() => this.gantt?.reflow());
    });
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.gantt?.reflow());
  }
}
