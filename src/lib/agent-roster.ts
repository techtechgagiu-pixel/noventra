import { NEW_AI_PROFILES } from './ai/new-agent-profiles';
/** Legacy jobs without a recorded roster keep their original team. */
export const LEGACY_VOTER_IDS = ["victor", "andrei", "mihai", "alex", "diana", "robert", "ioana", "radu", "elena", "cosmin", "hantu", "becali", "ilie", "sumudica", "petrescu", "stoica", "prunea", "porumboiu", "ianis", "dragusin", "man", "tamas"] as const;
export const VOTER_IDS: string[] = [...LEGACY_VOTER_IDS, ...NEW_AI_PROFILES.map((a) => a.id)];
