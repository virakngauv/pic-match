import arcjet, { shield } from '@arcjet/next'

const arcjetKey = process.env.ARCJET_KEY
const aj = arcjetKey
  ? arcjet({
      key: arcjetKey,
      rules: [shield({ mode: 'LIVE' })],
    })
  : null

export async function POST(request: Request) {
  if (!aj) {
    return Response.json({
      message: 'Hello from the Arcjet adapter!',
      protected: false,
      detail: 'Demo mode: add ARCJET_KEY to enable a live Shield decision.',
    })
  }

  const decision = await aj.protect(request)

  if (decision.isDenied()) {
    return Response.json(
      {
        message: 'Arcjet denied this request.',
        protected: true,
        decision: decision.conclusion,
      },
      { status: 403 },
    )
  }

  return Response.json({
    message: 'Hello through Arcjet Shield!',
    protected: true,
    decision: decision.conclusion,
    decisionId: decision.id,
  })
}
