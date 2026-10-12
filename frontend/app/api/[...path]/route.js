// Proxies /api/* to the Express backend so the backend URL is set at runtime (BACKEND_URL)
export const dynamic = 'force-dynamic';

async function proxy(req, { params }) {
  const { path } = await params;
  const backend = process.env.BACKEND_URL || 'http://localhost:4000';
  const url = `${backend}/api/${path.join('/')}${new URL(req.url).search}`;
  const init = {
    method: req.method,
    headers: { 'content-type': 'application/json', authorization: req.headers.get('authorization') || '' },
  };
  if (req.method !== 'GET') init.body = await req.text();
  try {
    const res = await fetch(url, init);
    return new Response(await res.text(), { status: res.status, headers: { 'content-type': 'application/json' } });
  } catch {
    return Response.json({ error: 'Backend unavailable' }, { status: 502 });
  }
}

export { proxy as GET, proxy as POST };
