// src/app/tree/utils/tree-utils.ts

import { FlatRow, Node } from '../models/gantt.model';

/** Глубокое клонирование дерева (без зависимостей от компонента) */
export function deepClone<T>(src: T): T {
  return JSON.parse(JSON.stringify(src)) as T;
}

/** Плоское представление WBS с учётом множества collapsed */
export function flattenWbs(nodes: Node[], collapsed: Set<string>): FlatRow[] {
  const out: FlatRow[] = [];
  const walk = (
    list: Node[],
    prefixNums: number[] = [],
    level = 0,
    parentId: string | null = null,
    parentPath: string[] = []
  ) => {
    list.forEach((node, idx) => {
      const numberSeq = [...prefixNums, idx + 1];
      const wbs = numberSeq.join('.');
      const hasChildren = !!(node.children && node.children.length);
      const path = [...parentPath, node.id];

      out.push({
        id: node.id,
        parentId,
        path,
        wbs,
        name: node.name,
        start: node.start,
        finish: node.finish,
        level,
        hasChildren,
        complete: Math.max(0, Math.min(100, Number(node.complete ?? 0))),
        baselineStart: node.baselineStart,
        baselineFinish: node.baselineFinish,
      });

      if (hasChildren && !collapsed.has(node.id)) {
        walk(node.children!, numberSeq, level + 1, node.id, path);
      }
    });
  };
  walk(nodes, [], 0, null, []);
  return out;
}

export function findParentListAndIndex(rootList: Node[], id: string): { parentList: Node[]; index: number } | null {
  const walk = (list: Node[]): { parentList: Node[]; index: number } | null => {
    for (let i = 0; i < list.length; i++) {
      const n = list[i];
      if (n.id === id) return { parentList: list, index: i };
      if (n.children && n.children.length) {
        const r = walk(n.children);
        if (r) return r;
      }
    }
    return null;
  };
  return walk(rootList);
}

export function findNode(rootList: Node[], id: string): Node | null {
  const walk = (list: Node[]): Node | null => {
    for (const n of list) {
      if (n.id === id) return n;
      if (n.children) {
        const r = walk(n.children);
        if (r) return r;
      }
    }
    return null;
  };
  return walk(rootList);
}

export function isDescendant(flatRows: FlatRow[], candidateId: string, ancestorId: string): boolean {
  const candRow = flatRows.find(r => r.id === candidateId);
  if (!candRow) return false;
  return candRow.path.includes(ancestorId) && candidateId !== ancestorId;
}