import { defineProject } from 'vitest/config';

// Only pure game logic is unit-tested here; the 3D scene is checked in the browser.
export default defineProject({
  test: {
    name: 'web',
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
