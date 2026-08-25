export function GET() {
  return Response.json(
    {
      status: 'ok',
      service: 'pic-match',
      commitSha:
        process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? null,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
