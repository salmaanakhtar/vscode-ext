import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClaudeCliRunner } from '../../runtime/ClaudeCliRunner';
import * as childProcess from 'child_process';
import { EventEmitter } from 'events';
import type { ChildProcess } from 'child_process';

vi.mock('child_process');

type MockProc = ChildProcess & {
  stdout: EventEmitter & { setEncoding: ReturnType<typeof vi.fn> };
  stderr: EventEmitter & { setEncoding: ReturnType<typeof vi.fn> };
  stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
  kill: ReturnType<typeof vi.fn>;
};

function makeMockProc(stdout: string, exitCode = 0): MockProc {
  const proc = new EventEmitter() as unknown as MockProc;

  (proc as unknown as Record<string, unknown>).stdout = Object.assign(new EventEmitter(), { setEncoding: vi.fn() });
  (proc as unknown as Record<string, unknown>).stderr = Object.assign(new EventEmitter(), { setEncoding: vi.fn() });
  (proc as unknown as Record<string, unknown>).stdin = { write: vi.fn(), end: vi.fn() };
  (proc as unknown as Record<string, unknown>).kill = vi.fn();

  setImmediate(() => {
    (proc as unknown as { stdout: EventEmitter }).stdout.emit('data', stdout);
    proc.emit('close', exitCode);
  });

  return proc;
}

function makeErrorProc(errorCode: string): MockProc {
  const proc = new EventEmitter() as unknown as MockProc;

  (proc as unknown as Record<string, unknown>).stdout = Object.assign(new EventEmitter(), { setEncoding: vi.fn() });
  (proc as unknown as Record<string, unknown>).stderr = Object.assign(new EventEmitter(), { setEncoding: vi.fn() });
  (proc as unknown as Record<string, unknown>).stdin = { write: vi.fn(), end: vi.fn() };
  (proc as unknown as Record<string, unknown>).kill = vi.fn();

  setImmediate(() => {
    // In real Node.js, error fires first, then close fires with null code
    proc.emit('error', Object.assign(new Error('spawn failed'), { code: errorCode }));
    proc.emit('close', null);
  });

  return proc;
}

