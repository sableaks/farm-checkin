import { checkAdmin, getMonthEvents, FarmError } from '@/lib/farm';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    checkAdmin(req.headers.get('x-admin-key'));
    const { id, ym } = await req.json();
    if (!/^\d{4}-\d{2}$/.test(String(ym))) throw new FarmError('Невалиден месец');
    const events = await getMonthEvents(String(id || ''), ym);
    return Response.json({ events }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    if (e instanceof FarmError) return Response.json({ error: e.message }, { status: e.status });
    console.error(e);
    return Response.json({ error: 'Сървърна грешка' }, { status: 500 });
  }
}
