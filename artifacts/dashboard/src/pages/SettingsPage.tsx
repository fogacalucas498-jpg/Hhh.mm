import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { api, ApiError, ApiKeyStatus } from '@/lib/api';
import { Key, User, Shield, Cpu, Sun, Moon, CheckCircle2, Loader2, Eye, EyeOff, Trash2, Link } from 'lucide-react';

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

function ApiKeyRow({
  label, hint, isSet, onSave, onRemove
}: {
  label: string; hint: string; isSet: boolean;
  onSave: (key: string) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const save = async () => {
    if (!value.trim()) return;
    setLoading(true); setMsg(null);
    try {
      await onSave(value.trim());
      setValue(''); setEditing(false);
      setMsg({ type: 'ok', text: 'Chave salva com sucesso!' });
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof ApiError ? e.message : 'Erro ao salvar chave.' });
    } finally { setLoading(false); }
  };

  const remove = async () => {
    setLoading(true); setMsg(null);
    try {
      await onRemove();
      setMsg({ type: 'ok', text: 'Chave removida.' });
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof ApiError ? e.message : 'Erro ao remover.' });
    } finally { setLoading(false); }
  };

  return (
    <div className="border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold font-mono">{label}</p>
          {isSet ? (
            <p className="text-xs text-muted-foreground mt-0.5">
              Configurada: <span className="font-mono">{hint}</span>
            </p>
          ) : (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">Não configurada</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isSet && (
            <button onClick={remove} disabled={loading}
              className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={() => { setEditing(v => !v); setMsg(null); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity"
          >
            {isSet ? 'Atualizar' : 'Adicionar'}
          </button>
        </div>
      </div>
      {editing && (
        <div className="space-y-2">
          <div className="relative">
            <input
              type={show ? 'text' : 'password'}
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder={`Cole sua ${label} aqui`}
              className="w-full px-3 py-2 pr-9 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <button type="button" onClick={() => setShow(v => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <div className="flex gap-2">
            <button onClick={save} disabled={loading || !value.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium disabled:opacity-60">
              {loading && <Loader2 className="w-3 h-3 animate-spin" />}
              Salvar
            </button>
            <button onClick={() => { setEditing(false); setValue(''); }}
              className="px-3 py-1.5 rounded-lg border border-border text-xs hover:bg-muted">
              Cancelar
            </button>
          </div>
        </div>
      )}
      {msg && <Alert type={msg.type} text={msg.text} />}
    </div>
  );
}

export default function SettingsPage() {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const qc = useQueryClient();

  const { data: keyStatus, isLoading: keysLoading } = useQuery({
    queryKey: ['api-keys'],
    queryFn: () => api.get<ApiKeyStatus>('/api/settings/api-keys'),
  });

  const saveKey = async (provider: 'openai' | 'anthropic', key: string) => {
    const body = provider === 'openai' ? { openai_key: key } : { anthropic_key: key };
    await api.patch('/api/settings/api-keys', body);
    qc.invalidateQueries({ queryKey: ['api-keys'] });
  };

  const removeKey = async (provider: 'openai' | 'anthropic') => {
    await api.delete(`/api/settings/api-keys/${provider}`);
    qc.invalidateQueries({ queryKey: ['api-keys'] });
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <h1 className="text-xl font-bold text-foreground">Configurações</h1>

      {/* Theme */}
      <div className="bg-card rounded-xl border border-border p-5">
        <div className="flex items-center gap-3 mb-4">
          {theme === 'dark' ? <Moon className="w-5 h-5 text-primary" /> : <Sun className="w-5 h-5 text-primary" />}
          <h2 className="font-semibold">Aparência</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">Escolha entre o tema claro e escuro.</p>
        <div className="flex gap-3">
          {(['light', 'dark'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                theme === t
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:bg-muted'
              }`}
            >
              {t === 'light' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              {t === 'light' ? 'Claro' : 'Escuro'}
            </button>
          ))}
        </div>
      </div>

      {/* Profile summary */}
      <div className="bg-card rounded-xl border border-border p-5">
        <div className="flex items-center gap-3 mb-4">
          <User className="w-5 h-5 text-primary" />
          <h2 className="font-semibold">Perfil</h2>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Nome</label>
            <p className="text-sm font-medium mt-0.5 text-foreground">{user?.name}</p>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">E-mail</label>
            <p className="text-sm font-medium mt-0.5 text-foreground">{user?.email}</p>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">ID de usuário</label>
            <p className="text-sm font-mono text-muted-foreground mt-0.5">#{user?.id}</p>
          </div>
        </div>
      </div>

      {/* API Keys */}
      <div className="bg-card rounded-xl border border-border p-5">
        <div className="flex items-center gap-3 mb-1">
          <Key className="w-5 h-5 text-primary" />
          <h2 className="font-semibold">Chaves de API</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Configure suas chaves de API para usar os modelos de IA. As chaves são armazenadas de forma segura e usadas apenas nos seus agentes.
        </p>
        {keysLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-3">
            <ApiKeyRow
              label="OPENAI_API_KEY"
              hint={keyStatus?.openai_key_hint || ''}
              isSet={!!keyStatus?.openai_key_set}
              onSave={k => saveKey('openai', k)}
              onRemove={() => removeKey('openai')}
            />
            <ApiKeyRow
              label="ANTHROPIC_API_KEY"
              hint={keyStatus?.anthropic_key_hint || ''}
              isSet={!!keyStatus?.anthropic_key_set}
              onSave={k => saveKey('anthropic', k)}
              onRemove={() => removeKey('anthropic')}
            />
          </div>
        )}
        <div className="mt-4 flex items-start gap-2 bg-muted/50 rounded-lg p-3">
          <Link className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
          <div className="text-xs text-muted-foreground space-y-1">
            <p>Obtenha sua chave OpenAI em <strong>platform.openai.com</strong></p>
            <p>Obtenha sua chave Anthropic em <strong>console.anthropic.com</strong></p>
          </div>
        </div>
      </div>

      {/* Stack info */}
      <div className="bg-card rounded-xl border border-border p-5">
        <div className="flex items-center gap-3 mb-4">
          <Cpu className="w-5 h-5 text-primary" />
          <h2 className="font-semibold">Tecnologias</h2>
        </div>
        <div className="grid sm:grid-cols-2 gap-2 text-sm">
          {[
            ['Backend', 'Node.js + Express'],
            ['Banco de dados', 'PostgreSQL'],
            ['WhatsApp', 'Baileys 7.0.0-rc13'],
            ['IA', 'OpenAI + Anthropic'],
            ['Frontend', 'React + Vite + Tailwind'],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
              <span className="text-muted-foreground">{k}</span>
              <span className="font-medium text-xs text-foreground">{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Security */}
      <div className="bg-card rounded-xl border border-border p-5">
        <div className="flex items-center gap-3 mb-3">
          <Shield className="w-5 h-5 text-primary" />
          <h2 className="font-semibold">Segurança</h2>
        </div>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex items-center gap-2">✅ Sessões criptografadas com SESSION_SECRET</li>
          <li className="flex items-center gap-2">✅ Senhas com bcrypt (salt 12)</li>
          <li className="flex items-center gap-2">✅ Rate limiting ativo (150 req/min API, 15/5min auth)</li>
          <li className="flex items-center gap-2">✅ Circuit breaker no envio de mídia</li>
          <li className="flex items-center gap-2">✅ Chaves de API armazenadas por usuário</li>
        </ul>
      </div>
    </div>
  );
}
