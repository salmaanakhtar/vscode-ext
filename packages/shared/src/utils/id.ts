// packages/shared/src/utils/id.ts

import { randomBytes } from 'crypto';

export function generateId(prefix?: string): string {
  const random = randomBytes(8).toString('hex');
  const timestamp = Date.now().toString(36);
  return prefix ? `${prefix}_${timestamp}_${random}` : `${timestamp}_${random}`;
}

export function generateTaskId(): string {
  return generateId('task');
}

export function generateMemoryId(): string {
  return generateId('mem');
}

export function generateApprovalId(): string {
  return generateId('appr');
}

export function generateMessageId(): string {
  return generateId('msg');
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
    .substring(0, 50);
}
