import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, Agent } from '@/lib/api';
import { Plus, Bot, Pencil, Trash2, ToggleLeft, ToggleRight, X, Loader2, ChevronDown } from 'lucide-react';

const MODELS = [
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini', provider: 'openai' },
  { value: 'gpt-4o', label: 'GPT-4o', provider: 'openai' },
  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo', provider: 'openai' },
  { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet', provider: 'anthropic' },
  { value: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku', provider: 'anthropic' },
];

const DEFAULT_FORM = { name: '', system_prompt: '', model: 'gpt-4o-mini', provider: 'openai', debounce_ms: 1500, max_tokens: 500, temperature: 0.7 };

function AgentModal({ agent, onClose }: { agent?: Agent; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(agent ? {
    name: agent.name, system_prompt: agent.system_prompt,
    model: agent.model, provider: agent.provider,
    debounce_ms: agent.debounce_ms, max_tokens: agent.max_tokens,
    temperature: parseFloat(String(agent.temperature))
  } : { ...DEFAULT_FORM });
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () => agent
      ? api.patch(`/api/agents/${agent.id}`, form)
      : api.post('/api/agents', form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['agents'] }); onClose(); },
    onError: (e: Error) => setError(e.message),
  });

  const setField = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }));
  const selectModel = (val: string) => {
    const m = MODELS.find(m => m.value === val);
    if (m) setForm(f => ({ ...f, model: val, provider: m.provider }));
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-white">
          <h2 className="font-semibold">{agent ? 'Editar agente' : 'Novo agente'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="text-sm font-medium mb-1 block">Nome do agente</label>
            <input value={form.name} onChange={e => setField('name', e.target.value)} required
              placeholder="Ex: Atendimento Bot"
              className="w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Prompt do sistema</label>
            <textarea value={form.system_prompt} onChange={e => setField('system_prompt', e.target.value)}
              rows={5} placeholder="Você é um assistente de atendimento..."
              className="w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none" />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Modelo de IA</label>
            <div className="relative">
              <select value={form.model} onChange={e => selectModel(e.target.value)}
                className="w-full px-3 py-2 pr-8 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 appearance-none bg-white">
                {MODELS.map(m => <option key={m.value} value={m.value}>{m.label} ({m.provider})</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-muted-foreground" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block">Debounce (ms)</label>
              <input type="number" value={form.debounce_ms} onChange={e => setField('debounce_ms', Number(e.target.value))}
                min={0} max={10000}
                className="w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Max tokens</label>
              <input type="number" value={form.max_tokens} onChange={e => setField('max_tokens', Number(e.target.value))}
                min={50} max={4000}
                className="w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Temperatura</label>
              <input type="number" value={form.temperature} onChange={e => setField('temperature', Number(e.target.value))}
                min={0} max={1} step={0.1}
                className="w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
          </div>
          {error && <div className="bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2 text-sm text-destructive">{error}</div>}
        </div>
        <div className="px-6 pb-5 flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted">Cancelar</button>
          <button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.name}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-60">
            {mutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {agent ? 'Salvar' : 'Criar agente'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AgentsPage() {
  const qc = useQueryClient();
  const [modal, setModal] = useState<'new' | Agent | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['agents'], queryFn: () => api.get<{ agents: Agent[] }>('/api/agents') });

  const toggleAgent = useMutation({
    mutationFn: (a: Agent) => api.patch(`/api/agents/${a.id}`, { enabled: !a.enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents'] }),
  });

  const deleteAgent = useMutation({
    mutationFn: (id: number) => api.delete(`/api/agents/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents'] }),
  });

  const agents = data?.agents ?? [];

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">Agentes de IA</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{agents.length} agente{agents.length !== 1 ? 's' : ''} configurado{agents.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setModal('new')}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:opacity-90">
          <Plus className="w-4 h-4" /> Novo agente
        </button>
      </div>

      {isLoading && <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}

      {!isLoading && agents.length === 0 && (
        <div className="text-center py-16 bg-white rounded-xl border border-border">
          <Bot className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
          <p className="font-medium text-foreground">Nenhum agente criado</p>
          <p className="text-sm text-muted-foreground mt-1">Clique em "Novo agente" para começar</p>
        </div>
      )}

      <div className="grid gap-4">
        {agents.map(a => (
          <div key={a.id} className="bg-white rounded-xl border border-border p-5 flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center shrink-0">
              <Bot className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-sm">{a.name}</h3>
                <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">{a.model}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${a.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {a.enabled ? 'Ativo' : 'Inativo'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {a.system_prompt || <em>Sem prompt configurado</em>}
              </p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Debounce: {a.debounce_ms}ms · Máx tokens: {a.max_tokens} · Temp: {a.temperature}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => toggleAgent.mutate(a)} title={a.enabled ? 'Desativar' : 'Ativar'}
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground">
                {a.enabled ? <ToggleRight className="w-5 h-5 text-primary" /> : <ToggleLeft className="w-5 h-5" />}
              </button>
              <button onClick={() => setModal(a)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground">
                <Pencil className="w-4 h-4" />
              </button>
              <button onClick={() => { if (confirm('Deletar agente?')) deleteAgent.mutate(a.id); }}
                className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-destructive">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {modal && (
        <AgentModal
          agent={modal === 'new' ? undefined : modal}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
