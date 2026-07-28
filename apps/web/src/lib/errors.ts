import { SESSION_SUPERSEDED_CODE } from '@gas-erp/shared';

export function extractApiErrorCode(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const data = payload as Record<string, unknown>;
  if (typeof data.code === 'string') return data.code;
  const raw = data.message;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const nested = raw as Record<string, unknown>;
    if (typeof nested.code === 'string') return nested.code;
  }
  return null;
}

export function parseApiError(payload: unknown, fallback = 'Erro na requisição'): string {
  if (!payload || typeof payload !== 'object') return fallback;
  const data = payload as Record<string, unknown>;
  const raw = data.message;

  let message = fallback;
  if (typeof raw === 'string') message = raw;
  else if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const nested = raw as Record<string, unknown>;
    if (typeof nested.message === 'string') message = nested.message;
  } else if (Array.isArray(raw)) {
    message = raw.filter((m) => typeof m === 'string').join('. ');
  }

  if (extractApiErrorCode(payload) === SESSION_SUPERSEDED_CODE) {
    return message || 'Sua conta foi acessada de outro lugar. Faça login novamente.';
  }

  return mapKnownErrors(message);
}

function mapKnownErrors(message: string): string {
  const lower = message.toLowerCase();
  if (message.includes('já está cadastrado') || message.includes('já em uso')) return message;
  if (lower.includes('unique constraint') && lower.includes('email')) {
    return 'Este e-mail já está cadastrado nesta rede.';
  }
  if (lower.includes('credenciais inválidas')) return 'E-mail ou senha incorretos.';
  if (lower.includes('senha atual incorreta')) return 'Senha atual incorreta.';
  if (lower.includes('link inválido ou expirado')) return message;
  if (lower.includes('estoque insuficiente')) return message;
  if (lower.includes('preço unitário') || lower.includes('valor do pagamento')) return message;
  if (lower.includes('produto obrigatório') || lower.includes('referência inválida')) return message;
  if (lower.includes('estoque insuficiente') || lower.includes('sem estoque cadastrado')) return message;
  if (lower.includes('cliente não encontrado') || lower.includes('entregador não encontrado')) return message;
  if (lower.includes('loja não encontrada') || lower.includes('produto não encontrado')) return message;
  if (lower.includes('não foi possível concluir a operação agora')) return message;
  return message;
}
