import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, Agent, TrainingItem, CustomField, BusinessHours } from '@/lib/api';
import {
  Plus, Bot, Pencil, Trash2, ToggleLeft, ToggleRight, X, Loader2,
  ChevronDown, BookOpen, ChevronRight, Clock, MessageSquare, Tag,
  Settings, AlignLeft
} from 'lucide-react';

const MODELS = [
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini', provider: 'openai' },
  { value: 'gpt-4o', label: 'GPT-4o', provider: 'openai' },
  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo', provider: 'openai' },
  { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet', provider: 'anthropic' },
  { value: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku', provider: 'anthropic' },
];

const DAYS = [
  { key: 'mon', label: 'Segunda' },
  { key: 'tue', label: 'Terça' },
  { key: 'wed', label: 'Quarta' },
  { key: 'thu', label: 'Quinta' },
  { key: 'fri', label: 'Sexta' },
  { key: 'sat', label: 'Sábado' },
  { key: 'sun', label: 'Domingo' },
];

const DEFAULT_SCHEDULE = {
  mon: { active: true, start: '09:00', end: '18:00' },
  tue: { active: true, start: '09:00', end: '18:00' },
  wed: { active: true, start: '09:00', end: '18:00' },
  thu: { active: true, start: '09:00', end: '18:00' },
  fri: { active: true, start: '09:00', end: '18:00' },
  sat: { active: false, start: '09:00', end: '18:00' },
  sun: { active: false, start: '09:00', end: '18:00' },
};

const DEFAULT_BH: BusinessHours = {
  enabled: false,
  timezone: 'America/Sao_Paulo',
  out_of_hours_msg: 'Olá! Nosso atendimento está fora do horário. Retornaremos em breve.',
  schedule: DEFAULT_SCHEDULE,
};

const DEFAULT_FORM = {
  name: '', system_prompt: '', model: 'gpt-4o-mini', provider: 'openai',
  debounce_ms: 1500, max_tokens: 500, temperature: 0.7,
  welcome_message: '',
  business_hours: null as BusinessHours | null,
};

type TabKey = 'geral' | 'config' | 'horario' | 'fluxo';

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: 'geral', label: 'Instruções', icon: AlignLeft },
  { key: 'config', label: 'Configurações', icon: Settings },
  { key: 'horario', label: 'Regras', icon: Clock },
  { key: 'fluxo', label: 'Fluxo', icon: MessageSquare },
];

// ─── Training Panel ─────────────────────────────────────────────────────────

