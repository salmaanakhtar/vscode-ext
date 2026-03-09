// packages/shared/src/utils/validation.ts

import type { TeamConfig, Agent } from '../types';

export interface ValidationError {
  field: string;
  message: string;
}

export function validateTeamConfig(config: unknown): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!config || typeof config !== 'object') {
    return [{ field: 'root', message: 'Config must be an object' }];
  }

  const c = config as Partial<TeamConfig>;

  if (!c.version) errors.push({ field: 'version', message: 'Required' });
  if (!c.project) errors.push({ field: 'project', message: 'Required' });
  if (!c.teamLead) errors.push({ field: 'teamLead', message: 'Required' });
  if (!Array.isArray(c.agents)) errors.push({ field: 'agents', message: 'Must be array' });
  if (!c.memory) errors.push({ field: 'memory', message: 'Required' });
  if (!c.git) errors.push({ field: 'git', message: 'Required' });

  if (Array.isArray(c.agents)) {
    c.agents.forEach((agent, i) => {
      const agentErrors = validateAgent(agent);
      agentErrors.forEach(e => errors.push({ field: `agents[${i}].${e.field}`, message: e.message }));
    });
  }

  return errors;
}

export function validateAgent(agent: unknown): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!agent || typeof agent !== 'object') {
    return [{ field: 'root', message: 'Agent must be an object' }];
  }

  const a = agent as Partial<Agent>;

  if (!a.id) errors.push({ field: 'id', message: 'Required' });
  if (!a.name) errors.push({ field: 'name', message: 'Required' });
  if (!a.model) errors.push({ field: 'model', message: 'Required' });
  if (typeof a.maxTurns !== 'number') errors.push({ field: 'maxTurns', message: 'Must be number' });
  if (!a.git) errors.push({ field: 'git', message: 'Required' });
  if (!Array.isArray(a.builtinTools)) errors.push({ field: 'builtinTools', message: 'Must be array' });

  return errors;
}
