// app/api/version/route.ts
// S3.1 — which build is live. The client compares it with the build it is
// running; an installed PWA resumed after a deploy runs the OLD bundle
// until the page reloads (field case 2026-10-12: typed "Lioness" on the
// phone ran the pre-S3.0 search on a production that answered correctly
// to a fresh browser). One env read, no DB, never cached.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return Response.json(
    { build: process.env.NEXT_PUBLIC_BUILD_ID ?? null },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
