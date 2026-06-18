import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { api, Contact, Device } from '@/lib/api';
import { useSSE } from '@/hooks/useSSE';
import { MessageSquare, Search, Send, ChevronDown, Bot, RefreshCw, ChevronUp } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Conversation {
  contact_jid: string;
  last_body: string | null;
  last_direction: 'in' | 'out';
  last_msg_type: string;
  last_at: string;
  last_agent_id: number | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_tags: string[];
  message_count: number;
}

interface ThreadMessage {
  id: number;
  direction: 'in' | 'out';
  body: string | null;
  msg_type: string;
  created_at: string;
  device_id: number | null;
  agent_id: number | null;
  wa_msg_id: string | null;
  device_name: string | null;
  agent_name: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Hoje';
  const y = new Date(today); y.setDate(today.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function displayName(conv: Conversation) {
  return conv.contact_name || conv.contact_phone || conv.contact_jid.split('@')[0];
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';
}

// ── Avatar ────────────────────────────────────────────────────────────────────

function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const sz = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm';
  return (
    <div className={`${sz} rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold shrink-0`}>
      {initials(name)}
    </div>
  );
}

// ── Sidebar item ──────────────────────────────────────────────────────────────

function ConvItem({ conv, selected, onClick }: { conv: Conversation; selected: boolean; onClick: () => void }) {
  const name = displayName(conv);
  const preview = conv.last_body ?? `[${conv.last_msg_type}]`;

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors border-b border-border/50 last:border-0 ${selected ? 'bg-accent/60' : ''}`}
    >
      <Avatar name={name} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <span className="text-sm font-semibold truncate">{name}</span>
          <span className="text-[10px] text-muted-foreground shrink-0">{fmt(conv.last_at)}</span>
        </div>
        <p className={`text-xs truncate mt-0.5 flex items-center gap-1 ${conv.last_direction === 'out' ? 'text-primary/70' : 'text-muted-foreground'}`}>
          {conv.last_direction === 'out' && <span className="text-[10px]">✓</span>}
          {conv.last_agent_id && <Bot className="w-3 h-3 shrink-0 text-violet-500" />}
          <span className="truncate">{preview}</span>
        </p>
      </div>
      {conv.message_count > 0 && (
        <span className="shrink-0 text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
          {conv.message_count > 999 ? '999+' : conv.message_count}
        </span>
      )}
    </button>
  );
}

// ── Message bubble ─────────────────────────────────────────────────────────────

function Bubble({ msg }: { msg: ThreadMessage }) {
  const isOut = msg.direction === 'out';
  const isAgent = isOut && !!msg.agent_id;

  return (
    <div className={`flex ${isOut ? 'justify-end' : 'justify-start'} group`}>
      <div className={`max-w-[75%] flex flex-col ${isOut ? 'items-end' : 'items-start'}`}>
        {/* Agent badge */}
        {isAgent && (
          <div className="flex items-center gap-1 mb-1 px-1">
            <Bot className="w-3 h-3 text-violet-500" />
            <span className="text-[10px] text-violet-500 font-medium">{msg.agent_name ?? 'Agente IA'}</span>
          </div>
        )}
        <div className={`px-3.5 py-2 rounded-2xl text-sm shadow-sm ${
          isAgent
            ? 'bg-violet-600 text-white rounded-tr-sm'
            : isOut
            ? 'bg-primary text-primary-foreground rounded-tr-sm'
            : 'bg-card text-foreground rounded-tl-sm border border-border/50'
        }`}>
          <p className="whitespace-pre-wrap break-words leading-relaxed">
            {msg.body ?? <span className="italic opacity-60">[{msg.msg_type}]</span>}
          </p>
          <div className={`flex items-center gap-1.5 mt-0.5 justify-end ${
            isOut ? 'text-primary-foreground/60' : 'text-muted-foreground'
          }`}>
            {msg.device_name && (
              <span className="text-[9px] opacity-70 truncate max-w-[80px]">{msg.device_name}</span>
            )}
            <span className="text-[10px] shrink-0">{fmt(msg.created_at)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function MessagesPage() {
  const qc = useQueryClient();
  const [selectedJid, setSelectedJid] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [text, setText] = useState('');
  const [selectedDevice, setSelectedDevice] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const prevScrollHeight = useRef(0);

  // ── Data ──

  const { data: convData, isLoading: convLoading, refetch: refetchConvs } = useQuery({
    queryKey: ['conversations', search],
    queryFn: () => api.get<{ conversations: Conversation[] }>(
      `/api/conversations?limit=60${search ? `&search=${encodeURIComponent(search)}` : ''}`
    ),
    staleTime: 15_000,
  });

  const { data: devicesData } = useQuery({
    queryKey: ['devices'],
    queryFn: () => api.get<{ devices: Device[] }>('/api/devices'),
  });

  const { data: contactsData } = useQuery({
    queryKey: ['contacts'],
    queryFn: () => api.get<{ contacts: Contact[] }>('/api/contacts?limit=500'),
  });

  const {
    data: threadData,
    fetchNextPage,
    isFetchingNextPage,
    refetch: refetchThread,
  } = useInfiniteQuery({
    queryKey: ['thread', selectedJid],
    queryFn: async ({ pageParam }: { pageParam?: number }) => {
      const url = `/api/conversations/${encodeURIComponent(selectedJid!)}/messages?limit=50${pageParam ? `&before=${pageParam}` : ''}`;
      return api.get<{ messages: ThreadMessage[]; hasMore: boolean }>(url);
    },
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (firstPage) => {
      if (!firstPage.hasMore || !firstPage.messages.length) return undefined;
      return firstPage.messages[0].id; // oldest id in current page → fetch before it
    },
    enabled: !!selectedJid,
    staleTime: 10_000,
  });

  const conversations = convData?.conversations ?? [];
  const connectedDevices = (devicesData?.devices ?? []).filter(d => d.status === 'connected');

  // All messages across pages, oldest-first
  const allMessages = threadData?.pages
    ? [...threadData.pages].reverse().flatMap(p => p.messages)
    : [];

  const hasOlderMessages = threadData?.pages?.[threadData.pages.length - 1]?.hasMore ?? false;

  // ── Device default ──
  useEffect(() => {
    if (connectedDevices.length > 0 && !selectedDevice) {
      setSelectedDevice(connectedDevices[0].id);
    }
  }, [connectedDevices.length]);

  // ── Scroll to bottom on new messages or conversation switch ──
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedJid, allMessages.length]);

  // ── Preserve scroll position when loading older messages ──
  const loadOlder = useCallback(async () => {
    if (threadRef.current) {
      prevScrollHeight.current = threadRef.current.scrollHeight;
    }
    await fetchNextPage();
  }, [fetchNextPage]);

  useEffect(() => {
    if (!threadRef.current || !isFetchingNextPage) return;
    const el = threadRef.current;
    requestAnimationFrame(() => {
      const newHeight = el.scrollHeight;
      el.scrollTop = newHeight - prevScrollHeight.current;
    });
  }, [isFetchingNextPage, allMessages.length]);

  // ── SSE live updates ──
  useSSE(true, (event) => {
    if (event === 'message') {
      qc.invalidateQueries({ queryKey: ['conversations'] });
      if (selectedJid) qc.invalidateQueries({ queryKey: ['thread', selectedJid] });
    }
  });

  // ── Send ──
  const sendMsg = useMutation({
    mutationFn: () => api.post('/api/messages/send', {
      deviceId: selectedDevice, jid: selectedJid, text: text.trim(),
    }),
    onSuccess: () => {
      setText('');
      qc.invalidateQueries({ queryKey: ['thread', selectedJid] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (text.trim() && selectedDevice && selectedJid) sendMsg.mutate();
    }
  };

  const selectedConvMeta = conversations.find(c => c.contact_jid === selectedJid)
    ?? (() => {
      const c = contactsData?.contacts.find(c => c.jid === selectedJid);
      if (c) return { contact_name: c.name, contact_phone: c.phone, contact_jid: selectedJid! } as Conversation;
      return null;
    })();

  const selectedName = selectedConvMeta ? displayName(selectedConvMeta as Conversation) : (selectedJid?.split('@')[0] ?? '');

  return (
    <div className="flex h-full">

      {/* ── Sidebar ── */}
      <div className={`flex flex-col border-r border-border bg-card ${selectedJid ? 'hidden md:flex' : 'flex'} w-full md:w-72 lg:w-80 shrink-0`}>
        <div className="p-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar conversa..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 bg-background"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {convLoading && (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <RefreshCw className="w-4 h-4 animate-spin mr-2" />
              <span className="text-sm">Carregando...</span>
            </div>
          )}
          {!convLoading && conversations.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              {search ? 'Sem resultados para "' + search + '"' : 'Nenhuma conversa ainda'}
            </div>
          )}
          {conversations.map(conv => (
            <ConvItem
              key={conv.contact_jid}
              conv={conv}
              selected={selectedJid === conv.contact_jid}
              onClick={() => setSelectedJid(conv.contact_jid)}
            />
          ))}
        </div>
      </div>

      {/* ── Thread ── */}
      <div
        className="flex-1 flex flex-col bg-muted/30"
        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%2325D366' fill-opacity='0.04'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }}
      >
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
              <button
                onClick={() => setSelectedJid(null)}
                className="md:hidden p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
              >←</button>

              <Avatar name={selectedName} />

              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{selectedName}</p>
                <p className="text-xs text-muted-foreground">
                  {selectedJid.split('@')[0]}
                  {selectedConvMeta && (selectedConvMeta as Conversation).message_count > 0 && (
                    <span className="ml-2 text-muted-foreground/60">
                      · {(selectedConvMeta as Conversation).message_count} mensagens
                    </span>
                  )}
                </p>
              </div>

              {/* Device selector */}
              {connectedDevices.length > 1 && (
                <div className="relative">
                  <select
                    value={selectedDevice ?? ''}
                    onChange={e => setSelectedDevice(Number(e.target.value))}
                    className="text-xs border border-border rounded-lg px-2 py-1.5 pr-6 appearance-none bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    {connectedDevices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                  <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none text-muted-foreground" />
                </div>
              )}
              {connectedDevices.length === 1 && (
                <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full shrink-0">
                  {connectedDevices[0].name}
                </span>
              )}
              {connectedDevices.length === 0 && (
                <span className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 px-2 py-1 rounded-full shrink-0">
                  Sem dispositivo
                </span>
              )}

              <button
                onClick={() => refetchThread()}
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground shrink-0"
                title="Atualizar"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Messages area */}
            <div ref={threadRef} className="flex-1 overflow-y-auto p-4 space-y-1 scrollbar-thin">

              {/* Load older */}
              {hasOlderMessages && (
                <div className="flex justify-center pb-2">
                  <button
                    onClick={loadOlder}
                    disabled={isFetchingNextPage}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground bg-card border border-border px-3 py-1.5 rounded-full shadow-sm transition-colors disabled:opacity-50"
                  >
                    {isFetchingNextPage
                      ? <><RefreshCw className="w-3 h-3 animate-spin" /> Carregando...</>
                      : <><ChevronUp className="w-3 h-3" /> Carregar mensagens anteriores</>
                    }
                  </button>
                </div>
              )}

              {/* Legend */}
              {allMessages.some(m => m.agent_id) && (
                <div className="flex justify-center mb-2">
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground bg-card/80 border border-border px-2.5 py-1 rounded-full">
                    <Bot className="w-3 h-3 text-violet-500" />
                    Mensagens roxas são respostas automáticas do agente IA
                  </span>
                </div>
              )}

              {/* Bubbles */}
              {allMessages.map((m, i) => {
                const prev = allMessages[i - 1];
                const showDate = !prev || fmtDate(m.created_at) !== fmtDate(prev.created_at);
                return (
                  <div key={m.id}>
                    {showDate && (
                      <div className="flex justify-center my-3">
                        <span className="text-xs bg-card/90 text-muted-foreground px-3 py-1 rounded-full shadow-sm border border-border/30">
                          {fmtDate(m.created_at)}
                        </span>
                      </div>
                    )}
                    <Bubble msg={m} />
                  </div>
                );
              })}

              {allMessages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground pt-20">
                  <MessageSquare className="w-10 h-10 opacity-20" />
                  <p className="text-sm">Nenhuma mensagem ainda</p>
                </div>
              )}

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
                    value={text}
                    onChange={e => setText(e.target.value)}
                    onKeyDown={handleKey}
                    placeholder="Digite uma mensagem... (Enter para enviar, Shift+Enter para nova linha)"
                    rows={1}
                    className="flex-1 resize-none px-3 py-2.5 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 bg-muted/30 max-h-32 overflow-y-auto"
                    style={{ minHeight: '42px' }}
                  />
                  <button
                    onClick={() => { if (text.trim() && selectedDevice && selectedJid) sendMsg.mutate(); }}
                    disabled={!text.trim() || !selectedDevice || sendMsg.isPending}
                    className="w-10 h-10 shrink-0 rounded-full bg-primary text-white flex items-center justify-center hover:opacity-90 disabled:opacity-40 transition-opacity"
                  >
                    {sendMsg.isPending
                      ? <RefreshCw className="w-4 h-4 animate-spin" />
                      : <Send className="w-4 h-4" />
                    }
                  </button>
                </div>
              )}
              {sendMsg.isError && (
                <p className="text-xs text-red-500 mt-1">{(sendMsg.error as Error).message}</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
