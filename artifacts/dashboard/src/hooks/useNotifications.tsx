import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';
import { useAuth } from './useAuth';

export interface AppNotification {
  id: string;
  type: 'message' | 'device_connected' | 'device_disconnected' | 'info';
  title: string;
  body: string;
  timestamp: Date;
  read: boolean;
}

interface NotificationsCtx {
  notifications: AppNotification[];
  toasts: AppNotification[];
  unreadCount: number;
  markAllRead: () => void;
  dismiss: (id: string) => void;
  dismissToast: (id: string) => void;
}

const NotificationsContext = createContext<NotificationsCtx | null>(null);

// SSE events are dispatched on window so other hooks can consume them
// without opening a second SSE connection
export function dispatchSSE(name: string, data: unknown) {
  window.dispatchEvent(new CustomEvent(`sse:${name}`, { detail: data }));
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [toasts, setToasts] = useState<AppNotification[]>([]);
  const esRef = useRef<EventSource | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const addNotification = useCallback((n: Omit<AppNotification, 'id' | 'timestamp' | 'read'>) => {
    const notif: AppNotification = {
      ...n,
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: new Date(),
      read: false,
    };
    setNotifications(prev => [notif, ...prev].slice(0, 50));
    setToasts(prev => [...prev, notif]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== notif.id));
    }, 5000);
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const dismiss = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  useEffect(() => {
    if (!user) return;

    const connect = () => {
      if (esRef.current) esRef.current.close();
      const es = new EventSource('/bot/api/events', { withCredentials: true });
      esRef.current = es;

      es.addEventListener('hello', (e: MessageEvent) => {
        try { dispatchSSE('hello', JSON.parse(e.data)); } catch {}
      });

      es.addEventListener('device_status', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          dispatchSSE('device_status', data);
          if (data.status === 'connected') {
            addNotification({
              type: 'device_connected',
              title: 'WhatsApp conectado',
              body: `Dispositivo${data.phone ? ` +${data.phone}` : ''} conectado com sucesso.`,
            });
          } else if (data.status === 'disconnected') {
            addNotification({
              type: 'device_disconnected',
              title: 'WhatsApp desconectado',
              body: 'Um dispositivo WhatsApp foi desconectado.',
            });
          }
        } catch {}
      });

      es.addEventListener('device_qr', (e: MessageEvent) => {
        try { dispatchSSE('device_qr', JSON.parse(e.data)); } catch {}
      });

      es.addEventListener('message', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          dispatchSSE('message', data);
          if (data.direction === 'in') {
            const sender = data.senderName || data.jid?.split('@')[0] || 'Contato';
            const body = data.body ? (data.body.length > 60 ? data.body.slice(0, 60) + '…' : data.body) : '[mídia]';
            addNotification({
              type: 'message',
              title: `💬 ${sender}`,
              body,
            });
          }
        } catch {}
      });

      es.onerror = () => {
        es.close();
        esRef.current = null;
        reconnectRef.current = setTimeout(connect, 5000);
      };
    };

    connect();

    return () => {
      esRef.current?.close();
      esRef.current = null;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
    };
  }, [user, addNotification]);

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <NotificationsContext.Provider value={{ notifications, toasts, unreadCount, markAllRead, dismiss, dismissToast }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be inside NotificationsProvider');
  return ctx;
}
