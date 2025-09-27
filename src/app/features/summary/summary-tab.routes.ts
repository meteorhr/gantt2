
import { Routes } from '@angular/router';
//import { provideTranslocoScope } from '@jsverse/transloco';
import { SummaryTabComponent } from './summary-tab.component';
export const SUMMARY_ROUTES: Routes = [
  {
    path: '',
    component: SummaryTabComponent,
    //providers: [
    //  provideTranslocoScope({
    //    scope: 'summary',
    //    alias: 'summary',
    //  }),
    //  {
    //    provide: 'TRANSLOCO_LOADING_TEMPLATE',
    //    useValue: '<p>loading...</p>',
    //  },
    //],
    canActivateChild: [],
    children: [],
  },
];