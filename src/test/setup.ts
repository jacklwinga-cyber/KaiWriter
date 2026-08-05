/**
 * Global test setup — runs before every test file.
 * Vitest is configured to load this via setupFiles in vitest.config.ts.
 */
import { beforeEach } from 'vitest';
import 'fake-indexeddb/auto'; // polyfills indexedDB, IDBKeyRange, etc. in Node/jsdom
import { resetDatabaseForTests } from '../lib/idb';

// Give every test a clean slate:
//  - Empty IndexedDB (no cross-test document / folder / version leakage)
//  - Empty localStorage (no recovery snapshots bleeding across tests)
beforeEach(async () => {
  await resetDatabaseForTests();
  localStorage.clear();
});
