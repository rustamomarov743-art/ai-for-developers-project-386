import { defineConfig } from '@hey-api/openapi-ts'

export default defineConfig({
  input: './tsp-output/@typespec/openapi3/openapi.yaml',
  output: '../frontend/src/api/generated',
  plugins: [
    '@hey-api/client-fetch',
    '@hey-api/typescript',
    {
      name: '@hey-api/sdk',
      operations: {
        strategy: 'flat',
      },
    },
  ],
})
