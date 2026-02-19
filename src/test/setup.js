import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock Web Crypto API for Node.js test environment
Object.defineProperty(globalThis, 'crypto', {
  value: {
    randomUUID: () => '00000000-0000-0000-0000-000000000000',
    getRandomValues: (arr) => {
      for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
      return arr;
    },
    subtle: {
      digest: vi.fn().mockResolvedValue(new ArrayBuffer(32)),
    },
  },
});

// Mock import.meta.env
vi.stubGlobal('import.meta', {
  env: {
    VITE_APP_ENV: 'test',
    VITE_MAX_CHAT_MESSAGE_LENGTH: '2000',
    VITE_MAX_REQUESTS_PER_MINUTE: '60',
    VITE_ENABLE_REAL_TIME_UPDATES: 'false',
    VITE_API_BASE_URL: 'http://localhost:3001',
  },
});
