import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, Device } from '@/lib/api';

interface ServerStats {
  uptime: number;
  uptimeFormatted: string;
  memory: { rssMb: number; heapUsedMb: number; heapTotalMb: number; limitMb: number };
  devices: { total: number; connected: number };
  messages: { total: number; last24h: number };
  process: { pid: number; nodeVersion: string; platform: string };
}
import { useSSE } from '@/hooks/useSSE';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts';
import {
  Activity, Smartphone, MessageSquare, ArrowDownLeft, ArrowUpRight,
  Wifi, WifiOff, Loader2, RefreshCw, Trash2, Circle, TrendingUp,
  Filter, Download, Volume2, VolumeX, Clock, Cpu, Server, Database
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

// ─── Server stats bar ─────────────────────────────────────────────────────────

function MemBar({ used, total, limit }: { used: number; total: number; limit: number }) {
  const pct = Math.min((used / limit) * 100, 100);
  const color = pct > 85 ? 'bg-red-500' : pct > 65 ? 'bg-yellow-500' : 'bg-emerald-500';
  return (
    <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function ServerStatsBar({ stats, loading }: { stats: ServerStats | undefined; loading: boolean }) {
  if (loading && !stats) {
    return (
      <div className="bg-card border border-border rounded-xl px-5 py-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="w-3 h-3 animate-spin" />
        Carregando métricas do servidor…
      </div>
    );
  }
  if (!stats) return null;

  const memPct = Math.round((stats.memory.rssMb / stats.memory.limitMb) * 100);

  return (
    <div className="bg-card border border-border rounded-xl px-5 py-3 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <Server className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-semibold text-foreground">Servidor</span>
        <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full ml-1">
          PID {stats.process.pid} · {stats.process.nodeVersion} · {stats.process.platform}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3">
        {/* Uptime */}
        <div className="flex items-start gap-2">
          <Clock className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-semibold text-foreground tabular-nums">{stats.uptimeFormatted}</p>
            <p className="text-[10px] text-muted-foreground">uptime</p>
          </div>
        </div>

        {/* Memory */}
        <div className="flex items-start gap-2 col-span-1">
          <Cpu className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
          <div className="w-full">
            <div className="flex items-baseline justify-between">
              <p className="text-xs font-semibold text-foreground tabular-nums">
                {stats.memory.rssMb} MB
              </p>
              <p className="text-[10px] text-muted-foreground">{memPct}% de {stats.memory.limitMb} MB</p>
            </div>
            <MemBar used={stats.memory.rssMb} total={stats.memory.heapTotalMb} limit={stats.memory.limitMb} />
            <p className="text-[10px] text-muted-foreground mt-0.5">heap {stats.memory.heapUsedMb}/{stats.memory.heapTotalMb} MB</p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex items-start gap-2">
          <Database className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-semibold text-foreground tabular-nums">{stats.messages.total.toLocaleString('pt-BR')}</p>
            <p className="text-[10px] text-muted-foreground">
              msgs totais · <span className="text-foreground font-medium">{stats.messages.last24h}</span> últimas 24h
            </p>
          </div>
        </div>

        {/* Devices */}
        <div className="flex items-start gap-2">
          <Wifi className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-semibold text-foreground tabular-nums">
              {stats.devices.connected}/{stats.devices.total}
            </p>
            <p className="text-[10px] text-muted-foreground">dispositivos conectados</p>
          </div>
        </div>
      </div>
    </div>
  );
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

  // Server stats, refresh every 15s
  const { data: serverStats, isLoading: statsLoading } = useQuery({
    queryKey: ['server-stats'],
    queryFn: () => api.get<ServerStats>('/api/stats'),
    refetchInterval: 15_000,
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
  const [filterDeviceId, setFilterDeviceId] = useState<number | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const soundEnabledRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const playBeep = useCallback((direction: 'in' | 'out') => {
    try {
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new AudioContext();
      }
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      // Incoming: higher pitch; outgoing: lower, softer
      osc.frequency.value = direction === 'in' ? 880 : 660;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.18);
    } catch {}
  }, []);

  // Keep ref in sync so pushMessage always reads the latest value
  useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);

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
    // Sound alert
    if (soundEnabledRef.current) playBeep(msg.direction);
  }, [playBeep]);

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

  // Filtered feed — null = show all
  const filteredMessages = useMemo(
    () => filterDeviceId === null ? messages : messages.filter(m => m.deviceId === filterDeviceId),
    [messages, filterDeviceId]
  );

  // Devices that have produced at least one message this session (for filter pills)
  const activeDevices = useMemo(() => {
    const seen = new Set(messages.map(m => m.deviceId).filter(Boolean));
    return devices.filter(d => seen.has(d.id));
  }, [messages, devices]);

  // CSV export — depends on filteredMessages so defined after it
  const exportCSV = useCallback(() => {
    const rows = filteredMessages.slice().reverse(); // oldest first
    const getDeviceName = (id: number | null) => (id != null ? deviceMap[id]?.name ?? `#${id}` : '');
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const header = ['Horário', 'Direção', 'Contato', 'Número', 'Mensagem', 'Tipo', 'Dispositivo'];
    const lines = rows.map(m => [
      escape(m.ts.toLocaleString('pt-BR')),
      escape(m.direction === 'in' ? 'Recebida' : 'Enviada'),
      escape(m.senderName ?? ''),
      escape(m.contactJid.split('@')[0]),
      escape(m.body ?? ''),
      escape(m.msgType),
      escape(getDeviceName(m.deviceId)),
    ].join(','));
    const csv = [header.join(','), ...lines].join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const ts = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
    const suffix = filterDeviceId != null ? `_${deviceMap[filterDeviceId]?.name ?? filterDeviceId}` : '';
    a.download = `monitor${suffix}_${ts}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredMessages, deviceMap, filterDeviceId]);

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

      {/* Server stats */}
      <ServerStatsBar stats={serverStats} loading={statsLoading} />

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
          {/* Feed header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-muted-foreground" />
              Mensagens ao vivo
              {messages.length > 0 && (
                <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                  {filteredMessages.length}/{MAX_MSGS}
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
              <button
                onClick={() => setSoundEnabled(v => {
                  const next = !v;
                  // Resume AudioContext on first user gesture (browser policy)
                  if (next && audioCtxRef.current?.state === 'suspended') {
                    audioCtxRef.current.resume().catch(() => {});
                  }
                  return next;
                })}
                className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors ${
                  soundEnabled
                    ? 'text-primary bg-primary/10 hover:bg-primary/20'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
                title={soundEnabled ? 'Desativar alerta sonoro' : 'Ativar alerta sonoro'}
              >
                {soundEnabled ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
                Som
              </button>
              {filteredMessages.length > 0 && (
                <button
                  onClick={exportCSV}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors px-2 py-1 rounded-lg hover:bg-muted"
                  title={filterDeviceId != null ? `Exportar mensagens de ${deviceMap[filterDeviceId]?.name}` : 'Exportar todas as mensagens'}
                >
                  <Download className="w-3 h-3" />
                  CSV
                </button>
              )}
              {messages.length > 0 && (
                <button
                  onClick={() => { setMessages([]); setFilterDeviceId(null); tsBufferRef.current = []; setBuckets(buildBuckets([])); }}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors px-2 py-1 rounded-lg hover:bg-muted"
                  title="Limpar feed e gráfico"
                >
                  <Trash2 className="w-3 h-3" />
                  Limpar
                </button>
              )}
            </div>
          </div>

          {/* Device filter pills */}
          {activeDevices.length > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 border-b border-border/60 overflow-x-auto scrollbar-thin shrink-0">
              <Filter className="w-3 h-3 text-muted-foreground shrink-0" />
              <button
                onClick={() => setFilterDeviceId(null)}
                className={`shrink-0 text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  filterDeviceId === null
                    ? 'bg-primary text-primary-foreground border-primary font-medium'
                    : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                }`}
              >
                Todos
              </button>
              {activeDevices.map(d => (
                <button
                  key={d.id}
                  onClick={() => setFilterDeviceId(prev => prev === d.id ? null : d.id)}
                  className={`shrink-0 flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    filterDeviceId === d.id
                      ? 'bg-primary text-primary-foreground border-primary font-medium'
                      : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                  }`}
                >
                  {d.status === 'connected' && (
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
                  )}
                  {d.name}
                  <span className="tabular-nums opacity-70">
                    ({sessionCounts[d.id] ?? 0})
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Feed body */}
          <div className="flex-1 overflow-y-auto scrollbar-thin" style={{ maxHeight: 520 }}>
            {filteredMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-16 text-center">
                <RefreshCw className="w-8 h-8 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">
                  {messages.length === 0 ? 'Aguardando mensagens…' : 'Nenhuma mensagem deste dispositivo ainda.'}
                </p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  {messages.length === 0 ? 'As mensagens aparecerão aqui em tempo real' : 'Selecione "Todos" para ver o feed completo.'}
                </p>
              </div>
            ) : (
              filteredMessages.map(msg => <MsgRow key={msg.id} msg={msg} />)
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
