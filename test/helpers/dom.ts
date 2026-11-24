// Import this first in every React test. A browser-like environment has to
// exist before React DOM loads, which is why the jsdom import comes first here too.
import 'global-jsdom/register';

import { afterEach } from 'node:test';
import { cleanup } from '@testing-library/react';

// Testing Library cleans up by itself only under Jest/Vitest. With node:test we do it by hand.
afterEach(cleanup);

/** React logs errors thrown during render. In tests where we expect them, that's just noise. */
export function quietly(fn: () => void) {
  const original = console.error;
  console.error = () => {};
  try {
    fn();
  } finally {
    console.error = original;
  }
}
