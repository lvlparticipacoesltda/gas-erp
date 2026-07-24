'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, setAuth } from '@/lib/api';
import { Logo } from '@/components/logo';
import { Button, Card, Input, Label } from '@/components/ui';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await api<{
        accessToken: string;
        user: { role: string; storeIds?: string[]; permissions?: string[] };
      }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, client: 'web' }),
      });
      if (res.user.role === 'DELIVERER') {
        setError('Entregadores devem acessar pelo aplicativo móvel.');
        return;
      }
      setAuth(res.accessToken, res.user);
      if (res.user.role === 'ORG_MASTER' || res.user.role === 'PLATFORM_ADMIN') {
        router.push('/master/dashboard');
      } else if (res.user.storeIds?.[0]) {
        router.push(`/store/${res.user.storeIds[0]}/daily-summary`);
      } else {
        router.push('/master/dashboard');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao entrar');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-sand via-white to-sand">
      <div className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <div className="mb-6">
          <Logo tagline="Painel de gestão" />
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>E-mail</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </div>
          <div>
            <Label>Senha</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm">
          <Link href="/forgot-password" className="text-brand hover:underline">
            Esqueci minha senha
          </Link>
        </p>
      </Card>
      </div>
      <footer className="px-4 py-6 text-center text-xs text-slate-500">
        <p>THL Gás do Povo — Rede Gás Litoral</p>
        <p className="mt-1">CNPJ 62.512.525/0001-63</p>
      </footer>
    </div>
  );
}
