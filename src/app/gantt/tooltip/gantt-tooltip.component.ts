import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { GanttTooltipData } from '../models/gantt.model';

@Component({
  selector: 'gantt-tooltip',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './gantt-tooltip.component.html',
  styleUrls: ['./gantt-tooltip.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GanttTooltipComponent {
  @Input() open = false;
  @Input() x = 0;         // координаты внутри ganttHost
  @Input() y = 0;
  @Input() data: GanttTooltipData | null = null;
}
