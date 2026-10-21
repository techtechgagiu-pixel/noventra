export type FixtureStatus = 'pre' | 'in' | 'post' | 'postponed' | 'cancelled';

export type MarketType = '1X2' | 'DOUBLE_CHANCE' | 'TOTAL' | 'HANDICAP' | 'TEAM_TOTAL' | 'BTTS' | 'CLEAN_SHEET' | 'TEAM_SPECIAL' | 'HALF' | 'CORNERS';

/** A priced market selection, exactly as observed at the source. Never altered. */
export type MarketQuote = {
  key: string; // canonical key, e.g. 1X2:HOME, DC:1X, TOTAL:OVER:2.5, AH:HOME:-1.5
  label: string; // Romanian label
  marketType: MarketType;
  odds: number; // decimal
  line?: number;
  /** Bookmaker of this specific price, when it differs from the snapshot's main bookmaker. */
  bookmaker?: string;
};

export type OddsSnapshot = {
  bookmaker: string;
  source: string;
  observedAt: string; // when we read it
  providerUpdatedAt: string | null; // when the provider says it changed (unknown for ESPN)
  markets: MarketQuote[];
};

export type Fixture = {
  id: string; // provider:eventId
  provider: 'espn' | 'lpf' | 'demo';
  providerId: string;
  leagueId: string; // canonical league id (ENG1…)
  leagueKey: string; // provider league key (eng.1)
  leagueName: string;
  country: string;
  home: string;
  away: string;
  homeTeamId?: string;
  awayTeamId?: string;
  homeLogo?: string;
  awayLogo?: string;
  kickoff: string; // ISO UTC
  status: FixtureStatus;
  homeScore?: number | null;
  awayScore?: number | null;
  odds: OddsSnapshot | null;
  fetchedAt: string;
};

export type League = {
  id: string;
  country: string;
  name: string;
  provider: 'espn' | 'lpf';
  providerKey: string;
  priority: number;
  top10: boolean;
};

/** One past match for a team, built only from data available before the analyzed kickoff. */
export type HistoricalMatch = {
  eventKey: string;
  date: string;
  competition: string;
  venue: 'home' | 'away';
  opponent: string;
  goalsFor: number;
  goalsAgainst: number;
  result: 'W' | 'D' | 'L';
  shots: number | null;
  shotsOnTarget: number | null;
  opponentShots: number | null;
  opponentShotsOnTarget: number | null;
  possession: number | null;
  redCardsFor: number | null;
  redCardsAgainst: number | null;
  penaltyGoalsFor: number | null;
  penaltyGoalsAgainst: number | null;
  ownGoalsFor: number | null; // own goals scored by the opponent in this team's favour
  ownGoalsAgainst: number | null;
  deflectedGoalsFor: number | null; // goals whose provider description mentions a deflection
  earlyRedCard: boolean | null; // a red card before minute 30 for either side
  xg: null; // ESPN does not publish xG in this feed — kept explicitly missing
  source: string;
};

export type TeamContext = {
  teamId?: string;
  name: string;
  standing?: { rank: number | null; played: number | null; points: number | null; goalDifference: number | null } | null;
  formString?: string | null;
};
