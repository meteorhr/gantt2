import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import Dexie from 'dexie';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `<router-outlet></router-outlet>`,
})
export class App implements OnInit {
  async ngOnInit() {
    try {
      // Удаляем базу P6DB, если она существует
      const deleted = await Dexie.delete('P6Db');
      console.log('P6DB deleted:', deleted); // true = удалена, false = не было
    } catch (error) {
      console.error('Ошибка при удалении P6DB:', error);
    }
  }
}