import { Link, useLocation } from 'wouter';
import { useAuth } from '@/hooks/useAuth';
import { useNotifications } from '@/hooks/useNotifications';
import {
  LayoutDashboard, Bot, Smartphone, MessageSquare,
  Users, Zap, Settings, LogOut, Menu, Bell, X,
  MessageCircle, Wifi, WifiOff, Info
} from 'lucide-react';
import { useState } from 'react';

const nav = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/agents', icon: Bot, label: 'Agentes' },
  { to: '/devices', icon: Smartphone, label: 'Dispositivos' },
  { to: '/messages', icon: MessageSquare, label: 'Mensagens' },
  { to: '/contacts', icon: Users, label: 'Contatos' },
  { to: '/flows', icon: Zap, label: 'Fluxos' },
];

function NotifIcon({ type }: { type: string }) {
  if (type === 'message') return <MessageCircle className="w-4 h-4 text-primary shrink-0" />;
  if (type === 'device_connected') return <Wifi className="w-4 h-4 text-green-600 shrink-0" />;
  if (type === 'device_disconnected') return <WifiOff className="w-4 h-4 text-red-500 shrink-0" />;
  return <Info className="w-4 h-4 text-muted-foreground shrink-0" />;
}

function timeAgo(date: Date) {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return 'agora';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const [loc] = useLocation();
  const { user, logout } = useAuth();
  const { notifications, toasts, unreadCount, markAllRead, dismissToast } = useNotifications();
  const [open, setOpen] = useState(false);
  const [notifPanel, setNotifPanel] = useState(false);

  const initials = user?.name
    ? user.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
    : '?';

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 bg-black/50 z-20 lg:hidden" onClick={() => setOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-30 flex flex-col w-64
        bg-sidebar text-sidebar-foreground transition-transform duration-200
        ${open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-white/5">
          <img
            src="/logo.jpg"
            alt="Bot.io"
            className="w-9 h-9 rounded-xl object-cover ring-1 ring-white/10"
          />
          <div>
            <p className="font-bold text-white text-sm tracking-tight">Bot.io</p>
            <p className="text-xs text-sidebar-foreground/50 truncate max-w-[120px]">{user?.name}</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto scrollbar-thin">
          {nav.map(({ to, icon: Icon, label }) => {
            const active = to === '/' ? loc === '/' : loc.startsWith(to);
            return (
              <Link key={to} href={to}
                onClick={() => setOpen(false)}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                  ${active
                    ? 'bg-sidebar-primary text-white shadow-sm shadow-sidebar-primary/30'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                  }
                `}>
                <Icon className="w-4 h-4 shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Bottom */}
        <div className="px-3 pb-4 border-t border-white/5 pt-4 space-y-0.5">
          {/* Notifications bell */}
          <button
            onClick={() => { setNotifPanel(v => !v); if (unreadCount > 0) markAllRead(); }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent transition-colors relative"
          >
            <Bell className="w-4 h-4" />
            Notificações
            {unreadCount > 0 && (
              <span className="ml-auto bg-primary text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          <Link href="/profile" onClick={() => setOpen(false)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors
              ${loc === '/profile'
                ? 'bg-sidebar-primary text-white'
                : 'text-sidebar-foreground/70 hover:bg-sidebar-accent'
              }`}>
            <div className="w-5 h-5 rounded-full bg-sidebar-primary/40 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
              {initials}
            </div>
            Meu Perfil
          </Link>
          <Link href="/settings" onClick={() => setOpen(false)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors
              ${loc === '/settings'
                ? 'bg-sidebar-primary text-white'
                : 'text-sidebar-foreground/70 hover:bg-sidebar-accent'
              }`}>
            <Settings className="w-4 h-4" />
            Configurações
          </Link>
          <button onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-red-400/80 hover:bg-red-950/30 hover:text-red-400 transition-colors">
            <LogOut className="w-4 h-4" />
            Sair
          </button>
        </div>
      </aside>

      {/* Notifications panel (floating, beside sidebar) */}
      {notifPanel && (
        <div className="fixed z-40 left-64 bottom-16 w-80 bg-white rounded-2xl shadow-2xl border border-border overflow-hidden"
          style={{ maxHeight: '400px' }}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="font-semibold text-sm">Notificações</span>
            <button onClick={() => setNotifPanel(false)} className="p-1 rounded-lg hover:bg-muted">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="overflow-y-auto scrollbar-thin" style={{ maxHeight: '340px' }}>
            {notifications.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                <Bell className="w-8 h-8 mx-auto mb-2 opacity-20" />
                Nenhuma notificação
              </div>
            ) : (
              notifications.map(n => (
                <div key={n.id} className={`flex gap-3 px-4 py-3 border-b border-border/50 last:border-0 ${n.read ? '' : 'bg-primary/3'}`}>
                  <NotifIcon type={n.type} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{n.title}</p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{n.body}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5">{timeAgo(n.timestamp)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar (mobile) */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b">
          <button onClick={() => setOpen(true)} className="p-1.5 rounded-lg hover:bg-muted">
            <Menu className="w-5 h-5" />
          </button>
          <img src="/logo.jpg" alt="Bot.io" className="w-7 h-7 rounded-lg object-cover" />
          <span className="font-bold text-sm flex-1">Bot.io</span>
          <button
            onClick={() => { setNotifPanel(v => !v); if (unreadCount > 0) markAllRead(); }}
            className="relative p-1.5 rounded-lg hover:bg-muted"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-0.5 right-0.5 bg-primary text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
        </header>
        <main className="flex-1 overflow-y-auto scrollbar-thin relative">
          {children}
        </main>
      </div>

      {/* Toast notifications — fixed bottom-right */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none" style={{ maxWidth: 340 }}>
        {toasts.map(t => (
          <div key={t.id}
            className="pointer-events-auto flex items-start gap-3 bg-white border border-border rounded-xl shadow-lg px-4 py-3 animate-in slide-in-from-right-4 fade-in duration-300"
          >
            <NotifIcon type={t.type} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">{t.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{t.body}</p>
            </div>
            <button
              onClick={() => dismissToast(t.id)}
              className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
