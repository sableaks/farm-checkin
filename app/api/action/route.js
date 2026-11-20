import { workerAction, FarmError } from '@/lib/farm';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    const { workerId, action } = await req.json();
    const data = await workerAction(String(workerId || ''), String(action || ''));
    return Response.json({ ...data, now: Date.now() });
  } catch (e) {
    if (e instanceof FarmError) return Response.json({ error: e.message }, { status: e.status });
    console.error(e);
    return Response.json({ error: 'Сървърна грешка' }, { status: 500 });
  }
}
