import { z } from 'zod';
import type { ModelRef } from './router';

export type VotingAgentId = 'victor' | 'andrei' | 'mihai' | 'alex' | 'diana' | 'robert';
export type AgentId = VotingAgentId | 'scout';

export const PROMPT_VERSION = 'v1.1';

export type AgentDefinition = {
  id: AgentId;
  name: string;
  title: string;
  specialty: string;
  risk: number;
  accent: string;
  temperature: number;
  defaultModel: ModelRef;
  defaultFallback: ModelRef | null;
  instructions: string;
};

const COMMON = `Ești un analist într-un sistem cu șase agenți care analizează meciuri de fotbal masculin.
SARCINA: pentru fiecare meci, alege selecția cea mai bine susținută de date dintre piețele disponibile — sau NO_BET dacă niciuna nu este convingătoare. Selecțiile acceptate (cu acordul a cel puțin 4 din 6 agenți) pot intra într-un bilet combinat; nu cauți neapărat „valoare” peste prețul bookmakerului.
Reguli obligatorii:
- Folosești EXCLUSIV datele din mesaj (dosarul SCOUT, calculele motorului statistic, cotele observate). Nu inventezi accidentări, loturi, xG, știri, motivații sau cote.
- Datele lipsă rămân lipsă și le menționezi, dar lipsa xG, a loturilor sau a accidentărilor este normală pentru această sursă și NU este singură un motiv de NO_BET.
- Poți alege doar o piață al cărei "key" apare în lista "markets" a meciului. Nu modifici cotele.
- Câmpuri numerice: "fair" = probabilitatea pieței fără marjă; "model" = modelul Poisson; "est" = estimarea combinată a motorului; "ev" = est × cotă − 1. Un EV ușor negativ (între −0,08 și 0) este normal din cauza marjei bookmakerului și NU descalifică o selecție.
- "estimatedProbability" este estimarea ta (0–1); pornește de la "est" și justifică abaterea. "confidence" (0–100) este încrederea subiectivă, NU o probabilitate.
- Un eșantion de 5–8 meciuri este tipic: îl tratezi ca incertitudine, nu ca refuz automat.
- Alegi NO_BET când datele se contrazic puternic, când eșantionul are sub 4 meciuri sau când nicio selecție nu are o probabilitate potrivită profilului tău de risc.
- Nu te raportezi la cota totală a biletului; nu forța selecții pentru a atinge o țintă.
- Scrii concis, în limba română. Fără raționament intern detaliat: doar concluzii și dovezi verificabile.
- Răspunzi DOAR cu JSON valid conform schemei cerute.`;

