import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

// Original photo files must never be deleted. These rules make any delete API a lint error.
const NO_DELETE_MESSAGE =
  'Deleting files is forbidden in this app. Hide photos via deleted_at instead.';
const deleteFns = ['unlink', 'unlinkSync', 'rm', 'rmSync', 'rmdir', 'rmdirSync'];

export default tseslint.config(
  { ignores: ['out/**', 'dist/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'error',
      'no-restricted-properties': [
        'error',
        ...['fs', 'fsp', 'promises'].flatMap((object) =>
          deleteFns.map((property) => ({
            object,
            property,
            message: NO_DELETE_MESSAGE,
          }))
        ),
        { object: 'shell', property: 'trashItem', message: NO_DELETE_MESSAGE },
      ],
      'no-restricted-imports': [
        'error',
        ...['fs', 'node:fs', 'fs/promises', 'node:fs/promises'].map((name) => ({
          name,
          importNames: deleteFns,
          message: NO_DELETE_MESSAGE,
        })),
      ],
    },
  }
);
