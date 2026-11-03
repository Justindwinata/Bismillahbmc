import js from '@eslint/js';
import tseslint from 'typescript-eslint';
export default tseslint.config({ignores:['dist/**','node_modules/**','coverage/**','**/.next/**','**/.next-*/**','apps/web/next-env.d.ts','playwright-report/**','test-results/**']},js.configs.recommended,...tseslint.configs.recommended,{files:['**/*.ts'],rules:{'@typescript-eslint/no-explicit-any':'error'}});
