import { useEffect, useRef } from 'react';

type SSEHandler = (event: string, data: unknown) => void;

// useSSE listens to window events dispatched by NotificationsProvider's single SSE connection.
// This avoids opening multiple EventSource connections.
export function useSSE(enabled: boolean, onEvent: SSEHandler) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!enabled) return;

    const events = ['hello', 'device_status', 'device_qr', 'message'];
    const handlers: Array<{ name: string; fn: EventListener }> = events.map(name => {
      const fn = (e: Event) => {
        onEventRef.current(name, (e as CustomEvent).detail);
      };
      window.addEventListener(`sse:${name}`, fn);
      return { name, fn };
    });

    return () => {
      handlers.forEach(({ name, fn }) => window.removeEventListener(`sse:${name}`, fn));
    };
  }, [enabled]);
}
