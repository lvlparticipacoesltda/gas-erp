export interface ViaCepResponse {
  cep: string;
  logradouro: string;
  bairro: string;
  localidade: string;
  uf: string;
  erro?: boolean;
}

export function normalizeCepDigits(value: string): string {
  return value.replace(/\D/g, '').slice(0, 8);
}

export function formatCep(value: string): string {
  const digits = normalizeCepDigits(value);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

export async function fetchAddressByCep(cep: string): Promise<ViaCepResponse | null> {
  const digits = normalizeCepDigits(cep);
  if (digits.length !== 8) return null;

  const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
  if (!res.ok) return null;

  const data = (await res.json()) as ViaCepResponse;
  if (data.erro) return null;
  return data;
}

export async function searchAddressesByStreet(
  uf: string,
  city: string,
  street: string,
): Promise<ViaCepResponse[]> {
  const state = uf.trim().toUpperCase();
  const cityName = city.trim();
  const streetName = street.trim();
  if (state.length !== 2 || cityName.length < 3 || streetName.length < 3) return [];

  const path = [
    encodeURIComponent(state),
    encodeURIComponent(cityName),
    encodeURIComponent(streetName),
  ].join('/');

  const res = await fetch(`https://viacep.com.br/ws/${path}/json/`);
  if (!res.ok) return [];

  const data = (await res.json()) as ViaCepResponse[] | (ViaCepResponse & { erro?: boolean });
  if (!Array.isArray(data)) return [];
  return data.filter((row) => row.logradouro && !row.erro);
}
