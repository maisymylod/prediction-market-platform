import { z } from 'zod';
import { confirmLink, rejectLink, suggestMatches, MatcherDisabledError } from '../../../src/server/matcher.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('suggest') }),
  z.object({ action: z.literal('confirm'), eventLinkId: z.coerce.number().int() }),
  z.object({ action: z.literal('reject'), eventLinkId: z.coerce.number().int() }),
]);

export async function POST(req: Request): Promise<Response> {
  let parsed;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch {
    return Response.json({ error: 'invalid request' }, { status: 400 });
  }

  try {
    if (parsed.action === 'suggest') {
      const created = await suggestMatches();
      return Response.json({ ok: true, created });
    }
    if (parsed.action === 'confirm') {
      await confirmLink(parsed.eventLinkId);
      return Response.json({ ok: true });
    }
    await rejectLink(parsed.eventLinkId);
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof MatcherDisabledError) {
      return Response.json({ error: err.message }, { status: 400 });
    }
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
