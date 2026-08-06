import { randomInt } from 'node:crypto';

/**
 * Alfabeto sem os pares que se confundem quando a senha é lida em voz alta ou
 * copiada de um papel: 0/O, 1/l/I, 5/S, 2/Z.
 */
const LOWER = 'abcdefghjkmnpqrstuvwxyz';
const UPPER = 'ABCDEFGHJKMNPQRSTUVWXY';
const DIGITS = '346789';
const SYMBOLS = '!@#$%&*?';
const ALPHABET = LOWER + UPPER + DIGITS + SYMBOLS;

const DEFAULT_LENGTH = 14;

function pick(chars: string) {
  return chars[randomInt(chars.length)];
}

/**
 * Senha aleatória para quem é cadastrado sem senha definida.
 *
 * Usa `crypto.randomInt` (CSPRNG, sem viés de módulo) e garante ao menos um caractere
 * de cada classe, para passar em qualquer política de senha.
 */
export function generatePassword(length = DEFAULT_LENGTH): string {
  const required = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)];
  const rest = Array.from({ length: Math.max(length, required.length) - required.length }, () =>
    pick(ALPHABET),
  );
  const chars = [...required, ...rest];

  // Fisher-Yates: sem o embaralhamento, as quatro primeiras posições teriam classe fixa.
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
