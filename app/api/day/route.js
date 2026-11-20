import { getDayEvents } from '@/lib/farm';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const w = req.nextUrl.searchParams.get('w') || '';
  const d = req.nextUrl.searchParams.get('d') || '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return Response.json({ events: [] });
  const events = await getDayEvents(w, d);
  return Response.json({ events }, { headers: { 'cache-control': 'no-store' } });
}
