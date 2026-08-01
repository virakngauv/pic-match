import { describe, expect, it } from 'vitest'

import authConfig from './auth.config'

describe('authConfig', () => {
  it('does not require an auth provider for the anonymous player flow', () => {
    expect(authConfig).toEqual({ providers: [] })
  })
})
