import { getState } from '@/lib/farm';

export const dynamic = 'force-dynamic';

const headers = { 'cache-control': 'no-store' };

export async function GET(req) {
  try {
    const v = req.nextUrl.searchParams.get('v');
    const data = await getState();
    if (v !== null && Number(v) === data.v) {
      return Response.json({ same: true, v: data.v, now: Date.now() }, { headers });
    }
    return Response.json({ ...data, now: Date.now() }, { headers });
  } catch (e) {
    console.error(e);
    return Response.json({ error: 'Сървърна грешка' }, { status: 500, headers });
  }
}
