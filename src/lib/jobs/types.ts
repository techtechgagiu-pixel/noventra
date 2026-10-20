import type { FixtureModel } from '../stats/engine';
import type { OddsSnapshot } from '../sports/types';
import type { ScoutDossier } from '../scout/dossier';

export type JobStatus = 'QUEUED' | 'RUNNING' | 'WAITING' | 'PAUSED' | 'COMPLETED' | 'INCOMPLETE' | 'NO_BET' | 'FAILED';
export const TERMINAL: JobStatus[] = ['COMPLETED', 'INCOMPLETE', 'NO_BET', 'FAILED'];

/** User-facing stages (the seven NEXUS steps). */
export type Stage = 'QUEUED' | 'SELECTING' | 'SCOUT' | 'STATS' | 'ANALYSIS' | 'DEBATE' | 'VOTING' | 'BUILDING' | 'DONE';
export const STAGES: { id: Stage; label: string }[] = [
  { id: 'SELECTING', label: 'Alegerea meciurilor' },
  { id: 'SCOUT', label: 'Cercetarea SCOUT' },
  { id: 'STATS', label: 'Calculele statistice' },
  { id: 'ANALYSIS', label: 'Analiza celor zece agenți' },
  { id: 'DEBATE', label: 'Dezbaterea' },
  { id: 'VOTING', label: 'Votarea și validarea' },
  { id: 'BUILDING', label: 'Construirea biletului' },
];

export type BatchStep = 'FETCH' | 'SCOUT' | 'STATS' | 'INITIAL' | 'DEBATE1' | 'DEBATE2' | 'VOTE' | 'DONE';

export type Checkpoint = {
  phase: 'DISCOVER' | 'BATCH' | 'BUILD' | 'DONE';
  batchIndex: number;
  batchStep: BatchStep;
  batches: string[][];
  agentsDone: string[];
  analyzed: number;
  qualified: number;
  debateFixtures?: string[];
  resumedCount?: number;
};

export type CandidateEntry = { fixtureId: string; home: string; away: string; league: string; kickoff: string; eligible: boolean; reason?: string };

export type FixtureSnapshot = {
  fixture: { id: string; home: string; away: string; league: string; leagueKey: string; kickoff: string; provider: string; providerId: string };
  odds: OddsSnapshot;
  standings: { home: { rank: number | null; points: number | null; played: number | null } | null; away: { rank: number | null; points: number | null; played: number | null } | null };
  model: FixtureModel;
  dossier: ScoutDossier;
  dataQuality: { historyHome: number; historyAway: number; shotsAvailable: boolean; standings: boolean; oddsObservedAt: string };
};
