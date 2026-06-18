import { useAuth } from '@/hooks/useAuth';
import { Key, User, Shield, Cpu } from 'lucide-react';

export default function SettingsPage() {
  const { user } = useAuth();

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <h1 className="text-xl font-bold">Configurações</h1>

      {/* Profile */}
      <div className="bg-white rounded-xl border border-border p-5">
        <div className="flex items-center gap-3 mb-4">
          <User className="w-5 h-5 text-primary" />
          <h2 className="font-semibold">Perfil</h2>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Nome</label>
            <p className="text-sm font-medium mt-0.5">{user?.name}</p>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">E-mail</label>
            <p className="text-sm font-medium mt-0.5">{user?.email}</p>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">ID de usuário</label>
            <p className="text-sm font-mono text-muted-foreground mt-0.5">#{user?.id}</p>
          </div>
        </div>
      </div>

      {/* API Keys */}
      <div className="bg-white rounded-xl border border-border p-5">
        <div className="flex items-center gap-3 mb-4">
          <Key className="w-5 h-5 text-primary" />
          <h2 className="font-semibold">Chaves de API</h2>
        </div>
        <div className="space-y-3">
          {[
            { label: 'OPENAI_API_KEY', desc: 'Necessária para modelos GPT-4o e outros da OpenAI' },
            { label: 'ANTHROPIC_API_KEY', desc: 'Necessária para modelos Claude da Anthropic' },
          ].map(({ label, desc }) => (
            <div key={label} className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
              <code className="text-xs bg-muted px-2 py-1 rounded font-mono text-foreground">{label}</code>
              <p className="text-xs text-muted-foreground flex-1">{desc}</p>
              <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full shrink-0">Secrets do Replit</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Configure estas chaves na aba 🔒 <strong>Secrets</strong> do Replit para habilitar as funcionalidades de IA.
        </p>
      </div>

      {/* Stack info */}
      <div className="bg-white rounded-xl border border-border p-5">
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
              <span className="font-medium text-xs">{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Security */}
      <div className="bg-white rounded-xl border border-border p-5">
        <div className="flex items-center gap-3 mb-3">
          <Shield className="w-5 h-5 text-primary" />
          <h2 className="font-semibold">Segurança</h2>
        </div>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex items-center gap-2">✅ Sessões criptografadas com SESSION_SECRET</li>
          <li className="flex items-center gap-2">✅ Senhas com bcrypt (salt 12)</li>
          <li className="flex items-center gap-2">✅ Rate limiting ativo (150 req/min API, 15/5min auth)</li>
          <li className="flex items-center gap-2">✅ Circuit breaker no envio de mídia</li>
          <li className="flex items-center gap-2">✅ Keep-alive a cada 3 minutos</li>
        </ul>
      </div>
    </div>
  );
}
