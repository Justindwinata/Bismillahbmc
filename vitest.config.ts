import { defineConfig } from 'vitest/config';
export default defineConfig({test:{include:['tests/**/*.test.ts'],testTimeout:15000,coverage:{provider:'v8',include:['packages/domain/src/**/*.ts'],reporter:['text','json-summary','html'],thresholds:{branches:95,lines:95,functions:95,statements:95}}}});
