import type { AgentStat } from './agent-stats';
import { describeModel, modelPortrait } from './model-identities';

/** A role retains its own history even when another role uses the same model. */
export function aiCardIdentity(agent: Pick<AgentStat, 'id' | 'name' | 'title' | 'ownModel' | 'model'>) {
  return { ...describeModel(agent.ownModel ?? agent.model), portrait: modelPortrait(agent.id), role: agent.title.split(' · ')[0] };
}
