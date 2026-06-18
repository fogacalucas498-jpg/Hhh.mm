import { useEffect, useRef, useCallback } from 'react';

type SSEHandler = (event: string, data: unknown) => void;

export function useSSE(enabled: boolean, onEvent: SSEHandler) {
  const esRef = useRef<EventSource | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const connect = useCallback(() => {
    if (esRef.current) esRef.current.close();
    const es = new EventSource('/bot/api/events', { withCredentials: true });
    esRef.current = es;

    const handle = (name: string) => (e: MessageEvent) => {
      try {
        onEventRef.current(name, JSON.parse(e.data));
      } catch {}
    };

    ['hello', 'device_status', 'device_qr', 'message'].forEach(ev => {
      es.addEventListener(ev, handle(ev));
    });

    es.onerror = () => {
      es.close();
      esRef.current = null;
      // Reconnect after 5s
      setTimeout(connect, 5000);
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    connect();
    return () => { esRef.current?.close(); esRef.current = null; };
  }, [enabled, connect]);
}
