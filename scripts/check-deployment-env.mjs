const requiredVercelVariables = ['CONVEX_DEPLOY_KEY']
const optionalVercelVariables = [
  'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
  'CLERK_SECRET_KEY',
  'NEXT_PUBLIC_POSTHOG_KEY',
  'NEXT_PUBLIC_POSTHOG_HOST',
  'ARCJET_KEY',
]

const isConfigured = (name) => Boolean(process.env[name]?.trim())
const missing = requiredVercelVariables.filter((name) => !isConfigured(name))

console.log('Deployment environment (values are intentionally hidden):')
for (const name of requiredVercelVariables) {
  console.log(
    `- required ${name}: ${isConfigured(name) ? 'configured' : 'missing'}`,
  )
}
console.log(
  '- managed NEXT_PUBLIC_CONVEX_URL: injected by `convex deploy` during the build',
)
for (const name of optionalVercelVariables) {
  console.log(
    `- optional ${name}: ${isConfigured(name) ? 'configured' : 'disabled'}`,
  )
}

const clerkVariables = ['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'CLERK_SECRET_KEY']
const configuredClerkVariables = clerkVariables.filter(isConfigured)
if (
  configuredClerkVariables.length > 0 &&
  configuredClerkVariables.length < clerkVariables.length
) {
  console.error(
    'Clerk is only partially configured. Set both Clerk variables or remove both.',
  )
  process.exitCode = 1
}

if (missing.length > 0) {
  console.error(`Missing required deployment variables: ${missing.join(', ')}`)
  process.exitCode = 1
}
