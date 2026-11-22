import { createConfig } from '@nova/config/eslint';

export default [
  ...createConfig({ tsconfigRootDir: import.meta.dirname }),
  {
    rules: {
      // NestJS dependency injection reads constructor parameter types from emitted decorator
      // metadata; type-only imports would erase them.
      '@typescript-eslint/consistent-type-imports': 'off',
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },

  {
    // Response bodies in tests are untyped JSON; asserting on them is the point.
    files: ['test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },
];
