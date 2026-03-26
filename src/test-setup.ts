import { vi } from 'vitest';
import { act } from 'react';

// Mock localStorage with all required methods
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  key: vi.fn(),
  length: 0,
};

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
});

// Make localStorage mock available globally for tests
(global as any).localStorageMock = localStorageMock;

// Configure React act for React 19 compatibility
global.React = global.React || {};
(global.React as any).act = act;