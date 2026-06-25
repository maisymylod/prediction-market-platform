import { SSE_EVENTS } from '@pmp/core';
import { broadcaster, type StreamEvent } from '../../../src/server/broadcaster.js';

// Must run on the Node.js runtime (persistent LISTEN socket + long-lived stream).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const enc = new TextEncoder();
const frame = (event: string, data: unknown) =>
  enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
const comment = (text: string) => enc.encode(`: ${text}\n\n`);

export async function GET(req: Request): Promise<Response> {
  await broadcaster.ensureStarted();

  let unsubscribe = () => {};
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const safeEnqueue = (chunk: Uint8Array) => {
        try {
          controller.enqueue(chunk);
        } catch {
          /* client gone; cleanup runs on abort */
        }
      };

      // 1) Always send a fresh full snapshot FIRST so a (re)connecting client
      //    never resumes from silently-stale state.
      try {
        const snap = await broadcaster.snapshot();
        safeEnqueue(frame(SSE_EVENTS.snapshot, snap));
      } catch {
        safeEnqueue(comment('snapshot-failed'));
      }

      // 2) Stream subsequent deltas.
      unsubscribe = broadcaster.subscribe((ev: StreamEvent) => {
        const name = ev.event === 'price' ? SSE_EVENTS.price : SSE_EVENTS.feedStatus;
        safeEnqueue(frame(name, ev.data));
      });

      // 3) Heartbeat keeps proxies from idling the connection closed.
      heartbeat = setInterval(() => safeEnqueue(comment('ping')), 15_000);
    },
    cancel() {
      unsubscribe();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  // Clean up if the client disconnects.
  req.signal.addEventListener('abort', () => {
    unsubscribe();
    if (heartbeat) clearInterval(heartbeat);
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
