// packages/core/src/templates/AgentExporter.ts

import * as fs from 'fs/promises';
import * as path from 'path';
import * as zlib from 'zlib';
import { promisify } from 'util';
import type { Agent, Result } from '@vscode-ext/shared';
import {
  getAgentClaudePath,
  getAgentToolsPath,
  getAgentMemoryDir,
  logger,
} from '@vscode-ext/shared';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

/** The serialised format stored inside a .agentpack file. */
export interface AgentPack {
  version: '1.0';
  exportedAt: string;
  agent: Agent;
  claudeMd: string;
  toolsJson: string;
  memorySummary: string;
}

/**
 * Exports agent configuration to a gzip-compressed .agentpack file and
 * imports it back into a target project directory.
 *
 * The .agentpack format is a gzip-compressed JSON blob containing the
 * agent config, its CLAUDE.md, tools.json, and a sanitised memory summary.
 * Session IDs are stripped on export so the pack is portable.
 */
export class AgentExporter {
  /**
   * Export an agent to a .agentpack file at outputPath.
   * Strips the sessionId so the pack is portable across projects.
   */
  async export(
    projectRoot: string,
    agent: Agent,
    outputPath: string,
  ): Promise<Result<void>> {
    try {
      const claudeMd = await this.readSafe(getAgentClaudePath(projectRoot, agent.id));
      const toolsJson = await this.readSafe(getAgentToolsPath(projectRoot, agent.id));
      const memorySummary = await this.summariseMemory(
        getAgentMemoryDir(projectRoot, agent.id),
      );

      // Strip runtime-only field before export
      const exportAgent: Agent = { ...agent, sessionId: undefined };

      const pack: AgentPack = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        agent: exportAgent,
        claudeMd,
        toolsJson,
        memorySummary,
      };

      const json = JSON.stringify(pack, null, 2);
      const compressed = await gzip(Buffer.from(json));
      await fs.writeFile(outputPath, compressed);

      logger.info('Agent exported', { agentId: agent.id, outputPath });
      return { success: true, data: undefined };
    } catch (err) {
      return { success: false, error: err as Error };
    }
  }

  /**
   * Read and decompress a .agentpack file without importing it.
   * Useful for showing a preview before committing to an import.
   */
  async preview(packPath: string): Promise<Result<AgentPack>> {
    try {
      const compressed = await fs.readFile(packPath);
      const json = await gunzip(compressed);
      const pack = JSON.parse(json.toString()) as AgentPack;
      return { success: true, data: pack };
    } catch (err) {
      return { success: false, error: err as Error };
    }
  }

  /**
   * Import a .agentpack file into targetProjectRoot.
   * Writes CLAUDE.md and tools.json to the agent's directory.
   * Does NOT register the agent in team.json — callers should use TeamRegistry for that.
   *
   * @param packPath       Path to the .agentpack file
   * @param targetRoot     Project root to import into
   * @param agentIdOverride  Optional id to use instead of the pack's agent id
   */
  async import(
    packPath: string,
    targetRoot: string,
    agentIdOverride?: string,
  ): Promise<Result<AgentPack>> {
    try {
      const previewResult = await this.preview(packPath);
      if (!previewResult.success) return previewResult;

      const pack = previewResult.data;
      const agentId = agentIdOverride ?? pack.agent.id;

      const agentDir = path.join(targetRoot, '.agent', 'agents', agentId);
      await fs.mkdir(path.join(agentDir, 'memory'), { recursive: true });

      if (pack.claudeMd) {
        await fs.writeFile(path.join(agentDir, 'CLAUDE.md'), pack.claudeMd);
      }
      if (pack.toolsJson) {
        await fs.writeFile(path.join(agentDir, 'tools.json'), pack.toolsJson);
      }
      if (pack.memorySummary) {
        await fs.writeFile(
          path.join(agentDir, 'memory', 'imported-summary.md'),
          pack.memorySummary,
        );
      }

      logger.info('Agent imported', { agentId, targetRoot });
      return { success: true, data: pack };
    } catch (err) {
      return { success: false, error: err as Error };
    }
  }

  private async readSafe(filePath: string): Promise<string> {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch {
      return '';
    }
  }

  private async summariseMemory(memDir: string): Promise<string> {
    try {
      const files = await fs.readdir(memDir);
      const contents = await Promise.all(
        files.slice(0, 5).map(f => this.readSafe(path.join(memDir, f))),
      );
      return contents
        .filter(Boolean)
        .join('\n\n---\n\n')
        .substring(0, 2000);
    } catch {
      return '';
    }
  }
}
