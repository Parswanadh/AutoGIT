'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { capped, createPoller, normalize, SSE_URL, type PipelineEvent } from '@/lib/bridge';

// ponytail: virtualized feed – fixed item height windowing, capped 100
const ITEM_H = 28;
const VIEW_H = 360;
const VISIBLE = Math.ceil(VIEW_H / ITEM_H) + 4;

function stageColor(stage: string) {
  if (stage.includes('research')) return 'text-cyan-400';
  if (stage.includes('debate')) return 'text-purple-400';
  if (stage.includes('generate')) return 'text-emerald-400';
  if (stage.includes('validate')) return 'text-yellow-400';
  if (stage.includes('publish')) return 'text-pink-400';
  return 'text-slate-300';
}

function statusDot(s: PipelineEvent['status']) {
  if (s === 'complete') return 'bg-emerald-500';
  if (s === 'error') return 'bg-red-500';
  if (s === 'running') return 'bg-cyan-500 animate-pulse';
  return 'bg-slate-500';
}

export function EventFeed({ events }: { events: PipelineEvent[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const total = events.length;
  const start = Math.max(0, Math.min(total - VISIBLE, Math.floor(scrollTop / ITEM_H)));
  const end = total <= VISIBLE ? total : Math.min(total, start + VISIBLE);
  const slice = total <= VISIBLE ? events : events.slice(start, end);
  const padTop = total <= VISIBLE ? 0 : start * ITEM_H;
  const padBottom = total <= VISIBLE ? 0 : (total - end) * ITEM_H;
  const isNearBottom = useRef(true);

  const onScroll = useCallback(() => {
    if (!ref.current) return;
    const el = ref.current;
    setScrollTop(el.scrollTop);
    isNearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  }, []);

  // auto-scroll when new events and user near bottom
  useEffect(() => {
    if (!ref.current) return;
    if (isNearBottom.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
      setScrollTop(ref.current.scrollTop);
    }
  }, [events]);

  if (total === 0) {
    return <div className="h-[360px] flex items-center justify-center text-slate-500 font-mono text-sm">Waiting for pipeline events…</div>;
  }

  return (
    <div
      ref={ref}
      onScroll={onScroll}
      className="overflow-y-auto rounded-lg bg-[rgba(0,0,0,0.6)] border border-slate-800 custom-scrollbar"
      style={{ height: VIEW_H }}
    >
      <div style={{ height: total * ITEM_H, position: 'relative' }}>
        <div style={{ transform: `translateY(${padTop}px)` }}>
          {slice.map((ev) => (
            <div
              key={ev.id}
              className="flex items-center gap-3 px-3 font-mono text-xs border-b border-slate-800/50"
              style={{ height: ITEM_H }}
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${statusDot(ev.status)}`} />
              <span className={`shrink-0 uppercase tracking-wider text-[10px] ${stageColor(ev.stage)}`}>{ev.stage}</span>
              <span className="truncate text-slate-300">{ev.message}</span>
              <span className="ml-auto shrink-0 text-[10px] text-slate-500">{new Date(ev.ts).toLocaleTimeString()}</span>
            </div>
          ))}
          {padBottom > 0 && <div style={{ height: padBottom }} />}
        </div>
      </div>
    </div>
  );
}

export default function LivePipeline() {
  const [events, setEvents] = useState<PipelineEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [mode, setMode] = useState<'sse' | 'poll' | 'mock'>('sse');
  const esRef = useRef<EventSource | null>(null);
  const pollStop = useRef<(() => void) | null>(null);
  const mockTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const push = useCallback((e: PipelineEvent) => {
    setEvents((prev: PipelineEvent[]) => capped(prev, e));
  }, []);

  const startMock = useCallback(() => {
    if (mockTimer.current) return;
    const mocks: PipelineEvent[] = [
      { id: 'lm1', stage: 'research', status: 'running', message: 'Researching arXiv papers...', ts: Date.now() },
      { id: 'lm2', stage: 'debate', status: 'running', message: 'Multi-agent debate: drafting architecture', ts: Date.now() },
      { id: 'lm3', stage: 'generate', status: 'running', message: 'Generating code · main.py', ts: Date.now() },
    ];
    let i = 0;
    mockTimer.current = setInterval(() => {
      push({ ...mocks[i % mocks.length], id: `mock-${Date.now()}-${i}`, ts: Date.now() });
      i += 1;
    }, 1800);
    setMode('mock');
  }, [push]);

  useEffect(() => {
    let closed = false;

    // try SSE first
    try {
      const es = new EventSource(SSE_URL);
      esRef.current = es;

      es.onopen = () => {
        if (closed) return;
        setConnected(true);
        setMode('sse');
        if (pollStop.current) { pollStop.current(); pollStop.current = null; }
        if (mockTimer.current) { clearInterval(mockTimer.current); mockTimer.current = null; }
      };

      es.onmessage = (ev) => {
        if (closed) return;
        try {
          const data = JSON.parse(ev.data);
          push(normalize(data, ev.data));
        } catch {
          const txt = ev.data?.startsWith(':') ? null : ev.data;
          if (txt) push(normalize(txt, txt));
        }
      };

      es.onerror = () => {
        if (closed) return;
        setConnected(false);
        es.close();
        esRef.current = null;
        // fallback to poll helper
        if (!pollStop.current) {
          setMode('poll');
          pollStop.current = createPoller(push, 2500);
          // if poll yields nothing for 4s, start local mock
          setTimeout(() => {
            if (!closed && events.length === 0) startMock();
          }, 4000);
          // also start mock as last resort after 6s if still no events
          setTimeout(() => {
            if (!closed) {
              // check via closure – use functional check
              setEvents((prev: PipelineEvent[]) => {
                if (prev.length === 0) startMock();
                return prev;
              });
            }
          }, 6000);
        }
      };
    } catch {
      setConnected(false);
      setMode('poll');
      pollStop.current = createPoller(push, 2500);
      setTimeout(() => startMock(), 3500);
    }

    return () => {
      closed = true;
      esRef.current?.close();
      if (pollStop.current) pollStop.current();
      if (mockTimer.current) clearInterval(mockTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [push, startMock]);

  const clear = () => setEvents([]);

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className={`w-2.5 h-2.5 rounded-full ${connected ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]' : 'bg-amber-500'} `} />
          <span className="text-sm font-mono text-slate-300">
            {connected ? 'LIVE' : mode === 'poll' ? 'POLLING' : mode === 'mock' ? 'MOCK' : 'CONNECTING'}
          </span>
          <span className="text-xs text-slate-500">· {events.length}/100 events</span>
          <span className="text-xs text-slate-600 hidden sm:inline">· SSE: {SSE_URL}</span>
        </div>
        <button onClick={clear} className="text-xs px-3 py-1 rounded bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700">
          Clear
        </button>
      </div>

      <EventFeed events={events} />

      <div className="mt-3 flex items-center justify-between text-xs text-slate-500 font-mono">
        <span>
          {connected ? 'Proxying localhost:8787/events' : 'Fallback active – bridge unavailable, showing mock/poll'}
        </span>
        <span className="text-slate-600">{mode.toUpperCase()}</span>
      </div>
    </div>
  );
}
