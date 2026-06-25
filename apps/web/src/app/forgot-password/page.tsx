'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Logo } from '@/components/logo';
import { Button, Card, Input, Label } from '@/components/ui';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    setError('');
    try {
      const res = await api<{ message: string }>('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setMessage(res.message);
      setEmail('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar solicitação');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sand to-sand p-4">
      <Card className="w-full max-w-md">
        <div className="mb-6">
          <Logo size="sm" />
        </div>
        <h1 className="text-xl font-bold text-slate-900">Recuperar senha</h1>
        <p className="mt-1 text-sm text-slate-500">Informe o e-mail da sua conta</p>

        {message ? (
          <div className="mt-6 space-y-4">
            <p className="text-sm text-emerald-700">{message}</p>
            <Link href="/login" className="inline-block text-sm font-medium text-brand hover:underline">
              ← Voltar ao login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <Label>E-mail</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Enviando...' : 'Enviar link de redefinição'}
            </Button>
            <Link href="/login" className="block text-center text-sm text-brand hover:underline">
              ← Voltar ao login
            </Link>
          </form>
        )}
      </Card>
    </div>
  );
}
