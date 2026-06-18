import { useQuery } from '@tanstack/react-query';
import { api, Agent, Device, Message, Contact } from '@/lib/api';
import { Bot, Smartphone, MessageSquare, Users, TrendingUp, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

function StatCard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: number | string; color: string }) {
  return (
    <div className="bg-card rounded-xl p-5 border border-border shadow-sm flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <p className="text-2xl font-bold text-foreground">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function DeviceStatus({ status }: { status: string }) {
  const cfg = {
    connected: { label: 'Conectado', cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', dot: 'bg-green-500' },
    connecting: { label: 'Conectando', cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400', dot: 'bg-yellow-500' },
    qr: { label: 'Aguard. QR', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', dot: 'bg-blue-500' },
    disconnected: { label: 'Desconectado', cls: 'bg-muted text-muted-foreground', dot: 'bg-muted-foreground/50' },
  }[status] ?? { label: status, cls: 'bg-muted text-muted-foreground', dot: 'bg-muted-foreground/50' };

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { data: agentsData } = useQuery({ queryKey: ['agents'], queryFn: () => api.get<{ agents: Agent[] }>('/api/agents') });
  const { data: devicesData } = useQuery({ queryKey: ['devices'], queryFn: () => api.get<{ devices: Device[] }>('/api/devices') });
  const { data: messagesData } = useQuery({ queryKey: ['messages-recent'], queryFn: () => api.get<{ messages: Message[] }>('/api/messages?limit=50') });
  const { data: contactsData } = useQuery({ queryKey: ['contacts'], queryFn: () => api.get<{ contacts: Contact[] }>('/api/contacts') });

  const agents = agentsData?.agents ?? [];
  const devices = devicesData?.devices ?? [];
  const messages = messagesData?.messages ?? [];
  const contacts = contactsData?.contacts ?? [];

  const connectedDevices = devices.filter(d => d.status === 'connected').length;
  const msgIn = messages.filter(m => m.direction === 'in').length;
  const msgOut = messages.filter(m => m.direction === 'out').length;

  // Group messages by contact for recent conversations
  const byContact = messages.reduce<Record<string, Message[]>>((acc, m) => {
    (acc[m.contact_jid] ??= []).push(m);
    return acc;
  }, {});
  const recentConvs = Object.entries(byContact)
    .map(([jid, msgs]) => ({ jid, last: msgs[msgs.length - 1], count: msgs.length }))
    .sort((a, b) => new Date(b.last.created_at).getTime() - new Date(a.last.created_at).getTime())
    .slice(0, 5);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-foreground">Olá, {user?.name?.split(' ')[0]} 👋</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Veja o resumo da sua plataforma</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Bot} label="Agentes" value={agents.length} color="bg-purple-100 text-purple-600" />
        <StatCard icon={Smartphone} label="Conectados" value={`${connectedDevices}/${devices.length}`} color="bg-green-100 text-green-600" />
        <StatCard icon={MessageSquare} label="Msgs recebidas" value={msgIn} color="bg-blue-100 text-blue-600" />
        <StatCard icon={Users} label="Contatos" value={contacts.length} color="bg-orange-100 text-orange-600" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Devices */}
        <div className="bg-card rounded-xl border border-border shadow-sm">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="font-semibold text-sm">Dispositivos WhatsApp</h2>
          </div>
          <div className="divide-y divide-border">
            {devices.length === 0 && (
              <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                Nenhum dispositivo cadastrado ainda.
              </div>
            )}
            {devices.map(d => (
              <div key={d.id} className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-3">
                  <Smartphone className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-sm font-medium">{d.name}</p>
                    <p className="text-xs text-muted-foreground">{d.phone ?? 'Sem número'}</p>
                  </div>
                </div>
                <DeviceStatus status={d.status} />
              </div>
            ))}
          </div>
        </div>

        {/* Recent conversations */}
        <div className="bg-card rounded-xl border border-border shadow-sm">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="font-semibold text-sm">Conversas recentes</h2>
          </div>
          <div className="divide-y divide-border">
            {recentConvs.length === 0 && (
              <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                Nenhuma conversa ainda.
              </div>
            )}
            {recentConvs.map(({ jid, last, count }) => {
              const phone = jid.split('@')[0];
              const contact = contacts.find(c => c.jid === jid);
              return (
                <div key={jid} className="flex items-center gap-3 px-5 py-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                    {(contact?.name ?? phone)[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{contact?.name ?? phone}</p>
                    <p className="text-xs text-muted-foreground truncate">{last.body ?? '[mídia]'}</p>
                  </div>
                  <span className="text-xs bg-primary/10 text-primary rounded-full px-1.5 py-0.5">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Traffic */}
      <div className="bg-card rounded-xl border border-border shadow-sm p-5">
        <h2 className="font-semibold text-sm mb-4">Tráfego de mensagens</h2>
        <div className="flex gap-6">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <span className="text-sm text-muted-foreground">Recebidas: <span className="font-semibold text-foreground">{msgIn}</span></span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span className="text-sm text-muted-foreground">Enviadas: <span className="font-semibold text-foreground">{msgOut}</span></span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-muted-foreground/40" />
            <span className="text-sm text-muted-foreground">Total: <span className="font-semibold text-foreground">{messages.length}</span></span>
          </div>
        </div>
        {messages.length > 0 && (
          <div className="mt-3 h-2 bg-muted rounded-full overflow-hidden flex">
            <div className="bg-blue-500 h-full transition-all" style={{ width: `${(msgIn / messages.length) * 100}%` }} />
            <div className="bg-green-500 h-full transition-all flex-1" />
          </div>
        )}
      </div>
    </div>
  );
}
