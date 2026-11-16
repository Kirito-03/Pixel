import type { darkColors } from '../theme';
type Roles = { text?: string[]; secondary?: string[]; muted?: string[]; surface?: string[]; background?: string[]; border?: string[] };
export function detailPalette<T extends Record<string, any>>(base: T, colors: typeof darkColors, roles: Roles): T {
  const result: Record<string, any> = { ...base };
  const apply = (names: string[] | undefined, property: string, value: string) => {
    for (const name of names || []) if (base[name]) result[name] = { ...result[name], [property]: value };
  };
  apply(roles.text, 'color', colors.text); apply(roles.secondary, 'color', colors.textSecondary); apply(roles.muted, 'color', colors.textMuted);
  apply(roles.surface, 'backgroundColor', colors.card); apply(roles.background, 'backgroundColor', colors.background); apply(roles.border, 'borderColor', colors.divider);
  return result as T;
}
