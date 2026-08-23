// ponytail: poll helper – stdlib only, capped 100, minimal
export type PipelineEvent = {
  id: string;
  stage: string;
  status: 'pending' | 'running' | 'complete' | 'error';
  message: string;
  ts: number;
  raw?: unknown;
};

export const MAX_EVENTS = 100;
export const SSE_URL = '/api/events';
export const BRIDGE_POLL_URL =
  (typeof process !== 'undefined' && (process as unknown as { env: Record<string, string> }).env?.NEXT_PUBLIC_BRIDGE_URL) ||
  'http://localhost:8787/events';

// capped helper – keeps newest 100
export function capped(prev: PipelineEvent[], next: PipelineEvent | PipelineEvent[]): PipelineEvent[] {
  const arr = Array.isArray(next) ? next : [next];
  const merged = [...prev, ...arr];
  return merged.length > MAX_EVENTS ? merged.slice(-MAX_EVENTS) : merged;
}

export function normalize(raw: unknown, fallback: string): PipelineEvent {
  if (typeof raw === 'object' && raw !== null) {
    const r = raw as Record<string, unknown>;
    return {
      id: String(r.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`),
      stage: String(r.stage ?? r.type ?? 'pipeline'),
      status: (r.status as PipelineEvent['status']) ?? 'running',
      message: String(r.message ?? r.msg ?? r.text ?? fallback),
      ts: Number(r.ts ?? r.timestamp ?? Date.now()),
      raw,
    };
  }
  return { id: `${Date.now()}`, stage: 'pipeline', status: 'running', message: fallback, ts: Date.now(), raw };
}

// poll once – tries bridge JSON, null if unavailable (caller falls back to mock/SSE)
export async function pollOnce(): Promise<PipelineEvent[] | null> {
  try {
    const res = await fetch(BRIDGE_POLL_URL, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(1500) as AbortSignal,
    });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) return null;
    const data = await res.json();
    const list: unknown[] = Array.isArray(data) ? data : Array.isArray((data as Record<string, unknown>).events) ? ((data as Record<string, unknown>).events as unknown[]) : [data];
    return list.map((x) => normalize(x, String(x)));
  } catch {
    return null;
  }
}

// interval poller – calls onEvent for each polled event
export function createPoller(onEvent: (e: PipelineEvent) => void, intervalMs = 2500): () => void {
  let timer: ReturnType<typeof setInterval> | null = null;
  const tick = async () => {
    const evts = await pollOnce();
    if (evts && evts.length) evts.forEach(onEvent);
  };
  tick();
  timer = setInterval(tick, intervalMs);
  return () => {
    if (timer) clearInterval(timer);
  };
}
