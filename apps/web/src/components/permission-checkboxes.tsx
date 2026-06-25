'use client';

import {
  ROLE_DEFAULT_PERMISSIONS,
  STORE_SCREEN_KEYS,
  STORE_SCREEN_LABELS,
  type StoreScreenKey,
} from '@gas-erp/shared';
import { Label } from '@/components/ui';

function arraysEqual(a: string[], b: string[]) {
  return a.length === b.length && a.every((v) => b.includes(v));
}

export function permissionsToPayload(role: string, selected: string[]): string[] {
  const defaults = ROLE_DEFAULT_PERMISSIONS[role] ?? [];
  if (arraysEqual(selected, defaults)) return [];
  return selected;
}

export function effectivePermissions(role: string, custom?: string[]): string[] {
  if (custom && custom.length > 0) return custom;
  return ROLE_DEFAULT_PERMISSIONS[role] ?? ['store.daily-summary'];
}

export function PermissionCheckboxes({
  role,
  selected,
  onChange,
}: {
  role: string;
  selected: string[];
  onChange: (permissions: string[]) => void;
}) {
  if (role === 'ORG_MASTER' || role === 'PLATFORM_ADMIN') {
    return (
      <p className="text-sm text-slate-500">
        Usuários Master têm acesso total ao painel administrativo e a todas as telas de loja.
      </p>
    );
  }

  function toggle(screen: StoreScreenKey) {
    if (selected.includes(screen)) {
      onChange(selected.filter((s) => s !== screen));
    } else {
      onChange([...selected, screen]);
    }
  }

  function applyRoleDefaults() {
    onChange([...(ROLE_DEFAULT_PERMISSIONS[role] ?? ['store.daily-summary'])]);
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <Label>Telas permitidas na loja</Label>
        <button type="button" onClick={applyRoleDefaults} className="text-xs text-brand hover:underline">
          Usar padrão do papel
        </button>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {STORE_SCREEN_KEYS.map((screen) => (
          <label key={screen} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={selected.includes(screen)}
              onChange={() => toggle(screen)}
            />
            {STORE_SCREEN_LABELS[screen]}
          </label>
        ))}
      </div>
    </div>
  );
}
