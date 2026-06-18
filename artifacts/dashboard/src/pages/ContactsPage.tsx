import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, Contact } from '@/lib/api';
import { Users, Search, Phone } from 'lucide-react';
import { Loader2 } from 'lucide-react';

export default function ContactsPage() {
  const [search, setSearch] = useState('');
  const { data, isLoading } = useQuery({ queryKey: ['contacts'], queryFn: () => api.get<{ contacts: Contact[] }>('/api/contacts') });
  const contacts = (data?.contacts ?? []).filter(c => {
    if (!search) return true;
    return (c.name ?? '').toLowerCase().includes(search.toLowerCase())
      || (c.phone ?? '').includes(search);
  });

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">Contatos</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{contacts.length} contato{contacts.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nome ou telefone..."
          className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 bg-white" />
      </div>

      {isLoading && <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}

      {!isLoading && contacts.length === 0 && (
        <div className="text-center py-16 bg-white rounded-xl border border-border">
          <Users className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
          <p className="font-medium">{search ? 'Nenhum resultado' : 'Nenhum contato ainda'}</p>
          <p className="text-sm text-muted-foreground mt-1">Os contatos aparecem automaticamente quando mensagens chegam</p>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        {contacts.map(c => (
          <div key={c.id} className="bg-white rounded-xl border border-border p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold shrink-0">
              {(c.name ?? c.phone ?? '?')[0].toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="font-medium text-sm truncate">{c.name ?? c.phone ?? c.jid.split('@')[0]}</p>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Phone className="w-3 h-3" />
                <span>{c.phone ?? c.jid.split('@')[0]}</span>
              </div>
            </div>
            {c.tags?.length > 0 && (
              <div className="ml-auto flex gap-1 flex-wrap">
                {c.tags.map(tag => (
                  <span key={tag} className="text-xs bg-accent text-accent-foreground px-2 py-0.5 rounded-full">{tag}</span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
