'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Button, Card, Input, Label, PageHeader } from '@/components/ui';
import { api, getStoredUser, getToken, setAuth } from '@/lib/api';
import type { AuthUser } from '@gas-erp/shared';

interface Profile {
  id: string;
  email: string;
  name: string;
  phone?: string | null;
  role: string;
  storeIds: string[];
  permissions?: string[];
}

export function SettingsContent() {
  const stored = getStoredUser<AuthUser>();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileForm, setProfileForm] = useState({ name: '', email: '', phone: '' });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [profileMsg, setProfileMsg] = useState('');
  const [passwordMsg, setPasswordMsg] = useState('');
  const [profileError, setProfileError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    api<Profile>('/auth/me', {}, getToken()).then((data) => {
      setProfile(data);
      setProfileForm({
        name: data.name,
        email: data.email,
        phone: data.phone ?? '',
      });
    });
  }, []);

  async function handleProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    setProfileMsg('');
    setProfileError('');
    try {
      const updated = await api<Profile>(
        '/auth/me',
        {
          method: 'PATCH',
          body: JSON.stringify({
            name: profileForm.name,
            email: profileForm.email,
            phone: profileForm.phone || undefined,
          }),
        },
        getToken(),
      );
      setProfile(updated);
      const token = getToken();
      if (token) {
        setAuth(token, {
          id: updated.id,
          email: updated.email,
          name: updated.name,
          role: updated.role,
          organizationId: stored?.organizationId ?? '',
          storeIds: updated.storeIds,
          permissions: updated.permissions ?? stored?.permissions,
        });
      }
      setProfileMsg('Dados atualizados com sucesso.');
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSavingProfile(false);
    }
  }

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordMsg('');
    setPasswordError('');
    if (passwordForm.newPassword !== passwordForm.confirm) {
      setPasswordError('A confirmação não confere com a nova senha.');
      return;
    }
    setSavingPassword(true);
    try {
      await api(
        '/auth/change-password',
        {
          method: 'POST',
          body: JSON.stringify({
            currentPassword: passwordForm.currentPassword,
            newPassword: passwordForm.newPassword,
          }),
        },
        getToken(),
      );
      setPasswordForm({ currentPassword: '', newPassword: '', confirm: '' });
      setPasswordMsg('Senha alterada com sucesso.');
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Erro ao alterar senha');
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <>
      <PageHeader title="Minha conta" subtitle="Atualize seus dados e senha de acesso" />
      <div className="grid max-w-4xl gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-semibold">Dados pessoais</h2>
          <form onSubmit={handleProfile} className="space-y-3">
            <div>
              <Label>Nome</Label>
              <Input
                value={profileForm.name}
                onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>E-mail</Label>
              <Input
                type="email"
                value={profileForm.email}
                onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>Telefone</Label>
              <Input
                value={profileForm.phone}
                onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                placeholder="Opcional"
              />
            </div>
            {profileError && <p className="text-sm text-red-600">{profileError}</p>}
            {profileMsg && <p className="text-sm text-emerald-600">{profileMsg}</p>}
            <Button type="submit" disabled={savingProfile || !profile}>
              {savingProfile ? 'Salvando...' : 'Salvar dados'}
            </Button>
          </form>
        </Card>

        <Card>
          <h2 className="mb-4 font-semibold">Alterar senha</h2>
          <form onSubmit={handlePassword} className="space-y-3">
            <div>
              <Label>Senha atual</Label>
              <Input
                type="password"
                value={passwordForm.currentPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>Nova senha</Label>
              <Input
                type="password"
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                minLength={6}
                required
              />
            </div>
            <div>
              <Label>Confirmar nova senha</Label>
              <Input
                type="password"
                value={passwordForm.confirm}
                onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })}
                minLength={6}
                required
              />
            </div>
            {passwordError && <p className="text-sm text-red-600">{passwordError}</p>}
            {passwordMsg && <p className="text-sm text-emerald-600">{passwordMsg}</p>}
            <Button type="submit" disabled={savingPassword}>
              {savingPassword ? 'Alterando...' : 'Alterar senha'}
            </Button>
          </form>
        </Card>
      </div>
    </>
  );
}
