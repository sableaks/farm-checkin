import { adminAction, checkAdmin, FarmError } from '@/lib/farm';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    checkAdmin(req.headers.get('x-admin-key'));
    const body = await req.json();
    const data = await adminAction(body);
    return Response.json({ ...data, now: Date.now() });
  } catch (e) {
    if (e instanceof FarmError) return Response.json({ error: e.message }, { status: e.status });
    console.error(e);
    return Response.json({ error: 'Сървърна грешка' }, { status: 500 });
  }
}