describe('ClaudeCliRunner', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('resolves with output on success (stream-json result field)', async () => {
    const jsonLine = JSON.stringify({ type: 'result', result: 'Hello world', cost_usd: 0.01 }) + '\n';
    vi.mocked(childProcess.spawn).mockReturnValue(makeMockProc(jsonLine));

    const runner = new ClaudeCliRunner();
    const result = await runner.run({ prompt: 'Say hello', outputFormat: 'stream-json' });

    expect(result.exitCode).toBe(0);
    expect(result.output).toBe('Hello world');
    expect(result.costUsd).toBe(0.01);
  });

  it('emits text events from stream-json delta', async () => {
    const streamLine = JSON.stringify({
      type: 'stream_event',
      event: { delta: { type: 'text_delta', text: 'chunk ' } }
    }) + '\n';
    vi.mocked(childProcess.spawn).mockReturnValue(makeMockProc(streamLine));

    const runner = new ClaudeCliRunner();
    const chunks: string[] = [];
    runner.on('text', (t: string) => chunks.push(t));

    await runner.run({ prompt: 'test', outputFormat: 'stream-json' });
    expect(chunks).toContain('chunk ');
  });

  it('captures session_id from system message', async () => {
    const sysLine = JSON.stringify({ type: 'system', session_id: 'sess_abc123' }) + '\n';
    const resultLine = JSON.stringify({ type: 'result', result: 'done' }) + '\n';
    vi.mocked(childProcess.spawn).mockReturnValue(makeMockProc(sysLine + resultLine));

    const runner = new ClaudeCliRunner();
    const result = await runner.run({ prompt: 'test', outputFormat: 'stream-json' });
    expect(result.sessionId).toBe('sess_abc123');
  });

  it('falls back to assembled text when no result field present', async () => {
    const line1 = JSON.stringify({ type: 'stream_event', event: { delta: { type: 'text_delta', text: 'Hello' } } }) + '\n';
    const line2 = JSON.stringify({ type: 'stream_event', event: { delta: { type: 'text_delta', text: ' world' } } }) + '\n';
    vi.mocked(childProcess.spawn).mockReturnValue(makeMockProc(line1 + line2));

    const runner = new ClaudeCliRunner();
    const result = await runner.run({ prompt: 'test', outputFormat: 'stream-json' });
    expect(result.output).toBe('Hello world');
  });

  it('returns raw output in text mode', async () => {
    vi.mocked(childProcess.spawn).mockReturnValue(makeMockProc('raw output here'));

    const runner = new ClaudeCliRunner();
    const result = await runner.run({ prompt: 'test', outputFormat: 'text' });
    expect(result.output).toBe('raw output here');
  });

  it('emits text chunks directly in text mode', async () => {
    vi.mocked(childProcess.spawn).mockReturnValue(makeMockProc('streaming chunk'));

    const runner = new ClaudeCliRunner();
    const chunks: string[] = [];
    runner.on('text', (t: string) => chunks.push(t));

    await runner.run({ prompt: 'test', outputFormat: 'text' });
    expect(chunks).toContain('streaming chunk');
  });

  it('emits raw event for non-JSON lines in stream-json mode', async () => {
    vi.mocked(childProcess.spawn).mockReturnValue(makeMockProc('not-json-at-all\n'));

    const runner = new ClaudeCliRunner();
    const raws: string[] = [];
    runner.on('raw', (r: string) => raws.push(r));

    await runner.run({ prompt: 'test', outputFormat: 'stream-json' });
    expect(raws).toContain('not-json-at-all');
  });

  it('throws with install instructions on ENOENT', async () => {
    vi.mocked(childProcess.spawn).mockReturnValue(makeErrorProc('ENOENT'));

    const runner = new ClaudeCliRunner();
    await expect(runner.run({ prompt: 'test' })).rejects.toThrow('npm install -g @anthropic-ai/claude-code');
  });

  it('re-throws non-ENOENT spawn errors', async () => {
    vi.mocked(childProcess.spawn).mockReturnValue(makeErrorProc('EACCES'));

    const runner = new ClaudeCliRunner();
    await expect(runner.run({ prompt: 'test' })).rejects.toThrow('spawn failed');
  });

  it('rejects with login message when stderr contains "not logged in"', async () => {
    const proc = new EventEmitter() as unknown as MockProc;
    (proc as unknown as Record<string, unknown>).stdout = Object.assign(new EventEmitter(), { setEncoding: vi.fn() });
    (proc as unknown as Record<string, unknown>).stderr = Object.assign(new EventEmitter(), { setEncoding: vi.fn() });
    (proc as unknown as Record<string, unknown>).stdin = { write: vi.fn(), end: vi.fn() };
    (proc as unknown as Record<string, unknown>).kill = vi.fn();

    vi.mocked(childProcess.spawn).mockReturnValue(proc);

    setImmediate(() => {
      (proc as unknown as { stderr: EventEmitter }).stderr.emit('data', 'Error: not logged in');
      proc.emit('close', 1);
    });

    const runner = new ClaudeCliRunner();
    await expect(runner.run({ prompt: 'test' })).rejects.toThrow('claude login');
  });

  it('resolves with non-zero exitCode when stderr has no auth error', async () => {
    const proc = new EventEmitter() as unknown as MockProc;
    (proc as unknown as Record<string, unknown>).stdout = Object.assign(new EventEmitter(), { setEncoding: vi.fn() });
    (proc as unknown as Record<string, unknown>).stderr = Object.assign(new EventEmitter(), { setEncoding: vi.fn() });
    (proc as unknown as Record<string, unknown>).stdin = { write: vi.fn(), end: vi.fn() };
    (proc as unknown as Record<string, unknown>).kill = vi.fn();

    vi.mocked(childProcess.spawn).mockReturnValue(proc);

    setImmediate(() => {
      (proc as unknown as { stderr: EventEmitter }).stderr.emit('data', 'some other error');
      proc.emit('close', 1);
    });

    const runner = new ClaudeCliRunner();
    const result = await runner.run({ prompt: 'test', outputFormat: 'text' });
    expect(result.exitCode).toBe(1);
  });

  it('calls abort on the process when abortSignal fires', async () => {
    const proc = makeMockProc('', 0);
    vi.mocked(childProcess.spawn).mockReturnValue(proc);

    const controller = new AbortController();
    const runner = new ClaudeCliRunner();

    const runPromise = runner.run({ prompt: 'test', abortSignal: controller.signal });
    controller.abort();
    await runPromise;

    expect((proc as unknown as { kill: ReturnType<typeof vi.fn> }).kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('passes --resume when sessionId provided', async () => {
    vi.mocked(childProcess.spawn).mockReturnValue(makeMockProc(''));

    const runner = new ClaudeCliRunner();
    await runner.run({ prompt: 'test', sessionId: 'sess_xyz', outputFormat: 'text' });

    const spawnArgs = vi.mocked(childProcess.spawn).mock.calls[0];
    expect(spawnArgs[1]).toContain('--resume');
    expect(spawnArgs[1]).toContain('sess_xyz');
  });

  it('passes --allowedTools when tools provided', async () => {
    vi.mocked(childProcess.spawn).mockReturnValue(makeMockProc(''));

    const runner = new ClaudeCliRunner();
    await runner.run({ prompt: 'test', allowedTools: ['Read', 'Write'], outputFormat: 'text' });

    const spawnArgs = vi.mocked(childProcess.spawn).mock.calls[0];
    expect(spawnArgs[1]).toContain('--allowedTools');
    expect(spawnArgs[1]).toContain('Read,Write');
  });
});
