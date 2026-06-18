import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, Device, Agent } from '@/lib/api';
import { useSSE } from '@/hooks/useSSE';
import { Plus, Smartphone, QrCode, Wifi, WifiOff, Loader2, X, RefreshCw, LogOut, Trash2, ChevronDown } from 'lucide-react';

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; cls: string; dot: string }> = {
    connected: { label: 'Conectado', cls: 'bg-green-100 text-green-700', dot: 'bg-green-500 animate-pulse' },
    connecting: { label: 'Conectando...', cls: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-500' },
    qr: { label: 'Aguard. QR', cls: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500 animate-pulse' },
    disconnected: { label: 'Desconectado', cls: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' },
  };
  const c = cfg[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${c.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

function QRModal({ deviceId, qr, onClose }: { deviceId: number; qr: string | null; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-semibold">Conectar WhatsApp</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 text-center">
          {qr ? (
            <>
              <div className="inline-block p-3 bg-white border-2 border-primary/20 rounded-xl mb-4">
                <img src={qr} alt="QR Code WhatsApp" className="w-48 h-48" />
              </div>
              <p className="text-sm text-muted-foreground">
                Abra o WhatsApp → Aparelhos conectados → Conectar aparelho
              </p>
            </>
          ) : (
            <div className="py-8">
              <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Gerando QR code...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function NewDeviceModal({ agents, onClose }: { agents: Agent[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [agentId, setAgentId] = useState('');
  const [error, setError] = useState('');
  const mutation = useMutation({
    mutationFn: () => api.post('/api/devices', { name, agentId: agentId ? Number(agentId) : undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['devices'] }); onClose(); },
    onError: (e: Error) => setError(e.message),
  });
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-semibold">Novo dispositivo</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="text-sm font-medium mb-1 block">Nome do dispositivo</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Número principal"
              className="w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Agente de IA (opcional)</label>
            <div className="relative">
              <select value={agentId} onChange={e => setAgentId(e.target.value)}
                className="w-full px-3 py-2 pr-8 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 appearance-none bg-white">
                <option value="">Nenhum</option>
                {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-muted-foreground" />
            </div>
          </div>
          {error && <div className="bg-destructive/10 text-destructive text-sm rounded-lg px-3 py-2">{error}</div>}
        </div>
        <div className="px-6 pb-5 flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted">Cancelar</button>
          <button onClick={() => mutation.mutate()} disabled={mutation.isPending || !name}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-60">
            {mutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Criar
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DevicesPage() {
  const qc = useQueryClient();
  const [newModal, setNewModal] = useState(false);
  const [qrModal, setQrModal] = useState<{ id: number; qr: string | null } | null>(null);

  const { data: devicesData, isLoading } = useQuery({ queryKey: ['devices'], queryFn: () => api.get<{ devices: Device[] }>('/api/devices') });
  const { data: agentsData } = useQuery({ queryKey: ['agents'], queryFn: () => api.get<{ agents: Agent[] }>('/api/agents') });

  const devices = devicesData?.devices ?? [];
  const agents = agentsData?.agents ?? [];

  // SSE for real-time updates
  useSSE(true, (event, data: unknown) => {
    const d = data as Record<string, unknown>;
    if (event === 'device_status') {
      qc.setQueryData(['devices'], (old: { devices: Device[] } | undefined) => {
        if (!old) return old;
        return {
          devices: old.devices.map(dev =>
            dev.id === d.deviceId ? { ...dev, status: String(d.status), phone: d.phone ? String(d.phone) : dev.phone } : dev
          )
        };
      });
      if (d.status === 'connected' && qrModal?.id === Number(d.deviceId)) setQrModal(null);
    }
    if (event === 'device_qr') {
      if (qrModal?.id === Number(d.deviceId)) setQrModal({ id: Number(d.deviceId), qr: String(d.qr) });
    }
  });

  const connect = useMutation({
    mutationFn: async (id: number) => {
      setQrModal({ id, qr: null });
      return api.post(`/api/devices/${id}/connect`);
    },
  });

  const disconnect = useMutation({
    mutationFn: (id: number) => api.post(`/api/devices/${id}/disconnect`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['devices'] }),
  });

  const logout = useMutation({
    mutationFn: (id: number) => api.post(`/api/devices/${id}/logout`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['devices'] }),
  });

  const deleteDevice = useMutation({
    mutationFn: (id: number) => api.delete(`/api/devices/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['devices'] }),
  });

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">Dispositivos WhatsApp</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{devices.length} dispositivo{devices.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setNewModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:opacity-90">
          <Plus className="w-4 h-4" /> Novo dispositivo
        </button>
      </div>

      {isLoading && <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}

      {!isLoading && devices.length === 0 && (
        <div className="text-center py-16 bg-white rounded-xl border border-border">
          <Smartphone className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
          <p className="font-medium">Nenhum dispositivo cadastrado</p>
          <p className="text-sm text-muted-foreground mt-1">Clique em "Novo dispositivo" para adicionar um número</p>
        </div>
      )}

      <div className="grid gap-4">
        {devices.map(d => {
          const agent = agents.find(a => a.id === d.agent_id);
          return (
            <div key={d.id} className="bg-white rounded-xl border border-border p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${d.status === 'connected' ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">{d.name}</h3>
                    <p className="text-xs text-muted-foreground">{d.phone ?? 'Sem número'}</p>
                    {agent && <p className="text-xs text-primary mt-0.5">Agente: {agent.name}</p>}
                  </div>
                </div>
                <StatusBadge status={d.status} />
              </div>

              <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border">
                {d.status === 'disconnected' && (
                  <button onClick={() => connect.mutate(d.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-medium hover:opacity-90">
                    <QrCode className="w-3.5 h-3.5" /> Conectar
                  </button>
                )}
                {(d.status === 'qr' || d.status === 'connecting') && (
                  <button onClick={() => setQrModal({ id: d.id, qr: d.qr ?? null })}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500 text-white text-xs font-medium">
                    <QrCode className="w-3.5 h-3.5" /> Ver QR
                  </button>
                )}
                {d.status === 'connected' && (
                  <>
                    <button onClick={() => disconnect.mutate(d.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs hover:bg-muted">
                      <WifiOff className="w-3.5 h-3.5" /> Desconectar
                    </button>
                    <button onClick={() => { if (confirm('Fazer logout do WhatsApp?')) logout.mutate(d.id); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs hover:bg-muted">
                      <LogOut className="w-3.5 h-3.5" /> Logout
                    </button>
                  </>
                )}
                <button onClick={() => { if (confirm('Deletar dispositivo?')) deleteDevice.mutate(d.id); }}
                  className="ml-auto p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-destructive">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {newModal && <NewDeviceModal agents={agents} onClose={() => setNewModal(false)} />}
      {qrModal && <QRModal deviceId={qrModal.id} qr={qrModal.qr} onClose={() => setQrModal(null)} />}
    </div>
  );
}
