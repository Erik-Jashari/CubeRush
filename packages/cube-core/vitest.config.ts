import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'cube-core',
    include: ['src/**/*.test.ts'],
  },
});
