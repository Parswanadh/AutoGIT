export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BRIDGE_URL =
  (typeof process !== 'undefined' && (process as unknown as { env: Record<string, string> }).env?.BRIDGE_URL) ||
  'http://localhost:8787/events';

// ponytail: proxy SSE, fallback mock if bridge down – minimal, no extra deps
const MOCKS = [
  { id: 'm1', stage: 'research', status: 'complete', message: 'Researching arXiv papers... found 12 relevant' },
  { id: 'm2', stage: 'research', status: 'complete', message: 'Analyzed 3 GitHub repositories' },
  { id: 'm3', stage: 'debate', status: 'running', message: 'Multi-agent debate initiated (ML Researcher · Systems Engineer · Applied Scientist)' },
  { id: 'm4', stage: 'debate', status: 'complete', message: 'Consensus reached (3 rounds)' },
  { id: 'm5', stage: 'generate', status: 'running', message: 'Generating code... main.py (127 lines)' },
  { id: 'm6', stage: 'generate', status: 'complete', message: 'Generated api.py (89 lines) · models.py (45 lines)' },
  { id: 'm7', stage: 'validate', status: 'running', message: 'Running validation: syntax · types · security' },
  { id: 'm8', stage: 'validate', status: 'complete', message: 'Security scan: 0 vulnerabilities' },
  { id: 'm9', stage: 'publish', status: 'running', message: 'Publishing to GitHub...' },
  { id: 'm10', stage: 'publish', status: 'complete', message: 'Repository created: auto-git-demo · Pipeline complete (3m 47s)' },
];

function sse(data: unknown) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function mockStream() {
  const enc = new TextEncoder();
  let idx = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const tick = () => {
        if (idx < MOCKS.length) {
          controller.enqueue(enc.encode(sse({ ...MOCKS[idx], ts: Date.now() })));
          idx += 1;
        } else {
          // heartbeat comment to keep SSE alive
          controller.enqueue(enc.encode(`: keepalive ${Date.now()}\n\n`));
          // loop mocks for demo continuity
          if (idx >= MOCKS.length + 5) idx = 0;
          else idx += 1;
        }
      };
      tick();
      timer = setInterval(tick, 900);
    },
    cancel() {
      if (timer) clearInterval(timer);
    },
  });
}

export async function GET() {
  // try proxy bridge
  try {
    const res = await fetch(BRIDGE_URL, {
      headers: { Accept: 'text/event-stream' },
      // @ts-ignore AbortSignal.timeout available in node 18+
      signal: AbortSignal.timeout(1500),
      cache: 'no-store',
    });
    if (res.ok && res.body) {
      return new Response(res.body, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        },
      });
    }
  } catch {
    // fall through to mock
  }

  const stream = mockStream();
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
