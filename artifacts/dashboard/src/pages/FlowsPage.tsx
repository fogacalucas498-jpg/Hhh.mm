import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, Agent, Flow } from '@/lib/api';
import { Plus, Zap, Trash2, X, Loader2, ChevronDown } from 'lucide-react';

function FlowModal({ agents, onClose }: { agents: Agent[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', triggerKeyword: '', triggerMode: 'exact', agentId: '', steps: [{ responseText: '', delayMs: 0 }] });
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () => api.post(`/api/agents/${form.agentId}/flows`, form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['flows'] }); onClose(); },
    onError: (e: Error) => setError(e.message),
  });

  const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-semibold">Novo fluxo</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="text-sm font-medium mb-1 block">Agente</label>
            <div className="relative">
              <select value={form.agentId} onChange={e => set('agentId', e.target.value)} required
                className="w-full px-3 py-2 pr-8 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 appearance-none bg-white">
                <option value="">Selecione um agente</option>
                {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-muted-foreground" />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Nome do fluxo</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Ex: Menu principal"
              className="w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block">Palavra-chave</label>
              <input value={form.triggerKeyword} onChange={e => set('triggerKeyword', e.target.value)} placeholder="Ex: oi"
                className="w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Modo</label>
              <div className="relative">
                <select value={form.triggerMode} onChange={e => set('triggerMode', e.target.value)}
                  className="w-full px-3 py-2 pr-8 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 appearance-none bg-white">
                  <option value="exact">Exato</option>
                  <option value="contains">Contém</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-muted-foreground" />
              </div>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Resposta</label>
            <textarea value={form.steps[0].responseText} onChange={e => set('steps', [{ ...form.steps[0], responseText: e.target.value }])}
              rows={3} placeholder="Mensagem de resposta automática..."
              className="w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none" />
          </div>
          {error && <div className="bg-destructive/10 text-destructive text-sm rounded-lg px-3 py-2">{error}</div>}
        </div>
        <div className="px-6 pb-5 flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted">Cancelar</button>
          <button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.name || !form.triggerKeyword || !form.agentId}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-60">
            {mutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Criar fluxo
          </button>
        </div>
      </div>
    </div>
  );
}

export default function FlowsPage() {
  const qc = useQueryClient();
  const [modal, setModal] = useState(false);
  const { data: agentsData } = useQuery({ queryKey: ['agents'], queryFn: () => api.get<{ agents: Agent[] }>('/api/agents') });
  const agents = agentsData?.agents ?? [];

  // Fix: include agent IDs in queryKey so query refetches when agents change
  const agentIds = agents.map(a => a.id);
  const { data: allFlows, isLoading } = useQuery({
    queryKey: ['flows', agentIds],
    queryFn: async () => {
      if (agentIds.length === 0) return [];
      const all = await Promise.all(
        agentIds.map(id => api.get<{ flows: Flow[] }>(`/api/agents/${id}/flows`))
      );
      return all.flatMap(r => r.flows);
    },
    enabled: agentIds.length > 0,
  });

  const deleteFlow = useMutation({
    mutationFn: ({ agentId, flowId }: { agentId: number; flowId: number }) =>
      api.delete(`/api/agents/${agentId}/flows/${flowId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['flows'] }),
  });

  const flows = allFlows ?? [];

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">Fluxos automáticos</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{flows.length} fluxo{flows.length !== 1 ? 's' : ''} configurado{flows.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setModal(true)} disabled={agents.length === 0}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:opacity-90 disabled:opacity-50">
          <Plus className="w-4 h-4" /> Novo fluxo
        </button>
      </div>

      {agents.length === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 text-sm text-yellow-800 mb-4">
          Crie um agente primeiro para poder adicionar fluxos.
        </div>
      )}

      {isLoading && <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}

      {!isLoading && flows.length === 0 && agents.length > 0 && (
        <div className="text-center py-16 bg-white rounded-xl border border-border">
          <Zap className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
          <p className="font-medium">Nenhum fluxo criado</p>
          <p className="text-sm text-muted-foreground mt-1">Fluxos respondem automaticamente a palavras-chave</p>
        </div>
      )}

      <div className="grid gap-3">
        {flows.map(f => {
          const agent = agents.find(a => a.id === f.agent_id);
          return (
            <div key={f.id} className="bg-white rounded-xl border border-border p-4 flex items-center gap-4">
              <div className="w-9 h-9 rounded-xl bg-yellow-100 text-yellow-600 flex items-center justify-center shrink-0">
                <Zap className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm">{f.name}</p>
                  <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">{f.trigger_mode}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Gatilho: "<span className="font-mono">{f.trigger_keyword}</span>"
                  {agent && <> · Agente: {agent.name}</>}
                </p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${f.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {f.enabled ? 'Ativo' : 'Inativo'}
              </span>
              <button onClick={() => { if (confirm('Deletar fluxo?')) deleteFlow.mutate({ agentId: f.agent_id, flowId: f.id }); }}
                className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-destructive">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>

      {modal && <FlowModal agents={agents} onClose={() => setModal(false)} />}
    </div>
  );
}
