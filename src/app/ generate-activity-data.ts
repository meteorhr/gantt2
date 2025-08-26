// generate-activity-data.ts 
// Самодостаточный генератор случайной иерархии задач под интерфейс Node.
import { Node } from './gantt/models/gantt.model';
export type IsoDate = `${number}-${number}-${number}`;

export interface GenerateOptions {
  totalNodes?: number;             // Общее число узлов по всему лесу
  rootsCount?: number;             // Сколько корней создать (n1, n2, n3, ...)
  projectStart?: IsoDate;          // Старт каждого корня
  projectFinish?: IsoDate;         // Финиш каждого корня
  minChildrenPerParent?: number;
  maxChildrenPerParent?: number;
  dependencyProbability?: number;  // 0..1
  maxDependenciesPerNode?: number; // >=1
  criticalProbability?: boolean;   // вкл/выкл случайной пометки критичности (по умолчанию false)
  seed?: number;                   // базовый seed
  minTaskDurationDays?: number;    // >=1
  maxTaskDurationDays?: number;    // >=min
}

// ---------- Даты ----------
function toDate(d: IsoDate): Date {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}
function formatISO(d: Date): IsoDate {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}` as IsoDate;
}
function addDays(d: Date, days: number): Date {
  const nd = new Date(d.getTime());
  nd.setUTCDate(nd.getUTCDate() + days);
  return nd;
}
function clampDate(d: Date, min: Date, max: Date): Date {
  if (d.getTime() < min.getTime()) return new Date(min);
  if (d.getTime() > max.getTime()) return new Date(max);
  return d;
}
function daysBetween(a: Date, b: Date): number {
  const MS = 24 * 60 * 60 * 1000;
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / MS));
}

// ---------- PRNG ----------
function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function rand() {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
function randInt(rand: () => number, min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min;
}
function randChoice<T>(rand: () => number, arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}
function maybe(rand: () => number, p: number): boolean {
  return rand() < p;
}

// ---------- Имена ----------
const ROOT_NAMES = ['Проект', 'Программа', 'Инициатива', 'Портфель'];
const PHASE_NAMES = [
  'Инициация','Планирование','Проектирование','Закуп','Строительство',
  'Монтаж','ПНР','Ввод в эксплуатацию','Закрытие','Контроль качества',
  'Согласования','Лицензирование','Логистика','Инфраструктура'
];
const WORK_NAMES = [
  'Формирование WBS','График работ','ТЗ и P&ID','ФЭМ и CAR','Тендеры',
  'Контракты','Рабочая документация','Поставка оборудования',
  'Монтаж оборудования','КИПиА','Кабеленесущие системы','Шефмонтаж',
  'ПНР системы','Интеграция','Обучение персонала','IPR-аудит',
  'Риск-реестр','Оценка стоимости','Уточнение бюджета','Управление изменениями'
];

// ---- Калибровки для "critical преимущественно false" ----
const RANDOM_CRITICAL_P = 0.10 as const;         // если включён random-critical
const HEUR_EDGE_ONLY_P = 0.20 as const;          // если только "край", без длинной
const HEUR_LONG_ONLY_P = 0.15 as const;          // если только "длинная", без края
const UNUSUALLY_LONG_RATIO = 0.75 as const;      // 75% длительности родителя
const MIN_ABS_LONG_DAYS = 7 as const;            // минимум 7 дней как «длинная»

// ---------- Внутренние утилиты ----------
interface TaskMeta { id: string; start: Date; finish: Date; }
function makeChildId(parentId: string, childIndex1based: number): string {
  return `${parentId}.${childIndex1based}`;
}
function recalcRangesByChildren(node: Node): void {
  if (!node.children || node.children.length === 0) return;
  let minStart = toDate(node.children[0].start);
  let maxFinish = toDate(node.children[0].finish);
  let minBStart: Date | undefined = node.children[0].baselineStart ? toDate(node.children[0].baselineStart!) : undefined;
  let maxBFinish: Date | undefined = node.children[0].baselineFinish ? toDate(node.children[0].baselineFinish!) : undefined;

  for (let i = 1; i < node.children.length; i++) {
    const c = node.children[i];
    const cs = toDate(c.start);
    const cf = toDate(c.finish);
    if (cs < minStart) minStart = cs;
    if (cf > maxFinish) maxFinish = cf;
    if (c.baselineStart) {
      const cbs = toDate(c.baselineStart);
      minBStart = !minBStart || cbs < minBStart ? cbs : minBStart;
    }
    if (c.baselineFinish) {
      const cbf = toDate(c.baselineFinish);
      maxBFinish = !maxBFinish || cbf > maxBFinish ? cbf : maxBFinish;
    }
  }
  node.start = formatISO(minStart);
  node.finish = formatISO(maxFinish);
  if (minBStart && maxBFinish) {
    node.baselineStart = formatISO(minBStart);
    node.baselineFinish = formatISO(maxBFinish);
  }
}
function postOrderRecalc(node: Node): void {
  if (node.children && node.children.length) {
    for (const c of node.children) postOrderRecalc(c);
    recalcRangesByChildren(node);
  }
}

// ---------- Публичные утилиты ----------
export function countNodes(forest: Node[]): number {
  let n = 0;
  const stack = [...forest];
  while (stack.length) {
    const cur = stack.pop()!;
    n++;
    if (cur.children && cur.children.length) {
      for (let i = 0; i < cur.children.length; i++) stack.push(cur.children[i]);
    }
  }
  return n;
}

// ---------- Генерация одного корня (дерева) ----------
function generateSingleRoot(
  rootIndex1based: number,
  totalForThisRoot: number,
  baseSeed: number,
  options: Required<Omit<GenerateOptions, 'totalNodes' | 'rootsCount' | 'seed'>>
): Node {
  const rand = mulberry32(baseSeed + rootIndex1based); // разный, но детерминированный seed для каждого корня

  const projStart = toDate(options.projectStart!);
  const projFinish = toDate(options.projectFinish!);

  const rootId = `n${rootIndex1based}`;
  const root: Node = {
    id: rootId,
    name: randChoice(rand, ROOT_NAMES),
    start: formatISO(projStart),
    finish: formatISO(projFinish),
    baselineStart: formatISO(projStart),
    baselineFinish: formatISO(projFinish),
    complete: randInt(rand, 0, 40),
    children: []
  };

  const queue: Node[] = [root];
  let depCandidates: TaskMeta[] = [];
  let created = 1;

  const createChild = (parent: Node, childIndex1based: number): Node => {
    const pStart = toDate(parent.start);
    const pFinish = toDate(parent.finish);
    const span = Math.max(1, daysBetween(pStart, pFinish));

    // Старт и длительность
    const offsetStartDays = randInt(rand, 0, Math.max(0, span - 1));
    const rawStart = addDays(pStart, offsetStartDays);

    const dur = Math.min(
      options.maxTaskDurationDays!,
      Math.max(options.minTaskDurationDays!, randInt(rand, options.minTaskDurationDays!, options.maxTaskDurationDays!))
    );

    let rawFinish = addDays(rawStart, dur);
    rawFinish = clampDate(rawFinish, addDays(rawStart, 1), pFinish);

    // Базис
    const bShiftStart = randInt(rand, -3, 3);
    const bShiftFinish = randInt(rand, -7, 7);
    const bStart = clampDate(addDays(rawStart, bShiftStart), pStart, pFinish);
    const bFinish = clampDate(addDays(rawFinish, bShiftFinish), bStart, pFinish);

    const levelName = maybe(rand, 0.45) ? randChoice(rand, PHASE_NAMES) : randChoice(rand, WORK_NAMES);
    const serial = randInt(rand, 1, 9999);
    const nodeId = makeChildId(parent.id, childIndex1based);

    const node: Node = {
      id: nodeId,
      name: `${levelName} ${serial}`,
      start: formatISO(rawStart),
      finish: formatISO(rawFinish),
      baselineStart: formatISO(bStart),
      baselineFinish: formatISO(bFinish),
      complete: randInt(rand, 0, 100)
    };

    // Зависимости — только на уже завершившиеся к моменту старта этой задачи
    if (maybe(rand, options.dependencyProbability!) && depCandidates.length > 0) {
      const myStart = rawStart.getTime();
      const eligible = depCandidates.filter(p => p.finish.getTime() <= myStart);
      if (eligible.length > 0) {
        const depCount = Math.min(options.maxDependenciesPerNode!, randInt(rand, 1, Math.min(3, eligible.length)));
        const picked: string[] = [];
        for (let i = 0; i < depCount && eligible.length > 0; i++) {
          const idx = randInt(rand, 0, eligible.length - 1);
          const chosen = eligible.splice(idx, 1)[0];
          picked.push(chosen.id);
        }
        if (picked.length) (node as Node).dependency = picked;
      }
    }

    // ---- Critical: преимущественно false ----
    const childDur = daysBetween(rawStart, rawFinish);
    const parentSpan = Math.max(1, daysBetween(pStart, pFinish));
    const edgeAligned = rawStart.getTime() === pStart.getTime() || rawFinish.getTime() === pFinish.getTime();
    const unusuallyLong = childDur >= Math.max(MIN_ABS_LONG_DAYS, Math.floor(parentSpan * UNUSUALLY_LONG_RATIO));

    let critical = false;

    // Если обе эвристики — помечаем всегда
    if (edgeAligned && unusuallyLong) {
      critical = true;
    } else if (edgeAligned) {
      // Только "край": низкая вероятность
      critical = maybe(rand, HEUR_EDGE_ONLY_P);
    } else if (unusuallyLong) {
      // Только "длинная": ещё ниже
      critical = maybe(rand, HEUR_LONG_ONLY_P);
    }

    // Слабая случайная отметка, если включено флагом
    if (!critical && options.criticalProbability && maybe(rand, RANDOM_CRITICAL_P)) {
      critical = true;
    }

    if (critical) {
      (node as Node).critical = true;
    }

    return node;
  };

  while (created < totalForThisRoot) {
    const parent = queue.shift();
    if (!parent) break;

    // Этот узел перестаёт быть листом-кандидатом (теперь он родитель)
    depCandidates = depCandidates.filter(t => t.id !== parent.id);

    parent.children = parent.children ?? [];

    const remaining = totalForThisRoot - created;
    const planned = Math.min(
      remaining,
      Math.max(1, randInt(rand, options.minChildrenPerParent!, options.maxChildrenPerParent!))
    );

    const newChildren: Node[] = [];
    for (let i = 1; i <= planned; i++) {
      const child = createChild(parent, parent.children.length + 1);
      parent.children.push(child);
      newChildren.push(child);
      created++;

      // Пока ребёнок — лист, он годится как предшественник
      depCandidates.push({
        id: child.id,
        start: toDate(child.start),
        finish: toDate(child.finish)
      });

      if (created >= totalForThisRoot) break;
    }

    // Всех детей кидаем в очередь — гарантируем, что очередь не опустеет раньше времени
    for (const c of newChildren) {
      if (created < totalForThisRoot) queue.push(c);
    }
  }

  postOrderRecalc(root);
  return root;
}

// ---------- Основной генератор леса ----------
export function generateActivityData(totalNodes = 10_000, opts: GenerateOptions = {}): Node[] {
  const rootsCount = Math.max(1, opts.rootsCount ?? 1);

  const options: Required<GenerateOptions> = {
    totalNodes,
    rootsCount,
    projectStart: opts.projectStart ?? ('2025-09-01' as IsoDate),
    projectFinish: opts.projectFinish ?? ('2026-06-30' as IsoDate),
    minChildrenPerParent: Math.max(1, opts.minChildrenPerParent ?? 1),
    maxChildrenPerParent: Math.max(2, opts.maxChildrenPerParent ?? 5),
    dependencyProbability: Math.min(Math.max(opts.dependencyProbability ?? 0.18, 0), 1),
    maxDependenciesPerNode: Math.max(1, opts.maxDependenciesPerNode ?? 3),
    criticalProbability: opts.criticalProbability ?? false, // по умолчанию выключено
    seed: opts.seed ?? 20250826,
    minTaskDurationDays: Math.max(1, opts.minTaskDurationDays ?? 3),
    maxTaskDurationDays: Math.max(opts.minTaskDurationDays ?? 3, opts.maxTaskDurationDays ?? 60),
  };

  // Распределяем целевое количество узлов по корням равномерно (первые получают на 1 больше при остатке)
  const perRootBase = Math.floor(options.totalNodes / options.rootsCount);
  let remainder = options.totalNodes % options.rootsCount;

  const forest: Node[] = [];
  for (let i = 1; i <= options.rootsCount; i++) {
    const targetForRoot = perRootBase + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder--;

    const root = generateSingleRoot(
      i,
      targetForRoot,
      options.seed,
      {
        projectStart: options.projectStart,
        projectFinish: options.projectFinish,
        minChildrenPerParent: options.minChildrenPerParent,
        maxChildrenPerParent: options.maxChildrenPerParent,
        dependencyProbability: options.dependencyProbability,
        maxDependenciesPerNode: options.maxDependenciesPerNode,
        criticalProbability: options.criticalProbability, // boolean
        minTaskDurationDays: options.minTaskDurationDays,
        maxTaskDurationDays: options.maxTaskDurationDays,
      }
    );

    forest.push(root);
  }

  return forest;
}
