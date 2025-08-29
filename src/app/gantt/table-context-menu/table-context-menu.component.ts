import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  HostListener,
  Input,
  Output,
} from '@angular/core';

@Component({
  selector: 'gantt-table-context-menu',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './table-context-menu.component.html',
  styleUrls: ['./table-context-menu.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TableContextMenuComponent {
  @Input() open = false;
  /** Позиция во ВЬЮПОРТНЫХ координатах scroll-wrapper’а */
  @Input() x = 0;
  @Input() y = 0;

  @Output() closed = new EventEmitter<void>();
  @Output() insertBefore = new EventEmitter<void>();
  @Output() insertAfter = new EventEmitter<void>();
  @Output() deleteRow = new EventEmitter<void>();
  @Output() duplicateRow = new EventEmitter<void>();

  @HostListener('document:click', ['$event'])
  onDocClick(_: MouseEvent) {
    if (this.open) this.closed.emit();
  }
  @HostListener('document:keydown', ['$event'])
  onDocKey(e: KeyboardEvent) {
    if (this.open && e.key === 'Escape') this.closed.emit();
  }

  onContextMenu(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  onBefore(e: MouseEvent)   { e.stopPropagation(); this.insertBefore.emit(); }
  onAfter(e: MouseEvent)    { e.stopPropagation(); this.insertAfter.emit(); }
  onDelete(e: MouseEvent)   { e.stopPropagation(); this.deleteRow.emit(); }
  onDuplicate(e: MouseEvent){ e.stopPropagation(); this.duplicateRow.emit(); }
}
