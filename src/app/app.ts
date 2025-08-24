import { Component, signal } from '@angular/core';
import { WbsCanvasTableComponent } from './wbs-canvas-table.component';

@Component({
  selector: 'app-root',
  imports: [WbsCanvasTableComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('gantt2');
}
