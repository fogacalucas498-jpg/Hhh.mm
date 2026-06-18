import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useLocation } from 'wouter';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { ApiError } from '@/lib/api';

export default function LoginPage() {
  const { login, register } = useAuth();
  const [, nav] = useLocation();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ email: '', password: '', name: '' });
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(form.email, form.password);
      } else {
        await register(form.email, form.password, form.name);
      }
      nav('/');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex" style={{ background: '#09090b' }}>
      {/* Left panel — branding */}
      <div className="hidden lg:flex flex-col justify-between w-[420px] shrink-0 p-10"
        style={{ background: 'linear-gradient(160deg, #0f0f18 0%, #09090b 100%)', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-3">
          <img src="/logo.jpg" alt="Bot.io" className="w-10 h-10 rounded-xl object-cover" />
          <span className="text-white font-bold text-lg tracking-tight">Bot.io</span>
        </div>
        <div>
          <blockquote className="text-white/60 text-sm leading-relaxed italic mb-4">
            "Automatizei 90% do meu atendimento com o Bot.io. Meus clientes adoraram a experiência."
          </blockquote>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-purple-600/30 flex items-center justify-center text-purple-300 text-xs font-bold">M</div>
            <div>
              <p className="text-white text-sm font-medium">Marcos S.</p>
              <p className="text-white/40 text-xs">Loja de eletrônicos, SP</p>
            </div>
          </div>
        </div>
        <p className="text-white/20 text-xs">Bot.io © 2026 · 100% Gratuito</p>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="flex items-center justify-center gap-3 mb-8 lg:hidden">
            <img src="/logo.jpg" alt="Bot.io" className="w-10 h-10 rounded-xl object-cover" />
            <span className="text-white font-bold text-xl tracking-tight">Bot.io</span>
          </div>

          <h1 className="text-2xl font-bold text-white mb-1">
            {mode === 'login' ? 'Entrar na conta' : 'Criar conta'}
          </h1>
          <p className="text-sm mb-7" style={{ color: '#71717a' }}>
            {mode === 'login'
              ? 'Acesse sua plataforma de bots WhatsApp'
              : 'Crie sua conta gratuita agora mesmo'}
          </p>

          <form onSubmit={submit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="text-sm font-medium mb-1.5 block text-white/80">Nome</label>
                <input
                  value={form.name} onChange={set('name')} required
                  placeholder="Seu nome completo"
                  className="w-full px-3.5 py-2.5 rounded-lg text-sm text-white placeholder-white/25 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                />
              </div>
            )}
            <div>
              <label className="text-sm font-medium mb-1.5 block text-white/80">E-mail</label>
              <input
                type="email" value={form.email} onChange={set('email')} required
                placeholder="seu@email.com"
                className="w-full px-3.5 py-2.5 rounded-lg text-sm text-white placeholder-white/25 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block text-white/80">Senha</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={form.password} onChange={set('password')} required
                  minLength={8} placeholder="Mínimo 8 caracteres"
                  className="w-full px-3.5 py-2.5 pr-10 rounded-lg text-sm text-white placeholder-white/25 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70 transition-colors">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-lg px-3.5 py-2.5 text-sm text-red-400"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-50"
              style={{ background: loading ? 'rgba(139,92,246,0.5)' : 'linear-gradient(135deg, #8b5cf6, #7c3aed)', boxShadow: loading ? 'none' : '0 4px 16px rgba(139,92,246,0.35)' }}>
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {mode === 'login' ? 'Entrar' : 'Criar conta grátis'}
            </button>
          </form>

          <p className="text-center text-sm mt-5" style={{ color: '#71717a' }}>
            {mode === 'login' ? 'Não tem conta?' : 'Já tem conta?'}
            {' '}
            <button onClick={() => { setMode(m => m === 'login' ? 'register' : 'login'); setError(''); }}
              className="font-semibold hover:opacity-80 transition-opacity" style={{ color: '#a78bfa' }}>
              {mode === 'login' ? 'Criar grátis' : 'Entrar'}
            </button>
          </p>

          {mode === 'register' && (
            <div className="mt-4 flex items-center justify-center gap-2 text-xs" style={{ color: '#52525b' }}>
              <span style={{ color: '#a78bfa' }}>💜</span>
              100% gratuito · Sem cartão de crédito
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