function TrainingPanel({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const qc = useQueryClient();
  const [content, setContent] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['training', agent.id],
    queryFn: () => api.get<{ items: TrainingItem[] }>(`/api/agents/${agent.id}/training`),
  });
  const items = data?.items ?? [];

  const add = useMutation({
    mutationFn: () => api.post(`/api/agents/${agent.id}/training`, { content }),
    onSuccess: () => { setContent(''); qc.invalidateQueries({ queryKey: ['training', agent.id] }); },
  });

  const del = useMutation({
    mutationFn: (id: number) => api.delete(`/api/agents/${agent.id}/training/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['training', agent.id] }),
  });

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-border">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card rounded-t-2xl">
          <div>
            <h2 className="font-semibold text-foreground">Base de conhecimento</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Agente: {agent.name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3 scrollbar-thin">
          {isLoading && <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}
          {!isLoading && items.length === 0 && (
            <div className="text-center py-8 text-sm text-muted-foreground">
              <BookOpen className="w-10 h-10 opacity-30 mx-auto mb-2" />
              Nenhum conhecimento adicionado ainda.<br />
              Adicione FAQs, informações do produto, procedimentos, etc.
            </div>
          )}
          {items.map(item => (
            <div key={item.id} className="flex gap-3 p-3 bg-muted/50 rounded-xl border border-border group">
              <p className="flex-1 text-sm whitespace-pre-wrap break-words leading-relaxed text-foreground">{item.content}</p>
              <button onClick={() => del.mutate(item.id)}
                className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-950 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity shrink-0 self-start">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>

        <div className="px-6 pb-5 pt-3 border-t border-border space-y-2">
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="Cole aqui um FAQ, descrição de produto, procedimento, ou qualquer informação que o bot deve saber..."
            rows={4}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
          />
          <div className="flex justify-end">
            <button onClick={() => add.mutate()} disabled={add.isPending || !content.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60">
              {add.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <Plus className="w-3.5 h-3.5" /> Adicionar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Custom Fields Panel ──────────────────────────────────────────────────────

function CustomFieldsPanel({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const qc = useQueryClient();
  const [newName, setNewName] = useState('');
  const [newValue, setNewValue] = useState('');
  const [editId, setEditId] = useState<number | null>(null);
  const [editVal, setEditVal] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['custom-fields', agent.id],
    queryFn: () => api.get<{ fields: CustomField[] }>(`/api/agents/${agent.id}/custom-fields`),
  });
  const fields = data?.fields ?? [];

  const add = useMutation({
    mutationFn: () => api.post(`/api/agents/${agent.id}/custom-fields`, { field_name: newName, field_value: newValue }),
    onSuccess: () => { setNewName(''); setNewValue(''); qc.invalidateQueries({ queryKey: ['custom-fields', agent.id] }); },
  });

  const update = useMutation({
    mutationFn: (id: number) => api.patch(`/api/agents/${agent.id}/custom-fields/${id}`, { field_value: editVal }),
    onSuccess: () => { setEditId(null); qc.invalidateQueries({ queryKey: ['custom-fields', agent.id] }); },
  });

  const del = useMutation({
    mutationFn: (id: number) => api.delete(`/api/agents/${agent.id}/custom-fields/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['custom-fields', agent.id] }),
  });

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col border border-border">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="font-semibold text-foreground">Campos do lead</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Informações personalizadas sobre o contato — {agent.name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2 scrollbar-thin">
          {isLoading && <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}
          {!isLoading && fields.length === 0 && (
            <div className="text-center py-8 text-sm text-muted-foreground">
              <Tag className="w-10 h-10 opacity-30 mx-auto mb-2" />
              Nenhum campo configurado.<br />
              Adicione campos que o agente deve considerar para cada lead.
            </div>
          )}
          {fields.map(f => (
            <div key={f.id} className="flex gap-2 p-3 bg-muted/50 rounded-xl border border-border group items-start">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-muted-foreground font-mono">{f.field_name}</p>
                {editId === f.id ? (
                  <input
                    value={editVal}
                    onChange={e => setEditVal(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') update.mutate(f.id); if (e.key === 'Escape') setEditId(null); }}
                    className="w-full mt-1 px-2 py-1 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    autoFocus
                  />
                ) : (
                  <p className="text-sm text-foreground mt-0.5 break-words">{f.field_value || <em className="text-muted-foreground/60">sem valor</em>}</p>
                )}
              </div>
              <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                {editId === f.id ? (
                  <>
                    <button onClick={() => update.mutate(f.id)} className="px-2 py-1 rounded bg-primary text-primary-foreground text-xs">Salvar</button>
                    <button onClick={() => setEditId(null)} className="px-2 py-1 rounded border border-border text-xs">×</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => { setEditId(f.id); setEditVal(f.field_value); }}
                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button onClick={() => del.mutate(f.id)}
                      className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-950 text-muted-foreground hover:text-destructive">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="px-6 pb-5 pt-3 border-t border-border space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Adicionar campo</p>
          <div className="flex gap-2">
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Nome do campo"
              className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <input
              value={newValue}
              onChange={e => setNewValue(e.target.value)}
              placeholder="Valor padrão"
              className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <button onClick={() => add.mutate()} disabled={add.isPending || !newName.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60">
            {add.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <Plus className="w-3.5 h-3.5" /> Adicionar campo
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Agent Modal ─────────────────────────────────────────────────────────────

function AgentModal({ agent, onClose }: { agent?: Agent; onClose: () => void }) {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabKey>('geral');
  const [form, setForm] = useState(agent ? {
    name: agent.name,
    system_prompt: agent.system_prompt,
    model: agent.model,
    provider: agent.provider,
    debounce_ms: agent.debounce_ms,
    max_tokens: agent.max_tokens,
    temperature: parseFloat(String(agent.temperature)),
    welcome_message: agent.welcome_message || '',
    business_hours: agent.business_hours || null,
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

  // Business hours helpers
  const bh = form.business_hours || DEFAULT_BH;
  const setBh = (updates: Partial<BusinessHours>) => {
    setField('business_hours', { ...bh, ...updates });
  };
  const setDaySchedule = (day: string, updates: Partial<{ active: boolean; start: string; end: string }>) => {
    setBh({ schedule: { ...bh.schedule, [day]: { ...(bh.schedule[day] || { active: false, start: '09:00', end: '18:00' }), ...updates } } });
  };
  const enableBh = () => setField('business_hours', { ...DEFAULT_BH, enabled: true });
  const disableBh = () => setField('business_hours', null);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-border">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card rounded-t-2xl z-10">
          <div>
            <h2 className="font-semibold text-foreground">{agent ? 'Editar agente' : 'Novo agente'}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{agent ? agent.name : 'Configure seu novo agente de IA'}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted"><X className="w-4 h-4" /></button>
        </div>

        {/* Name always visible */}
        <div className="px-6 pt-4 pb-0">
          <label className="text-sm font-medium mb-1 block text-foreground">Nome do agente *</label>
          <input value={form.name} onChange={e => setField('name', e.target.value)} required
            placeholder="Ex: Atendimento Bot"
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-4 border-b border-border pb-0">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg transition-colors border-b-2 -mb-px ${
                activeTab === key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="px-6 py-5 space-y-4">

            {/* GERAL - Instruções */}
            {activeTab === 'geral' && (
              <>
                <div>
                  <label className="text-sm font-medium mb-1 block text-foreground">Personalidade do agente</label>
                  <p className="text-xs text-muted-foreground mb-2">Descreva como o agente deve se comportar, seu tom de voz e quaisquer regras específicas.</p>
                  <textarea value={form.system_prompt} onChange={e => setField('system_prompt', e.target.value)}
                    rows={8}
                    placeholder="Você é um assistente de atendimento da empresa X. Responda sempre em português, de forma educada e objetiva. Quando o cliente perguntar sobre preços, informe que deve ligar para o número (11) 9999-9999."
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none" />
                  <p className="text-xs text-muted-foreground mt-1">{form.system_prompt.length} caracteres</p>
                </div>
              </>
            )}

            {/* CONFIG - Configurações técnicas */}
            {activeTab === 'config' && (
              <>
                <div>
                  <label className="text-sm font-medium mb-1 block text-foreground">Modelo de IA</label>
                  <div className="relative">
                    <select value={form.model} onChange={e => selectModel(e.target.value)}
                      className="w-full px-3 py-2 pr-8 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 appearance-none">
                      {MODELS.map(m => <option key={m.value} value={m.value}>{m.label} ({m.provider})</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-muted-foreground" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Modelos GPT requerem OPENAI_API_KEY · Modelos Claude requerem ANTHROPIC_API_KEY
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-sm font-medium mb-1 block text-foreground">Debounce (ms)</label>
                    <input type="number" value={form.debounce_ms} onChange={e => setField('debounce_ms', Number(e.target.value))}
                      min={0} max={10000}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                    <p className="text-xs text-muted-foreground mt-1">Aguarda mensagens consecutivas</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block text-foreground">Max tokens</label>
                    <input type="number" value={form.max_tokens} onChange={e => setField('max_tokens', Number(e.target.value))}
                      min={50} max={4000}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                    <p className="text-xs text-muted-foreground mt-1">Tamanho máximo da resposta</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block text-foreground">Temperatura</label>
                    <input type="number" value={form.temperature} onChange={e => setField('temperature', Number(e.target.value))}
                      min={0} max={1} step={0.1}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                    <p className="text-xs text-muted-foreground mt-1">0 = preciso · 1 = criativo</p>
                  </div>
                </div>
              </>
            )}

            {/* HORARIO - Business hours */}
            {activeTab === 'horario' && (
              <>
                <div className="flex items-center justify-between p-4 bg-muted/50 rounded-xl border border-border">
                  <div>
                    <p className="text-sm font-medium text-foreground">Horário de atendimento</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {form.business_hours?.enabled ? 'Ativo — bot responde apenas no horário configurado' : 'Inativo — bot responde sempre'}
                    </p>
                  </div>
                  <button
                    onClick={() => form.business_hours?.enabled ? disableBh() : enableBh()}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.business_hours?.enabled ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.business_hours?.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>

                {form.business_hours?.enabled && (
                  <>
                    <div>
                      <label className="text-sm font-medium mb-1 block text-foreground">Fuso horário</label>
                      <div className="relative">
                        <select
                          value={bh.timezone}
                          onChange={e => setBh({ timezone: e.target.value })}
                          className="w-full px-3 py-2 pr-8 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 appearance-none"
                        >
                          <option value="America/Sao_Paulo">América/São Paulo (BRT, UTC-3)</option>
                          <option value="America/Manaus">América/Manaus (AMT, UTC-4)</option>
                          <option value="America/Belem">América/Belém (BRT, UTC-3)</option>
                          <option value="America/Fortaleza">América/Fortaleza (BRT, UTC-3)</option>
                          <option value="America/Recife">América/Recife (BRT, UTC-3)</option>
                          <option value="America/Cuiaba">América/Cuiabá (AMT, UTC-4)</option>
                          <option value="America/Porto_Velho">América/Porto Velho (AMT, UTC-4)</option>
                          <option value="America/Noronha">América/Noronha (FNT, UTC-2)</option>
                          <option value="UTC">UTC</option>
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-muted-foreground" />
                      </div>
                    </div>

                    <div>
                      <label className="text-sm font-medium mb-2 block text-foreground">Horários por dia</label>
                      <div className="space-y-2">
                        {DAYS.map(({ key, label }) => {
                          const day = bh.schedule?.[key] || { active: false, start: '09:00', end: '18:00' };
                          return (
                            <div key={key} className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${day.active ? 'border-primary/30 bg-primary/5' : 'border-border bg-muted/30'}`}>
                              <button
                                onClick={() => setDaySchedule(key, { active: !day.active })}
                                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${day.active ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                              >
                                <span className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${day.active ? 'translate-x-5' : 'translate-x-1'}`} />
                              </button>
                              <span className={`text-sm w-20 shrink-0 ${day.active ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>{label}</span>
                              {day.active ? (
                                <div className="flex items-center gap-2 flex-1">
                                  <input
                                    type="time"
                                    value={day.start}
                                    onChange={e => setDaySchedule(key, { start: e.target.value })}
                                    className="px-2 py-1 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                                  />
                                  <span className="text-muted-foreground text-xs">até</span>
                                  <input
                                    type="time"
                                    value={day.end}
                                    onChange={e => setDaySchedule(key, { end: e.target.value })}
                                    className="px-2 py-1 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                                  />
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">Fechado</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <label className="text-sm font-medium mb-1 block text-foreground">Mensagem fora do horário</label>
                      <p className="text-xs text-muted-foreground mb-2">Enviada quando o contato manda uma mensagem fora do horário de atendimento.</p>
                      <textarea
                        value={bh.out_of_hours_msg}
                        onChange={e => setBh({ out_of_hours_msg: e.target.value })}
                        rows={3}
                        placeholder="Olá! Nosso atendimento está fora do horário. Retornaremos em breve."
                        className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                      />
                    </div>
                  </>
                )}
              </>
            )}

            {/* FLUXO - Welcome message */}
            {activeTab === 'fluxo' && (
              <>
                <div>
                  <label className="text-sm font-medium mb-1 block text-foreground">Mensagem de boas-vindas</label>
                  <p className="text-xs text-muted-foreground mb-2">
                    Enviada automaticamente na primeira vez que um novo contato manda uma mensagem.
                    Deixe em branco para não enviar.
                  </p>
                  <textarea
                    value={form.welcome_message}
                    onChange={e => setField('welcome_message', e.target.value)}
                    rows={4}
                    placeholder="Olá! Seja bem-vindo(a) ao nosso atendimento. 😊 Como posso ajudá-lo(a) hoje?"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                  />
                  {form.welcome_message && (
                    <div className="mt-2 p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-xl">
                      <p className="text-xs font-medium text-green-700 dark:text-green-400 mb-1">Preview:</p>
                      <p className="text-sm text-green-800 dark:text-green-300 whitespace-pre-wrap">{form.welcome_message}</p>
                    </div>
                  )}
                </div>
                <div className="bg-muted/50 rounded-xl p-4 text-xs text-muted-foreground space-y-1">
                  <p className="font-medium text-foreground">Como funciona:</p>
                  <p>• A mensagem é enviada ANTES da resposta da IA</p>
                  <p>• Enviada apenas uma vez por contato, por dispositivo</p>
                  <p>• Ideal para apresentar o agente ou dar instruções iniciais</p>
                </div>
              </>
            )}

          </div>
        </div>

        {/* Footer */}
        {error && (
          <div className="mx-6 mb-2">
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2 text-sm text-destructive">{error}</div>
          </div>
        )}
        <div className="px-6 pb-5 pt-2 flex gap-2 justify-end border-t border-border">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted text-foreground">Cancelar</button>
          <button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.name}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60">
            {mutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {agent ? 'Salvar' : 'Criar agente'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function AgentsPage() {
  const qc = useQueryClient();
  const [modal, setModal] = useState<'new' | Agent | null>(null);
  const [trainingAgent, setTrainingAgent] = useState<Agent | null>(null);
  const [fieldsAgent, setFieldsAgent] = useState<Agent | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: () => api.get<{ agents: Agent[] }>('/api/agents'),
  });

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
          <h1 className="text-xl font-bold text-foreground">Agentes de IA</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{agents.length} agente{agents.length !== 1 ? 's' : ''} configurado{agents.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setModal('new')}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90">
          <Plus className="w-4 h-4" /> Novo agente
        </button>
      </div>

      {isLoading && (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      )}

      {!isLoading && agents.length === 0 && (
        <div className="text-center py-16 bg-card rounded-xl border border-border">
          <Bot className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
          <p className="font-medium text-foreground">Nenhum agente criado</p>
          <p className="text-sm text-muted-foreground mt-1 mb-4">Configure um agente para responder automaticamente às mensagens</p>
          <button onClick={() => setModal('new')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90">
            <Plus className="w-4 h-4" /> Criar primeiro agente
          </button>
        </div>
      )}

      <div className="grid gap-4">
        {agents.map(a => (
          <div key={a.id} className="bg-card rounded-xl border border-border p-5">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-950 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                <Bot className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-sm text-foreground">{a.name}</h3>
                  <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">{a.model}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${a.enabled ? 'bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-400' : 'bg-muted text-muted-foreground'}`}>
                    {a.enabled ? '● Ativo' : '○ Inativo'}
                  </span>
                  {a.business_hours?.enabled && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-400">
                      <Clock className="w-2.5 h-2.5 inline mr-1" />Horário ativo
                    </span>
                  )}
                  {a.welcome_message && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-400">
                      Boas-vindas ✓
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {a.system_prompt || <em className="text-muted-foreground/60">Sem prompt configurado</em>}
                </p>
                <p className="text-xs text-muted-foreground/60 mt-1.5">
                  Debounce: {a.debounce_ms}ms · Máx tokens: {a.max_tokens} · Temp: {a.temperature}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => setFieldsAgent(a)} title="Campos do lead"
                  className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                  <Tag className="w-4 h-4" />
                </button>
                <button onClick={() => setTrainingAgent(a)} title="Base de conhecimento"
                  className="p-1.5 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-950 text-muted-foreground hover:text-purple-600 dark:hover:text-purple-400 transition-colors">
                  <BookOpen className="w-4 h-4" />
                </button>
                <button onClick={() => toggleAgent.mutate(a)} title={a.enabled ? 'Desativar' : 'Ativar'}
                  className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground">
                  {a.enabled ? <ToggleRight className="w-5 h-5 text-primary" /> : <ToggleLeft className="w-5 h-5" />}
                </button>
                <button onClick={() => setModal(a)}
                  className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground">
                  <Pencil className="w-4 h-4" />
                </button>
                <button onClick={() => { if (confirm(`Deletar agente "${a.name}"?`)) deleteAgent.mutate(a.id); }}
                  className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950 text-muted-foreground hover:text-destructive">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-border/60 flex items-center gap-4 flex-wrap">
              <button onClick={() => setTrainingAgent(a)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors">
                <BookOpen className="w-3 h-3" />
                Base de conhecimento
                <ChevronRight className="w-3 h-3" />
              </button>
              <button onClick={() => setFieldsAgent(a)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors">
                <Tag className="w-3 h-3" />
                Campos do lead
                <ChevronRight className="w-3 h-3" />
              </button>
              {!a.welcome_message && (
                <button onClick={() => { setModal(a); }}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-orange-500 transition-colors">
                  <MessageSquare className="w-3 h-3" />
                  Adicionar boas-vindas
                </button>
              )}
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
      {trainingAgent && (
        <TrainingPanel agent={trainingAgent} onClose={() => setTrainingAgent(null)} />
      )}
      {fieldsAgent && (
        <CustomFieldsPanel agent={fieldsAgent} onClose={() => setFieldsAgent(null)} />
      )}
    </div>
  );
}
