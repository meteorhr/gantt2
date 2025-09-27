import { inject } from '@angular/core';
import { CanActivateFn, CanActivateChildFn, Router, UrlTree } from '@angular/router';
import { AppStateService } from '../state/app-state.service';

async function ensureLoadedOrRedirect(): Promise<boolean | UrlTree> {
  const wm = inject(AppStateService);
  const router = inject(Router);

  if (wm.isReady()) return true;

  const restored = await wm.restoreIfPossible();
  if (restored) return true;

  // Данных нет — запрещаем вход в /app и редиректим на корень ('')
  return router.parseUrl('');
}

export const requireLoadedGuard: CanActivateFn = async () => {
  return ensureLoadedOrRedirect();
};

export const requireLoadedChildGuard: CanActivateChildFn = async () => {
  return ensureLoadedOrRedirect();
};