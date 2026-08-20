// vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    typecheck: {
      tsconfig: './tsconfig.test.json' // Specify your test tsconfig here
    }
  }
})
