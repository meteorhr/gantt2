
import { Routes } from '@angular/router';
//import { provideTranslocoScope } from '@jsverse/transloco';
import { GanttTabComponent } from './gantt-tab.component';
export const GANTT_ROUTES: Routes = [
  {
    path: '',
    component: GanttTabComponent,
    //providers: [
    //  provideTranslocoScope({
    //    scope: 'gantt',
    //    alias: 'gantt',
    //  }),
    // {
    //    provide: 'TRANSLOCO_LOADING_TEMPLATE',
    //    useValue: '<p>loading...</p>',
    //  },
    //],
    canActivateChild: [],
    children: [],
  },
];