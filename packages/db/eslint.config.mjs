import { createConfig } from '@nova/config/eslint';

export default [
  ...createConfig({ tsconfigRootDir: import.meta.dirname }),
  {
    // The seed is a CLI; printing its summary is intended.
    files: ['src/seed/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
];