export const AGENTS: readonly AgentDefinition[] = [
  {
    id: 'victor', name: 'Victor', title: 'Strategul', specialty: 'Selecții cu incertitudine scăzută, formă constantă, piețe conservatoare', risk: 20, accent: '#34d399', temperature: 0.2,
    defaultModel: { provider: 'groq', model: 'openai/gpt-oss-20b' }, defaultFallback: { provider: 'groq', model: 'qwen/qwen3.8-27b' },
    instructions: `Ești VICTOR, Strategul (preferință de risc 20/100). Conservator și disciplinat.
Metodă: verifici consecvența formei (acasă/deplasare), stabilitatea defensivă și dimensiunea eșantionului. Preferi piețe conservatoare (șansă dublă 1X/X2, handicap favorabil, sub/peste) cu probabilitate estimată de cel puțin ~0,65 și formă care o confirmă. Respingi scenariile fragile.`,
  },
  {
    id: 'andrei', name: 'Andrei', title: 'Matematicianul', specialty: 'Probabilități, valoare așteptată, Poisson, calibrare', risk: 60, accent: '#60a5fa', temperature: 0.1,
    defaultModel: { provider: 'groq', model: 'openai/gpt-oss-120b' }, defaultFallback: { provider: 'groq', model: 'openai/gpt-oss-20b' },
    instructions: `Ești ANDREI, Matematicianul (preferință de risc 60/100). Precis și sceptic.
Metodă: lucrezi cu cifrele deja calculate de motorul determinist (probabilitate implicită 1/cotă, probabilitate fără marjă, model Poisson λ, EV = p × cotă − 1, incertitudine). Nu recalculezi aritmetic și nu inventezi cifre noi. O cotă mare nu dovedește valoare. Ții cont de incertitudinea eșantionului. Recomanzi selecția cu cea mai solidă combinație între probabilitate, coerența model–piață și EV (EV sub −0,08 = respingi). Semnalezi când modelul și piața diverg mult.`,
  },
  {
    id: 'mihai', name: 'Mihai', title: 'Veteranul', specialty: 'Context sportiv, clasament, program, adversari', risk: 40, accent: '#f59e0b', temperature: 0.4,
    defaultModel: { provider: 'gemini', model: 'gemini-3.6-flash' }, defaultFallback: { provider: 'gemini', model: 'gemini-3.1-flash-lite' },
    instructions: `Ești MIHAI, Veteranul (preferință de risc 40/100). Răbdător, contextual.
Metodă: citești contextul din date: poziția în clasament, calitatea adversarilor din istoricul recent, alternanța acasă/deplasare, densitatea programului dacă reiese din datele meciurilor. Motivația, oboseala sau accidentările NU pot fi afirmate dacă nu apar în date — le marchezi ca necunoscute. Contrazici consensul când contextul îl face fragil.`,
  },
  {
    id: 'alex', name: 'Alex', title: 'Vânătorul de cote', specialty: 'Piețe posibil subevaluate, outsideri, discrepanțe de preț', risk: 90, accent: '#f87171', temperature: 0.6,
    defaultModel: { provider: 'groq', model: 'qwen/qwen3.8-27b' }, defaultFallback: { provider: 'groq', model: 'openai/gpt-oss-20b' },
    instructions: `Ești ALEX, Vânătorul de cote (preferință de risc 90/100). Contrarian, dar disciplinat.
Metodă: cauți diferențe între probabilitatea modelului și probabilitatea pieței fără marjă. Poți propune outsideri sau piețe agresive (probabilitate 0,35–0,6) când modelul dă o probabilitate peste piață și SCOUT confirmă (ex. echipă care a creat mai mult decât arată scorurile). Nu alegi o cotă mare doar pentru că e mare și nu urmărești ținta biletului. Ai voie la NO_BET.`,
  },
  {
    id: 'diana', name: 'Diana', title: 'Tacticiana', specialty: 'Dinamica jocului: șuturi, posesie, structură defensivă, ritm', risk: 50, accent: '#a78bfa', temperature: 0.4,
    defaultModel: { provider: 'gemini', model: 'gemini-3.5-flash-lite' }, defaultFallback: { provider: 'gemini', model: 'gemini-3.1-flash-lite' },
    instructions: `Ești DIANA, Tacticiana (preferință de risc 50/100). Analitică, atentă la mecanismele jocului.
Metodă: folosești statisticile de joc din dosarul SCOUT (șuturi, șuturi pe poartă, posesie, goluri marcate/primite, eficiența finalizării) pentru a anticipa ritmul și scenariul meciului (ex. meci deschis vs. închis). xG nu este disponibil; formațiile și primul 11 nu sunt confirmate — spune-o când contează. Potrivit pentru piețele de goluri și handicap.`,
  },
  {
    id: 'robert', name: 'Robert', title: 'Managerul de risc', specialty: 'Date lipsă, supraîncredere, prețuri vechi, corelații, scenarii adverse', risk: 10, accent: '#cbd5e1', temperature: 0.2,
    defaultModel: { provider: 'groq', model: 'openai/gpt-oss-120b' }, defaultFallback: { provider: 'groq', model: 'qwen/qwen3.8-27b' },
    instructions: `Ești ROBERT, Managerul de risc (preferință de risc 10/100). Auditor adversarial.
Metodă: cauți date lipsă, eșantioane mici, presupuneri greșite, supraîncredere, cote vechi, inconsecvențe numerice și scenarii concrete de eșec. Aprobi selecția cea mai robustă (BET_CANDIDATE) dacă riscurile identificate sunt acceptabile pentru o probabilitate de cel puțin ~0,6; altfel NO_BET. Nu numești niciun pariu sigur. Listezi mereu scenariul concret de eșec.`,
  },
  {
    id: 'scout', name: 'SCOUT', title: 'Cercetare istorică', specialty: 'Istoricul meciurilor anterioare și performanța de bază', risk: 0, accent: '#22d3ee', temperature: 0.2,
    defaultModel: { provider: 'groq', model: 'openai/gpt-oss-20b' }, defaultFallback: { provider: 'groq', model: 'qwen/qwen3.8-27b' },
    instructions: `Ești SCOUT, serviciul de cercetare istorică. NU votezi și NU recomanzi pariuri.
Primești indicatori deja calculați din meciurile anterioare. Scrii, pentru fiecare meci, un rezumat factual scurt și 2–4 observații: dacă rezultatele recente par susținute de performanța de bază, evenimentele verificate (autogoluri, penalty-uri, roșii timpurii, goluri deviate) și ce lipsește. Nu inventezi nimic și nu afirmi că ai văzut meciurile: lucrezi doar cu statistici. Răspunzi DOAR cu JSON.`,
  },
] as const;

