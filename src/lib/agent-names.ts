import { modelAgentName } from './model-identities';

// Old names are aliases for rendering archived generated text only. IDs/data stay intact.
const ALIASES: Record<string,string> = {
  "Mircea Sandu": "victor",
  "Gheorghe Hagi": "andrei",
  "Gică Popescu": "mihai",
  "Adrian Mutu": "alex",
  "Răzvan Raț": "diana",
  "Mircea Lucescu": "robert",
  "Cristi Chivu": "ioana",
  "Răzvan Lucescu": "radu",
  "Dumitru Dragomir": "elena",
  "Anghel Iordănescu": "cosmin",
  "Ștucan": "hantu",
  "Gigi Becali": "becali",
  "Ilie Dumitrescu": "ilie",
  "Marius Șumudică": "sumudica",
  "Dan Petrescu": "petrescu",
  "Mihai Stoica": "stoica",
  "Florin Prunea": "prunea",
  "Adrian Porumboiu": "porumboiu",
  "Ianis Hagi": "ianis",
  "Radu Drăgușin": "dragusin",
  "Dennis Man": "man",
  "Gabriel Tamaș": "tamas",
  "Corina Caragea": "corina",
  "SCOUT": "scout",
  "Nova": "nova",
  "Sigma": "sigma",
  "Atlas": "atlas",
  "Argus": "argus",
  "Orion": "orion",
  "Prisma": "prisma",
  "Mnemos": "mnemos",
  "Nexus": "nexus",
  "Vector": "vector",
  "Fulger": "fulger",
  "Hanțu": "hantu",
  "Hantu": "hantu",
  "Stucan": "hantu",
  "M. Lucescu": "robert",
  "R. Lucescu": "radu",
  "I. Hagi": "ianis",
  "Sandu": "victor",
  "Hagi": "andrei",
  "Popescu": "mihai",
  "Mutu": "alex",
  "Raț": "diana",
  "Lucescu": "robert",
  "Chivu": "ioana",
  "Dragomir": "elena",
  "Iordănescu": "cosmin",
  "Becali": "becali",
  "Dumitrescu": "ilie",
  "Șumudică": "sumudica",
  "Petrescu": "petrescu",
  "Stoica": "stoica",
  "Prunea": "prunea",
  "Porumboiu": "porumboiu",
  "Drăgușin": "dragusin",
  "Tamaș": "tamas",
  "Corina": "corina"
};
const PLACEHOLDERS: Record<string,string> = {
  "Victor": "victor",
  "Andrei": "andrei",
  "Mihai": "mihai",
  "Alex": "alex",
  "Diana": "diana",
  "Robert": "robert",
  "Ioana": "ioana",
  "Radu": "radu",
  "Elena": "elena",
  "Cosmin": "cosmin"
};
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const full = new RegExp(`(?<![\\p{L}])(${Object.keys(ALIASES).sort((a,b) => b.length-a.length).map(escape).join('|')})(?![\\p{L}])`, 'giu');
const old = new RegExp(`(?<![\\p{L}])(${Object.keys(PLACEHOLDERS).join('|')})(?![\\p{L}])(?!\\s+\\p{Lu})`, 'gu');
const folded = Object.fromEntries(Object.entries(ALIASES).map(([name,id]) => [name.toLocaleLowerCase('ro'),id]));
export function cleanAgentText<T>(text: T): T {
  if (typeof text !== 'string' || !text) return text;
  return text.replace(full, (name, _capture, offset: number, source: string) => {
    if (!name.includes(' ') && /^\s+\p{Lu}/u.test(source.slice(offset + name.length))) return name;
    return modelAgentName(folded[name.toLocaleLowerCase('ro')]);
  }).replace(old, (name) => modelAgentName(PLACEHOLDERS[name])) as T;
}

/** Clean generated prose; leave identifiers, model IDs, team names and sourced headlines intact.
 * Only strings under a prose key are rewritten: agent id lists (e.g. custom.agents: ["hantu","becali"]) must stay ids,
 * otherwise the live map loses the selected agents whose ids look like old display names. */
const PROSE = /^(rationale|objection|response|reason|note|overall|advice|failureReasons|evidence|summary|keyObservations|consequence|lines|commentary|text)$/;
export function cleanPayload<T>(value: T, depth = 0, prose = false): T {
  if (depth > 12 || value === null || value === undefined) return value;
  if (typeof value === 'string') return prose ? cleanAgentText(value) : value;
  if (Array.isArray(value)) return value.map((v) => cleanPayload(v, depth + 1, prose)) as T;
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k,v] of Object.entries(value as Record<string, unknown>)) out[k] = cleanPayload(v, depth + 1, prose || PROSE.test(k));
    return out as T;
  }
  return value;
}
