import { getState } from '@/lib/farm';

export const dynamic = 'force-dynamic';

const headers = { 'cache-control': 'no-store' };
const build = process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA || 'dev';

export async function GET(req) {
  try {
    const v = req.nextUrl.searchParams.get('v');
    const data = await getState();
    if (v !== null && Number(v) === data.v) {
      return Response.json({ same: true, v: data.v, now: Date.now(), build }, { headers });
    }
    return Response.json({ ...data, now: Date.now(), build }, { headers });
  } catch (e) {
    console.error(e);
    return Response.json({ error: 'Сървърна грешка' }, { status: 500, headers });
  }
}
