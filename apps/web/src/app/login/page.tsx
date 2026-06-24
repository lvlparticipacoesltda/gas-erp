'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, setAuth } from '@/lib/api';
import { Button, Card, Input, Label } from '@/components/ui';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('master@gas.com');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await api<{ accessToken: string; user: { role: string; storeIds?: string[] } }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setAuth(res.accessToken, res.user);
      if (res.user.role === 'ORG_MASTER' || res.user.role === 'PLATFORM_ADMIN') {
        router.push('/master/dashboard');
      } else if (res.user.storeIds?.[0]) {
        router.push(`/store/${res.user.storeIds[0]}/dashboard`);
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
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sky-50 to-slate-100 p-4">
      <Card className="w-full max-w-md">
        <h1 className="text-2xl font-bold text-slate-900">Gas ERP</h1>
        <p className="mt-1 text-sm text-slate-500">Gestão para rede de distribuidoras de gás</p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <Label>E-mail</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <Label>Senha</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </Button>
        </form>
        <p className="mt-4 text-xs text-slate-400">Demo: master@gas.com / admin123</p>
      </Card>
    </div>
  );
}
