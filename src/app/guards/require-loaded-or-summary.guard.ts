import { inject } from '@angular/core';
import { Router, UrlTree, CanActivateChildFn } from '@angular/router';
import { AppStateService } from '../state/app-state.service';

/**
 * Пускаем на любые child-роуты ТОЛЬКО если данные загружены (isReady()).
 * Исключение — /summary и корень /: на них пускаем всегда.
 * Иначе — редиректим на /summary.
 */
export const requireLoadedOrSummaryGuard: CanActivateChildFn = (_route, state): boolean | UrlTree => {
  const app = inject(AppStateService);
  const router = inject(Router);

  const url = state.url || '/';
  const isSummary = url === '/' || url === '' || url.startsWith('/summary');

  if (isSummary) return true;     // summary доступен всегда
  if (app.isReady()) return true; // данные есть — пускаем

  // нет данных и пытаются зайти НЕ на summary → редирект
  return router.createUrlTree(['/summary']);
};
