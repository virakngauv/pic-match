const publishConfirmationVariable = 'FIRST_PUBLIC_PLAYTEST_CONFIRMED'
const requiredVercelVariables = [
  'NEXT_PUBLIC_GAME_SERVER_URL',
  publishConfirmationVariable,
]

const isConfigured = (name) => Boolean(process.env[name]?.trim())
const isValid = (name) =>
  name === publishConfirmationVariable
    ? process.env[name]?.trim() === 'true'
    : name === 'NEXT_PUBLIC_GAME_SERVER_URL'
      ? isHttpsUrl(process.env[name])
      : isConfigured(name)
const missing = requiredVercelVariables.filter((name) => !isValid(name))

console.log('Deployment environment (values are intentionally hidden):')
for (const name of requiredVercelVariables) {
  console.log(`- required ${name}: ${isValid(name) ? 'configured' : 'missing'}`)
}

if (missing.length > 0) {
  console.error(`Missing required deployment variables: ${missing.join(', ')}`)
  process.exitCode = 1
}

function isHttpsUrl(value) {
  try {
    return new URL(value?.trim() ?? '').protocol === 'https:'
  } catch {
    return false
  }
}
