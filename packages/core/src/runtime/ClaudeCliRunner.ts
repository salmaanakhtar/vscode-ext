// packages/core/src/runtime/ClaudeCliRunner.ts

import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { logger } from '@vscode-ext/shared';

export interface CliRunOptions {
  prompt: string;
  systemPrompt?: string;
  allowedTools?: string[];
  cwd?: string;
  sessionId?: string;        // for --resume
  outputFormat?: 'text' | 'stream-json';
  abortSignal?: AbortSignal;
}

export interface CliRunResult {
  output: string;            // final text output
  sessionId?: string;        // session ID for warm resume
  costUsd?: number;
  exitCode: number;
}

export class ClaudeCliRunner extends EventEmitter {

  async run(options: CliRunOptions): Promise<CliRunResult> {
    const args = this.buildArgs(options);
    logger.debug('Spawning claude CLI', { args: args.slice(0, 5) });

    return new Promise((resolve, reject) => {
      const proc = spawn('claude', args, {
        cwd: options.cwd ?? process.cwd(),
        env: { ...process.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      if (options.abortSignal) {
        options.abortSignal.addEventListener('abort', () => {
          proc.kill('SIGTERM');
        });
      }

      const stdoutChunks: string[] = [];
      const stderrChunks: string[] = [];
      let sessionId: string | undefined;
      let costUsd: number | undefined;

      proc.stdout.setEncoding('utf-8');
      proc.stderr.setEncoding('utf-8');

      proc.stdout.on('data', (chunk: string) => {
        stdoutChunks.push(chunk);

        if (options.outputFormat === 'stream-json') {
          const lines = chunk.split('\n').filter(Boolean);
          for (const line of lines) {
            try {
              const msg = JSON.parse(line) as Record<string, unknown>;
              if (msg['type'] === 'system' && typeof msg['session_id'] === 'string') {
                sessionId = msg['session_id'];
              }
              if (msg['type'] === 'result' && typeof msg['cost_usd'] === 'number') {
                costUsd = msg['cost_usd'];
              }
              if (
                msg['type'] === 'stream_event' &&
                typeof msg['event'] === 'object' &&
                msg['event'] !== null
              ) {
                const event = msg['event'] as Record<string, unknown>;
                if (event['delta'] && typeof event['delta'] === 'object') {
                  const delta = event['delta'] as Record<string, unknown>;
                  if (delta['type'] === 'text_delta' && typeof delta['text'] === 'string') {
                    this.emit('text', delta['text']);
                  }
                }
              }
            } catch {
              this.emit('raw', line);
            }
          }
        } else {
          this.emit('text', chunk);
        }
      });

      proc.stderr.on('data', (chunk: string) => {
        stderrChunks.push(chunk);
        this.emit('stderr', chunk);
      });

      proc.on('error', (err) => {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          reject(new Error(
            'Claude Code CLI not found in PATH.\n' +
            'Install: npm install -g @anthropic-ai/claude-code\n' +
            'Login:   claude login'
          ));
        } else {
          reject(err);
        }
      });

      proc.on('close', (code) => {
        const exitCode = code ?? 1;
        const rawOutput = stdoutChunks.join('');

        if (exitCode !== 0) {
          const stderr = stderrChunks.join('');
          if (stderr.includes('not logged in') || stderr.includes('unauthorized')) {
            reject(new Error(
              'Claude Code is not logged in. Run: claude login\n' +
              'Make sure you have a Pro or Max subscription.'
            ));
            return;
          }
          logger.warn('claude CLI exited with non-zero code', { exitCode, stderr: stderr.slice(0, 200) });
        }

        const output = options.outputFormat === 'stream-json'
          ? this.extractTextFromStreamJson(rawOutput)
          : rawOutput;

        resolve({ output, sessionId, costUsd, exitCode });
      });

      // Write prompt to stdin
      proc.stdin.write(options.prompt);
      proc.stdin.end();
    });
  }

  private buildArgs(options: CliRunOptions): string[] {
    const args: string[] = ['-p', '-']; // read from stdin

    args.push('--output-format', options.outputFormat ?? 'stream-json');

    if (options.systemPrompt) {
      args.push('--system-prompt', options.systemPrompt);
    }

    if (options.allowedTools && options.allowedTools.length > 0) {
      args.push('--allowedTools', options.allowedTools.join(','));
    }

    if (options.sessionId) {
      args.push('--resume', options.sessionId);
    }

    return args;
  }

  private extractTextFromStreamJson(raw: string): string {
    const textParts: string[] = [];
    const lines = raw.split('\n').filter(Boolean);

    for (const line of lines) {
      try {
        const msg = JSON.parse(line) as Record<string, unknown>;
        if (msg['type'] === 'result' && typeof msg['result'] === 'string') {
          return msg['result'];
        }
        if (msg['type'] === 'stream_event' && typeof msg['event'] === 'object' && msg['event'] !== null) {
          const event = msg['event'] as Record<string, unknown>;
          const delta = event['delta'] as Record<string, unknown> | undefined;
          if (delta?.['type'] === 'text_delta' && typeof delta['text'] === 'string') {
            textParts.push(delta['text']);
          }
        }
      } catch {
        // skip non-JSON lines
      }
    }

    return textParts.join('');
  }
}
