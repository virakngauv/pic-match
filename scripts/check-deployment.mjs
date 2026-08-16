const [candidateURL, expectedCommitSha] = process.argv.slice(2)

if (!candidateURL || !expectedCommitSha) {
  console.error(
    'Usage: pnpm deploy:smoke -- <https://candidate-url> <expected-commit-sha>',
  )
  process.exit(1)
}

let baseURL
try {
  baseURL = new URL(candidateURL)
} catch {
  console.error('The candidate URL is not a valid absolute URL.')
  process.exit(1)
}

if (baseURL.protocol !== 'https:') {
  console.error('The candidate deployment must use HTTPS.')
  process.exit(1)
}

baseURL.pathname = '/'
baseURL.search = ''
baseURL.hash = ''

const healthURL = new URL('/api/health', baseURL)
const healthResponse = await fetch(healthURL, { cache: 'no-store' })
if (!healthResponse.ok) {
  throw new Error(`Health check returned HTTP ${healthResponse.status}.`)
}

const health = await healthResponse.json()
if (health.status !== 'ok' || health.service !== 'spot-it-web') {
  throw new Error('Health check returned an unexpected payload.')
}
if (health.commitSha !== expectedCommitSha) {
  throw new Error(
    `Candidate commit mismatch: expected ${expectedCommitSha}, received ${health.commitSha ?? 'none'}.`,
  )
}

const homeResponse = await fetch(new URL('/home', baseURL), {
  redirect: 'follow',
})
if (!homeResponse.ok) {
  throw new Error(`Home page returned HTTP ${homeResponse.status}.`)
}

console.log(`Healthy deployment: ${baseURL.toString()}`)
console.log(`Verified commit: ${health.commitSha}`)
