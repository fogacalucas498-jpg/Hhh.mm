import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, Message, Contact, Device } from '@/lib/api';
import { useSSE } from '@/hooks/useSSE';
import { MessageSquare, Search, Send, ChevronDown } from 'lucide-react';

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
function formatDate(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Hoje';
  const y = new Date(today); y.setDate(today.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Ontem';
  return d.toLocaleDateString('pt-BR');
}

export default function MessagesPage() {
  const qc = useQueryClient();
  const [selectedJid, setSelectedJid] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [text, setText] = useState('');
  const [selectedDevice, setSelectedDevice] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { data: msgData } = useQuery({ queryKey: ['messages'], queryFn: () => api.get<{ messages: Message[] }>('/api/messages?limit=300') });
  const { data: contactsData } = useQuery({ queryKey: ['contacts'], queryFn: () => api.get<{ contacts: Contact[] }>('/api/contacts') });
  const { data: devicesData } = useQuery({ queryKey: ['devices'], queryFn: () => api.get<{ devices: Device[] }>('/api/devices') });

  const messages = msgData?.messages ?? [];
  const contacts = contactsData?.contacts ?? [];
  const connectedDevices = (devicesData?.devices ?? []).filter(d => d.status === 'connected');

  // Set default device
  useEffect(() => {
    if (connectedDevices.length > 0 && !selectedDevice) {
      setSelectedDevice(connectedDevices[0].id);
    }
  }, [connectedDevices.length]);

  // SSE live messages
  useSSE(true, (event) => {
    if (event === 'message') qc.invalidateQueries({ queryKey: ['messages'] });
  });

  const sendMsg = useMutation({
    mutationFn: () => api.post('/api/messages/send', { deviceId: selectedDevice, jid: selectedJid, text }),
    onSuccess: () => { setText(''); qc.invalidateQueries({ queryKey: ['messages'] }); },
  });

  // Group by contact
  const byContact = messages.reduce<Record<string, Message[]>>((acc, m) => {
    (acc[m.contact_jid] ??= []).push(m);
    return acc;
  }, {});

  const conversations = Object.entries(byContact)
    .map(([jid, msgs]) => {
      const sorted = [...msgs].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
      return { jid, msgs: sorted, last: sorted[sorted.length - 1] };
    })
    .sort((a, b) => +new Date(b.last.created_at) - +new Date(a.last.created_at))
    .filter(({ jid }) => {
      if (!search) return true;
      const c = contacts.find(c => c.jid === jid);
      const phone = jid.split('@')[0];
      return (c?.name ?? phone).toLowerCase().includes(search.toLowerCase());
    });

  const selectedConv = selectedJid ? [...(byContact[selectedJid] ?? [])].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at)) : [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedConv.length, selectedJid]);

  const getContactName = (jid: string) => {
    const c = contacts.find(c => c.jid === jid);
    return c?.name ?? jid.split('@')[0];
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (text.trim() && selectedDevice && selectedJid) sendMsg.mutate();
    }
  };

  return (
    <div className="flex h-full">
      {/* Sidebar list */}
      <div className={`flex flex-col border-r border-border bg-card ${selectedJid ? 'hidden md:flex' : 'flex'} w-full md:w-72 lg:w-80 shrink-0`}>
        <div className="p-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar conversa..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 bg-background" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin divide-y divide-border">
          {conversations.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              {search ? 'Sem resultados' : 'Nenhuma conversa ainda'}
            </div>
          )}
          {conversations.map(({ jid, last }) => {
            const name = getContactName(jid);
            return (
              <button key={jid} onClick={() => setSelectedJid(jid)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors ${selectedJid === jid ? 'bg-accent/50' : ''}`}>
                <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold shrink-0">
                  {name[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium truncate">{name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{formatTime(last.created_at)}</span>
                  </div>
                  <p className={`text-xs truncate mt-0.5 ${last.direction === 'in' ? 'text-muted-foreground' : 'text-primary/80'}`}>
                    {last.direction === 'out' && '✓ '}{last.body ?? '[mídia]'}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Conversation */}
      <div className="flex-1 flex flex-col bg-muted/30" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%2325D366' fill-opacity='0.04'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")">
        {!selectedJid ? (
          <div className="hidden md:flex flex-1 items-center justify-center flex-col gap-3 text-muted-foreground">
            <MessageSquare className="w-14 h-14 opacity-20" />
            <p className="font-medium text-base">Selecione uma conversa</p>
            <p className="text-sm opacity-70">ou aguarde mensagens chegarem</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 bg-card border-b border-border shadow-sm">
              <button onClick={() => setSelectedJid(null)} className="md:hidden p-1.5 rounded-lg hover:bg-muted text-muted-foreground">←</button>
              <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">
                {getContactName(selectedJid)[0].toUpperCase()}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-sm">{getContactName(selectedJid)}</p>
                <p className="text-xs text-muted-foreground">{selectedJid.split('@')[0]}</p>
              </div>
              {/* Device selector */}
              {connectedDevices.length > 1 && (
                <div className="relative">
                  <select value={selectedDevice ?? ''} onChange={e => setSelectedDevice(Number(e.target.value))}
                    className="text-xs border border-border rounded-lg px-2 py-1.5 pr-6 appearance-none bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50">
                    {connectedDevices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                  <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none text-muted-foreground" />
                </div>
              )}
              {connectedDevices.length === 1 && (
                <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">{connectedDevices[0].name}</span>
              )}
              {connectedDevices.length === 0 && (
                <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full">Nenhum dispositivo conectado</span>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-1 scrollbar-thin">
              {selectedConv.map((m, i) => {
                const prev = selectedConv[i - 1];
                const showDate = !prev || formatDate(m.created_at) !== formatDate(prev.created_at);
                return (
                  <div key={m.id}>
                    {showDate && (
                      <div className="flex justify-center my-3">
                        <span className="text-xs bg-card/90 text-muted-foreground px-3 py-1 rounded-full shadow-sm">
                          {formatDate(m.created_at)}
                        </span>
                      </div>
                    )}
                    <div className={`flex ${m.direction === 'out' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[75%] px-3.5 py-2 rounded-2xl text-sm shadow-sm ${
                        m.direction === 'out'
                          ? 'bg-primary text-primary-foreground rounded-tr-sm'
                          : 'bg-card text-foreground rounded-tl-sm'
                      }`}>
                        <p className="whitespace-pre-wrap break-words leading-relaxed">{m.body ?? `[${m.msg_type}]`}</p>
                        <p className={`text-[10px] mt-0.5 text-right ${m.direction === 'out' ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                          {formatTime(m.created_at)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="bg-card border-t border-border px-4 py-3">
              {connectedDevices.length === 0 ? (
                <div className="text-center text-sm text-amber-600 py-1">
                  Conecte um dispositivo WhatsApp para enviar mensagens
                </div>
              ) : (
                <div className="flex items-end gap-2">
                  <textarea
                    ref={inputRef}
                    value={text}
                    onChange={e => setText(e.target.value)}
                    onKeyDown={handleKey}
                    placeholder="Digite uma mensagem... (Enter para enviar)"
                    rows={1}
                    className="flex-1 resize-none px-3 py-2.5 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 bg-muted/30 max-h-32 overflow-y-auto"
                    style={{ minHeight: '42px' }}
                  />
                  <button
                    onClick={() => { if (text.trim() && selectedDevice && selectedJid) sendMsg.mutate(); }}
                    disabled={!text.trim() || !selectedDevice || sendMsg.isPending}
                    className="w-10 h-10 shrink-0 rounded-full bg-primary text-white flex items-center justify-center hover:opacity-90 disabled:opacity-40 transition-opacity"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
