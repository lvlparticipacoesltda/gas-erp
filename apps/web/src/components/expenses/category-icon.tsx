'use client';

import {
  Building2,
  Calculator,
  CircleEllipsis,
  Droplets,
  Fuel,
  Hammer,
  Landmark,
  Megaphone,
  Package,
  Ticket,
  Truck,
  Users,
  Wifi,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { EXPENSE_CATEGORY_FALLBACK_COLOR } from '@gas-erp/shared';

/**
 * Mapa explícito (e não import dinâmico) para o bundle levar só estes ícones.
 * As chaves são as gravadas em `ExpenseCategory.icon`.
 */
const ICONS: Record<string, LucideIcon> = {
  'building-2': Building2,
  droplets: Droplets,
  zap: Zap,
  wifi: Wifi,
  users: Users,
  ticket: Ticket,
  landmark: Landmark,
  wrench: Wrench,
  hammer: Hammer,
  fuel: Fuel,
  truck: Truck,
  package: Package,
  calculator: Calculator,
  megaphone: Megaphone,
  'circle-ellipsis': CircleEllipsis,
};

/** Ícone da categoria dentro de um quadrado tingido com a cor dela. */
export function CategoryIcon({
  icon,
  color,
  className = 'h-8 w-8',
}: {
  icon?: string | null;
  color?: string | null;
  className?: string;
}) {
  const Icon = (icon && ICONS[icon]) || CircleEllipsis;
  const accent = color ?? EXPENSE_CATEGORY_FALLBACK_COLOR;
  return (
    <span
      className={`inline-flex items-center justify-center rounded-lg ${className}`}
      style={{ backgroundColor: `${accent}1f`, color: accent }}
    >
      <Icon className="h-[55%] w-[55%]" strokeWidth={2.2} aria-hidden />
    </span>
  );
}