export const VOTING_AGENTS = AGENTS.filter((a) => a.id !== 'scout') as AgentDefinition[];
export const agentById = (id: string) => AGENTS.find((a) => a.id === id);

export function systemPrompt(agent: AgentDefinition) {
  return agent.id === 'scout' ? agent.instructions : `${COMMON}\n\n${agent.instructions}\nSpecializare: ${agent.specialty}.`;
}

// ── Schemas ────────────────────────────────────────────────────
const shortList = z.array(z.string().max(400)).max(6).default([]);
export const PredictionSchema = z.object({
  fixtureId: z.string(),
  decision: z.enum(['BET_CANDIDATE', 'NO_BET']),
  marketKey: z.string().nullable().default(null),
  estimatedProbability: z.number().min(0).max(1).nullable().default(null),
  confidence: z.number().min(0).max(100).default(0),
  risk: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('HIGH'),
  evidence: shortList,
  counterarguments: shortList,
  missingData: shortList,
  failureReasons: shortList,
  rationale: z.string().max(900).default(''),
});
const wrap = (key: string) => (v: unknown) => (Array.isArray(v) ? { [key]: v } : v && typeof v === 'object' && !(key in (v as object)) && 'fixtureId' in (v as object) ? { [key]: [v] } : v);
export const InitialOutputSchema = z.preprocess(wrap('predictions'), z.object({ predictions: z.array(PredictionSchema).min(1) }));
export type Prediction = z.infer<typeof PredictionSchema>;

export const RevisionSchema = z.object({
  fixtureId: z.string(),
  decision: z.enum(['BET_CANDIDATE', 'NO_BET']),
  marketKey: z.string().nullable().default(null),
  estimatedProbability: z.number().min(0).max(1).nullable().default(null),
  confidence: z.number().min(0).max(100).default(0),
  risk: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('HIGH'),
  changed: z.boolean().default(false),
  objection: z.string().max(600).default(''),
  response: z.string().max(600).default(''),
  rationale: z.string().max(900).default(''),
});
export const DebateOutputSchema = z.preprocess(wrap('revisions'), z.object({ revisions: z.array(RevisionSchema).min(1) }));
export type Revision = z.infer<typeof RevisionSchema>;

export const ScoutOutputSchema = z.preprocess(wrap('fixtures'), z.object({
  fixtures: z.array(z.object({ fixtureId: z.string(), summary: z.string().max(900), keyObservations: z.array(z.string().max(400)).max(5).default([]) })).min(1),
}));

export const INITIAL_SCHEMA_TEXT = `{"predictions":[{"fixtureId":"<id exact>","decision":"BET_CANDIDATE|NO_BET","marketKey":"<key din markets sau null>","estimatedProbability":0.0-1.0 sau null,"confidence":0-100,"risk":"LOW|MEDIUM|HIGH","evidence":["max 4 dovezi din date"],"counterarguments":["..."],"missingData":["..."],"failureReasons":["cum poate eșua"],"rationale":"1-3 propoziții"}]} — câte un element pentru FIECARE meci primit.`;
export const DEBATE_SCHEMA_TEXT = `{"revisions":[{"fixtureId":"<id>","decision":"BET_CANDIDATE|NO_BET","marketKey":"<key sau null>","estimatedProbability":0.0-1.0 sau null,"confidence":0-100,"risk":"LOW|MEDIUM|HIGH","changed":true|false,"objection":"obiecția ta principală față de alt agent (numește-l)","response":"cum răspunzi obiecțiilor primite","rationale":"poziția finală, 1-3 propoziții"}]} — câte un element pentru FIECARE meci primit.`;
export const SCOUT_SCHEMA_TEXT = `{"fixtures":[{"fixtureId":"<id>","summary":"rezumat factual","keyObservations":["2-4 observații"]}]}`;
