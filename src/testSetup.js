import { vi } from 'vitest';

// Existing tests use Jest-compatible helpers. Keep that surface local to the
// test runner while production code remains free of the discontinued CRA stack.
globalThis.jest = vi;
