import { vi, afterEach } from 'vitest';
// Guard JavaScript fetch in unit tests; OS/browser/native audit is separate evidence.
vi.stubGlobal('fetch', () => {
  throw new Error('External requests are forbidden in unit tests');
});
afterEach(() => {
  vi.clearAllMocks();
});
