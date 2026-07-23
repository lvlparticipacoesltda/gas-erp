/** Detecta produtos do benefício Gás do Povo pelo nome (ex.: TAXA ENTREGA GÁS DO POVO). */
export function isGasDoPovoProductName(name?: string | null): boolean {
  if (!name) return false;
  const normalized = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return normalized.includes('gas do povo');
}
