import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, Message, Contact } from '@/lib/api';
import { useSSE } from '@/hooks/useSSE';
import { MessageSquare, Search } from 'lucide-react';

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Hoje';
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Ontem';
  return d.toLocaleDateString('pt-BR');
}

export default function MessagesPage() {
  const qc = useQueryClient();
  const [selectedJid, setSelectedJid] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: msgData } = useQuery({ queryKey: ['messages'], queryFn: () => api.get<{ messages: Message[] }>('/api/messages?limit=200') });
  const { data: contactsData } = useQuery({ queryKey: ['contacts'], queryFn: () => api.get<{ contacts: Contact[] }>('/api/contacts') });

  const messages = msgData?.messages ?? [];
  const contacts = contactsData?.contacts ?? [];

  // SSE for live messages
  useSSE(true, (event, data: unknown) => {
    if (event === 'message') {
      qc.invalidateQueries({ queryKey: ['messages'] });
    }
  });

  // Group by contact
  const byContact = messages.reduce<Record<string, Message[]>>((acc, m) => {
    (acc[m.contact_jid] ??= []).push(m);
    return acc;
  }, {});

  const conversations = Object.entries(byContact)
    .map(([jid, msgs]) => {
      const sorted = [...msgs].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      return { jid, msgs: sorted, last: sorted[sorted.length - 1] };
    })
    .sort((a, b) => new Date(b.last.created_at).getTime() - new Date(a.last.created_at).getTime())
    .filter(({ jid }) => {
      if (!search) return true;
      const c = contacts.find(c => c.jid === jid);
      const phone = jid.split('@')[0];
      return (c?.name ?? phone).toLowerCase().includes(search.toLowerCase());
    });

  const selectedConv = selectedJid ? byContact[selectedJid] ?? [] : [];
  const sortedConv = [...selectedConv].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [sortedConv.length, selectedJid]);

  const getContactName = (jid: string) => {
    const c = contacts.find(c => c.jid === jid);
    return c?.name ?? jid.split('@')[0];
  };

  return (
    <div className="flex h-full">
      {/* Sidebar list */}
      <div className={`flex flex-col border-r border-border bg-white ${selectedJid ? 'hidden md:flex' : 'flex'} w-full md:w-72 lg:w-80 shrink-0`}>
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
            const isSelected = selectedJid === jid;
            return (
              <button key={jid} onClick={() => setSelectedJid(jid)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors ${isSelected ? 'bg-accent/50' : ''}`}>
                <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold shrink-0">
                  {name[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium truncate">{name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{formatTime(last.created_at)}</span>
                  </div>
                  <p className={`text-xs truncate mt-0.5 ${last.direction === 'in' ? 'text-muted-foreground' : 'text-primary'}`}>
                    {last.direction === 'out' && '✓ '}{last.body ?? '[mídia]'}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Conversation */}
      <div className={`flex-1 flex flex-col bg-[url('data:image/svg+xml,%3Csvg width=%2260%22 height=%2260%22 viewBox=%220 0 60 60%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cg fill=%22none%22 fill-rule=%22evenodd%22%3E%3Cg fill=%22%2325D366%22 fill-opacity=%220.04%22%3E%3Cpath d=%22M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z%22/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')]`}>
        {!selectedJid ? (
          <div className="hidden md:flex flex-1 items-center justify-center flex-col gap-3 text-muted-foreground">
            <MessageSquare className="w-14 h-14 opacity-20" />
            <p className="font-medium">Selecione uma conversa</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-border">
              <button onClick={() => setSelectedJid(null)} className="md:hidden p-1.5 rounded-lg hover:bg-muted">←</button>
              <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">
                {getContactName(selectedJid)[0].toUpperCase()}
              </div>
              <div>
                <p className="font-semibold text-sm">{getContactName(selectedJid)}</p>
                <p className="text-xs text-muted-foreground">{selectedJid.split('@')[0]}</p>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-1 scrollbar-thin">
              {sortedConv.map((m, i) => {
                const prev = sortedConv[i - 1];
                const showDate = !prev || formatDate(m.created_at) !== formatDate(prev.created_at);
                return (
                  <div key={m.id}>
                    {showDate && (
                      <div className="flex justify-center my-3">
                        <span className="text-xs bg-white/80 text-muted-foreground px-3 py-1 rounded-full shadow-sm">
                          {formatDate(m.created_at)}
                        </span>
                      </div>
                    )}
                    <div className={`flex ${m.direction === 'out' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm shadow-sm ${
                        m.direction === 'out'
                          ? 'bg-primary text-primary-foreground rounded-tr-sm'
                          : 'bg-white text-foreground rounded-tl-sm'
                      }`}>
                        <p className="whitespace-pre-wrap break-words">{m.body ?? `[${m.msg_type}]`}</p>
                        <p className={`text-xs mt-1 text-right ${m.direction === 'out' ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                          {formatTime(m.created_at)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
