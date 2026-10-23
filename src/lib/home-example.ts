import type { Thread } from './home-reel';

/** Curated excerpt from persisted analysis events, 23 Oct 2026.
 * No account details, prompts, job IDs, live data fetches or new inference.
 * This is a recording, not a current price offer. Provenance retained in docs/HOME-CUSTOM-2026-10-23.md. */
export const HOME_EXAMPLE: Thread = {
  "key": "public-recording-2026-10-23",
  "match": "Harrogate Town – Sutton United",
  "at": "2026-10-23T11:01:21.114Z",
  "title": "Fragment înregistrat",
  "score": 0,
  "messages": [
    {
      "seq": 686,
      "agentId": "ianis",
      "kind": "pick",
      "text": "Deși datele de șuturi lipsesc, forma lui Harrogate și statistica defensivă slabă a lui Sutton susțin șansa dublă 1X cu probabilitate foarte mare; cota 1.17 e ideală pentru biletul cu cote mici.",
      "chip": "Harrogate Town sau egal (1X)"
    },
    {
      "seq": 725,
      "agentId": "hantu",
      "kind": "objection",
      "text": "Ilie Dumitrescu, Cristi Chivu și Adrian Porumboiu resping analiza datorită lipsei datelor despre șuturi pe poartă, considerând modelul invalid."
    },
    {
      "seq": 750,
      "agentId": "robert",
      "kind": "brain",
      "text": "Est. 80,74%, patru susținători și argumente favorabile pentru Harrogate sau egal, deci este cea mai sigură opțiune din shortlist. Cota 1,17 este mult sub ideal, dar nu există alternativă listată pentru acest meci.",
      "chip": "Harrogate Town sau egal (1X)"
    },
    {
      "seq": 781,
      "agentId": null,
      "kind": "result",
      "good": true,
      "text": "Consens 4/7. Intră pe bilet: Harrogate Town sau egal (1X) @ 1.17."
    }
  ]
};

export const HOME_EXAMPLE_MODELS: Record<string, string> = { ianis: 'inception/mercury-3', robert: 'openai/gpt-6-luna-pro' };
