export function parseApiError(payload: unknown, fallback = 'Erro na requisição'): string {
  if (!payload || typeof payload !== 'object') return fallback;
  const data = payload as Record<string, unknown>;
  const raw = data.message;

  let message = fallback;
  if (typeof raw === 'string') message = raw;
  else if (Array.isArray(raw)) message = raw.filter((m) => typeof m === 'string').join('. ');

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
  return message;
}
