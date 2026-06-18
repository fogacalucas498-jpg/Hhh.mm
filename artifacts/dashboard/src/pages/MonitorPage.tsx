import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, Device } from '@/lib/api';
import { useSSE } from '@/hooks/useSSE';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts';
import {
  Activity, Smartphone, MessageSquare, ArrowDownLeft, ArrowUpRight,
  Wifi, WifiOff, Loader2, RefreshCw, Trash2, Circle, TrendingUp
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LiveMessage {
  id: string;
  deviceId: number | null;
  deviceName?: string;
  contactJid: string;
  senderName?: string;
  direction: 'in' | 'out';
  body: string | null;
  msgType: string;
  ts: Date;
}

interface MinuteBucket {
  label: string;   // "14:32"
  minuteKey: number; // epoch floored to minute
  in: number;
  out: number;
  total: number;
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; badgeCls: string; dotCls: string; icon: React.ElementType }> = {
  connected:    { label: 'Conectado',    badgeCls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',    dotCls: 'bg-green-500 animate-pulse', icon: Wifi },
  connecting:   { label: 'Conectando…',  badgeCls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400', dotCls: 'bg-yellow-400',              icon: Loader2 },
  qr:           { label: 'Aguard. QR',   badgeCls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',        dotCls: 'bg-blue-500 animate-pulse',  icon: Smartphone },
  disconnected: { label: 'Desconectado', badgeCls: 'bg-muted text-muted-foreground',                                           dotCls: 'bg-muted-foreground/40',     icon: WifiOff },
};

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.disconnected;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.badgeCls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dotCls}`} />
      {cfg.label}
    </span>
  );
}

// ─── Device card ──────────────────────────────────────────────────────────────

function DeviceCard({ device, msgCount }: { device: Device; msgCount: number }) {
  const cfg = STATUS_CFG[device.status] ?? STATUS_CFG.disconnected;
  const Icon = cfg.icon;
  const isConnected = device.status === 'connected';

  return (
    <div className={`bg-card border rounded-xl p-4 flex flex-col gap-3 shadow-sm transition-all ${
      isConnected ? 'border-green-500/30 shadow-green-500/5' : 'border-border'
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
            isConnected ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' : 'bg-muted text-muted-foreground'
          }`}>
            <Icon className={`w-4 h-4 ${device.status === 'connecting' ? 'animate-spin' : ''}`} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{device.name}</p>
            <p className="text-xs text-muted-foreground">{device.phone ? `+${device.phone}` : 'Sem número'}</p>
          </div>
        </div>
        <StatusBadge status={device.status} />
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <MessageSquare className="w-3.5 h-3.5" />
          {msgCount} msgs esta sessão
        </span>
        {isConnected && (
          <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
            ao vivo
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Message row ──────────────────────────────────────────────────────────────

function MsgRow({ msg }: { msg: LiveMessage }) {
  const phone = msg.contactJid.split('@')[0];
  const label = msg.senderName ?? phone;
  const isIn = msg.direction === 'in';
  const time = msg.ts.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div className="flex items-start gap-3 px-4 py-2.5 border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
      <div className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
        isIn ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
              : 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
      }`}>
        {isIn ? <ArrowDownLeft className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-xs font-semibold text-foreground truncate max-w-[120px]" title={label}>{label}</span>
          {msg.deviceName && (
            <span className="text-[10px] text-muted-foreground truncate">via {msg.deviceName}</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 break-words line-clamp-2">
          {msg.body ?? <span className="italic">[{msg.msgType}]</span>}
        </p>
      </div>

      <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5 tabular-nums">{time}</span>
    </div>
  );
}

// ─── Custom tooltip for chart ─────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-xl shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {payload.map(p => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full inline-block" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-semibold text-foreground tabular-nums">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const WINDOW_MINUTES = 15;

function floorToMinute(d: Date): number {
  return Math.floor(d.getTime() / 60_000) * 60_000;
}

function buildBuckets(timestamps: Array<{ ts: Date; direction: 'in' | 'out' }>): MinuteBucket[] {
  const now = Date.now();
  const buckets: MinuteBucket[] = [];

  for (let i = WINDOW_MINUTES - 1; i >= 0; i--) {
    const minuteKey = Math.floor((now - i * 60_000) / 60_000) * 60_000;
    const d = new Date(minuteKey);
    buckets.push({
      label: d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      minuteKey,
      in: 0,
      out: 0,
      total: 0,
    });
  }

  for (const { ts, direction } of timestamps) {
    const key = floorToMinute(ts);
    const bucket = buckets.find(b => b.minuteKey === key);
    if (bucket) {
      if (direction === 'in') bucket.in++;
      else bucket.out++;
      bucket.total++;
    }
  }

  return buckets;
}

// ─── Sparkline chart ──────────────────────────────────────────────────────────

function VolumeChart({ buckets }: { buckets: MinuteBucket[] }) {
  const total = buckets.reduce((s, b) => s + b.total, 0);
  const peak = Math.max(...buckets.map(b => b.total), 1);

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm p-5">
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Volume por minuto</h2>
          <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
            últimos {WINDOW_MINUTES} min
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>Total: <span className="font-semibold text-foreground tabular-nums">{total}</span></span>
          <span>Pico: <span className="font-semibold text-foreground tabular-nums">{peak} msg/min</span></span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={160}>
        <AreaChart data={buckets} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="gradIn" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradOut" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#22c55e" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<ChartTooltip />} />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            formatter={(value: string) => (
              <span style={{ color: 'hsl(var(--muted-foreground))' }}>{value}</span>
            )}
          />
          <Area
            type="monotone"
            dataKey="in"
            name="Recebidas"
            stroke="#3b82f6"
            strokeWidth={2}
            fill="url(#gradIn)"
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="out"
            name="Enviadas"
            stroke="#22c55e"
            strokeWidth={2}
            fill="url(#gradOut)"
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const MAX_MSGS = 100;

export default function MonitorPage() {
  const queryClient = useQueryClient();

  // Load devices from API, refresh every 30s
  const { data: devicesData, isLoading } = useQuery({
    queryKey: ['devices'],
    queryFn: () => api.get<{ devices: Device[] }>('/api/devices'),
    refetchInterval: 30_000,
  });

  // Local device map so SSE can patch status without a full refetch
  const [deviceMap, setDeviceMap] = useState<Record<number, Device>>({});

  useEffect(() => {
    const list = devicesData?.devices ?? [];
    setDeviceMap(prev => {
      const next: Record<number, Device> = {};
      for (const d of list) {
        next[d.id] = prev[d.id] ? { ...prev[d.id], ...d } : d;
      }
      return next;
    });
  }, [devicesData]);

  // Live message feed
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const [sessionCounts, setSessionCounts] = useState<Record<number, number>>({});
  const [autoScroll, setAutoScroll] = useState(true);
  const [sseConnected, setSseConnected] = useState(false);

  // Rolling timestamp buffer for the chart (last WINDOW_MINUTES + 1 minute for safety)
  const tsBufferRef = useRef<Array<{ ts: Date; direction: 'in' | 'out' }>>([]);

  // Chart buckets — recomputed every 10 seconds by a ticker
  const [buckets, setBuckets] = useState<MinuteBucket[]>(() => buildBuckets([]));

  // Rebuild buckets and prune old timestamps every 10s
  useEffect(() => {
    const tick = () => {
      const cutoff = Date.now() - (WINDOW_MINUTES + 1) * 60_000;
      tsBufferRef.current = tsBufferRef.current.filter(e => e.ts.getTime() > cutoff);
      setBuckets(buildBuckets(tsBufferRef.current));
    };
    tick();
    const id = setInterval(tick, 10_000);
    return () => clearInterval(id);
  }, []);

  const pushMessage = useCallback((msg: LiveMessage) => {
    setMessages(prev => [msg, ...prev].slice(0, MAX_MSGS));
    if (msg.deviceId != null) {
      setSessionCounts(prev => ({ ...prev, [msg.deviceId!]: (prev[msg.deviceId!] ?? 0) + 1 }));
    }
    // Add to timestamp buffer and immediately refresh chart
    tsBufferRef.current.push({ ts: msg.ts, direction: msg.direction });
    setBuckets(buildBuckets(tsBufferRef.current));
  }, []);

  // SSE handler
  useSSE(true, useCallback((event: string, data: unknown) => {
    if (event === 'hello') setSseConnected(true);

    if (event === 'device_status') {
      const d = data as { id: number; status: string; phone?: string | null };
      setDeviceMap(prev => {
        if (!prev[d.id]) return prev;
        return { ...prev, [d.id]: { ...prev[d.id], status: d.status, phone: d.phone ?? prev[d.id].phone } };
      });
      queryClient.invalidateQueries({ queryKey: ['devices'] });
    }

    if (event === 'message') {
      const m = data as {
        id?: number; device_id?: number | null; deviceName?: string;
        jid?: string; senderName?: string; direction?: 'in' | 'out';
        body?: string | null; msgType?: string; msg_type?: string;
      };
      pushMessage({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        deviceId: m.device_id ?? null,
        deviceName: m.deviceName,
        contactJid: m.jid ?? 'unknown',
        senderName: m.senderName,
        direction: m.direction ?? 'in',
        body: m.body ?? null,
        msgType: m.msgType ?? m.msg_type ?? 'unknown',
        ts: new Date(),
      });
    }
  }, [pushMessage, queryClient]));

  useEffect(() => { setSseConnected(true); }, []);

  const devices = useMemo(() => Object.values(deviceMap), [deviceMap]);
  const connected = useMemo(() => devices.filter(d => d.status === 'connected').length, [devices]);
  const msgsIn = useMemo(() => messages.filter(m => m.direction === 'in').length, [messages]);
  const msgsOut = useMemo(() => messages.filter(m => m.direction === 'out').length, [messages]);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            Monitor em Tempo Real
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Status dos dispositivos e fluxo de mensagens ao vivo</p>
        </div>

        <div className={`flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full border ${
          sseConnected
            ? 'bg-green-50 border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400'
            : 'bg-muted border-border text-muted-foreground'
        }`}>
          <Circle className={`w-2 h-2 fill-current ${sseConnected ? 'animate-pulse' : ''}`} />
          {sseConnected ? 'Conectado ao servidor' : 'Aguardando conexão…'}
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Dispositivos', value: `${devices.length}`, sub: 'total',       icon: Smartphone,    color: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400' },
          { label: 'Conectados',   value: `${connected}`,      sub: 'agora',        icon: Wifi,          color: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' },
          { label: 'Recebidas',    value: `${msgsIn}`,         sub: 'esta sessão',  icon: ArrowDownLeft, color: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' },
          { label: 'Enviadas',     value: `${msgsOut}`,        sub: 'esta sessão',  icon: ArrowUpRight,  color: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' },
        ].map(({ label, value, sub, icon: Icon, color }) => (
          <div key={label} className="bg-card border border-border rounded-xl p-4 flex items-center gap-3 shadow-sm">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
              <Icon className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xl font-bold text-foreground tabular-nums">{value}</p>
              <p className="text-xs text-muted-foreground">{label} <span className="text-muted-foreground/60">· {sub}</span></p>
            </div>
          </div>
        ))}
      </div>

      {/* Volume chart */}
      <VolumeChart buckets={buckets} />

      <div className="grid lg:grid-cols-5 gap-6 items-start">

        {/* Devices panel */}
        <div className="lg:col-span-2 space-y-3">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-muted-foreground" />
            Dispositivos WhatsApp
          </h2>

          {isLoading && (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {!isLoading && devices.length === 0 && (
            <div className="bg-card border border-border rounded-xl py-10 text-center text-sm text-muted-foreground">
              Nenhum dispositivo cadastrado.
            </div>
          )}

          <div className="space-y-2">
            {devices.map(d => (
              <DeviceCard key={d.id} device={d} msgCount={sessionCounts[d.id] ?? 0} />
            ))}
          </div>
        </div>

        {/* Live feed */}
        <div className="lg:col-span-3 bg-card border border-border rounded-xl shadow-sm flex flex-col" style={{ minHeight: 480 }}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-muted-foreground" />
              Mensagens ao vivo
              {messages.length > 0 && (
                <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                  {messages.length}/{MAX_MSGS}
                </span>
              )}
            </h2>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoScroll}
                  onChange={e => setAutoScroll(e.target.checked)}
                  className="w-3 h-3 accent-primary"
                />
                Auto-scroll
              </label>
              {messages.length > 0 && (
                <button
                  onClick={() => { setMessages([]); tsBufferRef.current = []; setBuckets(buildBuckets([])); }}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors px-2 py-1 rounded-lg hover:bg-muted"
                  title="Limpar feed e gráfico"
                >
                  <Trash2 className="w-3 h-3" />
                  Limpar
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-thin" style={{ maxHeight: 520 }}>
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-16 text-center">
                <RefreshCw className="w-8 h-8 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">Aguardando mensagens…</p>
                <p className="text-xs text-muted-foreground/60 mt-1">As mensagens aparecerão aqui em tempo real</p>
              </div>
            ) : (
              messages.map(msg => <MsgRow key={msg.id} msg={msg} />)
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
