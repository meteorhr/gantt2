// parser/mapper/rsrcrole.mapper.ts
import type { P6Scalar } from '../parser.types';

/* ---------- helpers ---------- */
function txt(el: Element, tag: string): string {
  const n = el.getElementsByTagName(tag)[0];
  return n?.textContent?.trim() ?? '';
}
function txtAny(el: Element, tags: string[]): string | null {
  for (const t of tags) {
    const v = txt(el, t);
    if (v) return v;
  }
  return null;
}
function num(el: Element, tag: string): number | null {
  const s = txt(el, tag);
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function numAny(el: Element, tags: string[]): number | null {
  for (const t of tags) {
    const v = num(el, t);
    if (v !== null) return v;
  }
  return null;
}
/** FNV-1a 32-bit → положительное число для синтетического PK */
function hash32ToNum(s: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h + ((h << 1) >>> 0) + ((h << 4) >>> 0) + ((h << 7) >>> 0) + ((h << 8) >>> 0) + ((h << 24) >>> 0)) >>> 0;
    }
    return h >>> 0;
  }
/* ---------- mapper ---------- */
/**
 * Преобразовать <ResourceRole> -> RSRCROLERow-совместимый объект.
 * Если нет собственного ObjectId, генерирует составной ключ `${rsrc_id}_${role_id}`.
 */
export function mapResourceRoleToRsrcroleRow(
  rr: Element,
  rsrcIdFromParent?: number | null
): Record<string, P6Scalar> | null {
  // ключи-ссылки
  const objId   = num(rr, 'ObjectId');
  const rsrc_id = num(rr, 'ResourceObjectId') ?? (Number.isFinite(rsrcIdFromParent as number) ? (rsrcIdFromParent as number) : null);
  const role_id = num(rr, 'RoleObjectId');

  if (!Number.isFinite(rsrc_id as number) || !Number.isFinite(role_id as number)) {
    console.warn('[P6-XML] RSRCROLE пропущен (нет rsrc_id/role_id)', { rsrc_id, role_id });
    return null;
  }

  const rsrc_role_id: number = Number.isFinite(objId as number)
    ? (objId as number)
    : hash32ToNum(`${rsrc_id}|${role_id}`);

  

  // информативные поля (если P6 их кладёт внутрь ResourceRole)
  const rsrc_name        = txtAny(rr, ['ResourceName']);
  const rsrc_short_name  = txtAny(rr, ['ResourceId', 'ResourceCode']);
  const rsrc_type        = txtAny(rr, ['ResourceType']);

  const role_name        = txtAny(rr, ['RoleName']);
  const role_short_name  = txtAny(rr, ['RoleId', 'RoleCode']);

  const skill_level      = numAny(rr, ['Proficiency', 'ProficiencyLevel']);

  return {
    // === PK ===
    rsrc_role_id,

    // === ссылки ===
    rsrc_id: rsrc_id as number,
    role_id: role_id as number,

    // === описательные ===
    rsrc_name: rsrc_name ?? null,
    rsrc_short_name: rsrc_short_name ?? null,
    rsrc_type: rsrc_type ?? null,

    role_name: role_name ?? null,
    role_short_name: role_short_name ?? null,

    skill_level: skill_level ?? null,
  };
}
