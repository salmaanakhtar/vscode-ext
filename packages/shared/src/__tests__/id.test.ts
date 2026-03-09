import { describe, it, expect } from 'vitest';
import { generateId, generateTaskId, slugify } from '../utils/id';

describe('generateId', () => {
  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });

  it('includes prefix when provided', () => {
    expect(generateId('test')).toMatch(/^test_/);
  });
});

describe('generateTaskId', () => {
  it('generates task-prefixed IDs', () => {
    expect(generateTaskId()).toMatch(/^task_/);
  });
});

describe('slugify', () => {
  it('converts text to slug', () => {
    expect(slugify('Add Login Form Validation')).toBe('add-login-form-validation');
  });

  it('removes special characters', () => {
    expect(slugify('fix: auth/login bug!')).toBe('fix-authlogin-bug');
  });

  it('truncates to 50 chars', () => {
    expect(slugify('a'.repeat(100))).toHaveLength(50);
  });

  it('collapses multiple dashes', () => {
    expect(slugify('hello   world')).toBe('hello-world');
  });
});
