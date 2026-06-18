import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { api, ApiError } from '@/lib/api';
import { User, Lock, CheckCircle2, Loader2, Camera } from 'lucide-react';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-sm font-medium text-foreground/70 mb-1.5 block">{label}</label>
      {children}
    </div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full px-3.5 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all ${props.className ?? ''}`}
    />
  );
}

function Alert({ type, text }: { type: 'ok' | 'err'; text: string }) {
  return (
    <div className={`flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-sm ${type === 'ok'
      ? 'bg-primary/10 border border-primary/20 text-primary'
      : 'bg-destructive/10 border border-destructive/20 text-destructive'}`}>
      {type === 'ok' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
      {text}
    </div>
  );
}

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();

  const [profile, setProfile] = useState({ name: user?.name ?? '', email: user?.email ?? '' });
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const initials = user?.name
    ? user.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
    : '?';

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile.name.trim() || !profile.email.trim()) {
      setProfileMsg({ type: 'err', text: 'Nome e e-mail são obrigatórios.' });
      return;
    }
    setProfileLoading(true);
    setProfileMsg(null);
    try {
      await api.patch('/auth/profile', { name: profile.name.trim(), email: profile.email.trim() });
      await refreshUser();
      setProfileMsg({ type: 'ok', text: 'Perfil atualizado com sucesso!' });
    } catch (e) {
      setProfileMsg({ type: 'err', text: e instanceof ApiError ? e.message : 'Erro ao salvar perfil.' });
    } finally {
      setProfileLoading(false);
    }
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.next !== pw.confirm) {
      setPwMsg({ type: 'err', text: 'A nova senha não confere.' });
      return;
    }
    if (pw.next.length < 8) {
      setPwMsg({ type: 'err', text: 'A nova senha deve ter pelo menos 8 caracteres.' });
      return;
    }
    setPwLoading(true);
    setPwMsg(null);
    try {
      await api.patch('/auth/password', { currentPassword: pw.current, newPassword: pw.next });
      setPwMsg({ type: 'ok', text: 'Senha alterada com sucesso!' });
      setPw({ current: '', next: '', confirm: '' });
    } catch (e) {
      setPwMsg({ type: 'err', text: e instanceof ApiError ? e.message : 'Erro ao alterar senha.' });
    } finally {
      setPwLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Meu Perfil</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Gerencie suas informações pessoais e segurança da conta</p>
      </div>

      {/* Avatar + info */}
      <div className="bg-white rounded-xl border border-border p-5 flex items-center gap-5">
        <div className="relative shrink-0">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center text-xl font-bold select-none">
            {initials}
          </div>
        </div>
        <div>
          <p className="font-semibold text-foreground">{user?.name}</p>
          <p className="text-sm text-muted-foreground">{user?.email}</p>
          <p className="text-xs text-muted-foreground/60 mt-0.5 font-mono">ID #{user?.id}</p>
        </div>
      </div>

      {/* Profile form */}
      <div className="bg-white rounded-xl border border-border shadow-sm">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <User className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold text-sm">Informações pessoais</h2>
            <p className="text-xs text-muted-foreground">Atualize seu nome e endereço de e-mail</p>
          </div>
        </div>
        <form onSubmit={saveProfile} className="px-5 py-5 space-y-4">
          <Field label="Nome completo">
            <Input
              value={profile.name}
              onChange={e => setProfile(p => ({ ...p, name: e.target.value }))}
              placeholder="Seu nome"
              required
            />
          </Field>
          <Field label="E-mail">
            <Input
              type="email"
              value={profile.email}
              onChange={e => setProfile(p => ({ ...p, email: e.target.value }))}
              placeholder="seu@email.com"
              required
            />
          </Field>
          {profileMsg && <Alert type={profileMsg.type} text={profileMsg.text} />}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={profileLoading}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-60 transition-opacity"
            >
              {profileLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              Salvar alterações
            </button>
          </div>
        </form>
      </div>

      {/* Password form */}
      <div className="bg-white rounded-xl border border-border shadow-sm">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Lock className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold text-sm">Alterar senha</h2>
            <p className="text-xs text-muted-foreground">Mantenha sua conta segura com uma senha forte</p>
          </div>
        </div>
        <form onSubmit={savePassword} className="px-5 py-5 space-y-4">
          <Field label="Senha atual">
            <Input
              type="password"
              value={pw.current}
              onChange={e => setPw(p => ({ ...p, current: e.target.value }))}
              placeholder="Digite sua senha atual"
              required
            />
          </Field>
          <Field label="Nova senha">
            <Input
              type="password"
              value={pw.next}
              onChange={e => setPw(p => ({ ...p, next: e.target.value }))}
              placeholder="Mínimo 8 caracteres"
              minLength={8}
              required
            />
          </Field>
          <Field label="Confirmar nova senha">
            <Input
              type="password"
              value={pw.confirm}
              onChange={e => setPw(p => ({ ...p, confirm: e.target.value }))}
              placeholder="Repita a nova senha"
              required
            />
          </Field>
          {pwMsg && <Alert type={pwMsg.type} text={pwMsg.text} />}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={pwLoading || !pw.current || !pw.next || !pw.confirm}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-60 transition-opacity"
            >
              {pwLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              Alterar senha
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
