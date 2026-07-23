export function GET() {
  return Response.json({
    message: 'Hello from the Next.js API route!',
    timestamp: new Date().toISOString(),
  })
}
