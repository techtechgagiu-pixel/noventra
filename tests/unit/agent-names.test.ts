import { describe, expect, it } from 'vitest';
import { cleanAgentText, cleanPayload } from '@/lib/agent-names';

describe('model identities in historical generated text', () => {
  it('replaces full legacy identities and early aliases without partial-word matches', () => {
    expect(cleanAgentText('Alex și Elena propun selecții')).toBe('MiMo V2.6 Flash și Gemma 4 31B propun selecții');
    expect(cleanAgentText('Contest argumentul lui Radu și Victor.')).toBe('Contest argumentul lui Llama 4 Maverick și Claude Haiku 5.5.');
    expect(cleanAgentText('Mihai Stoica și Radu Drăgușin contestă')).toBe('Qwen 3 235B și NEX N2.5 Pro contestă');
    expect(cleanAgentText('Alexandru')).toBe('Alexandru');
    expect(cleanAgentText('Nova Iguaçu și Radu Marian')).toBe('Nova Iguaçu și Radu Marian');
    expect(cleanAgentText('Lucescu și Hagi contestă')).toBe('GPT-6.2 Sol și Claude Haiku 5.5 contestă');
    expect(cleanAgentText('M. Lucescu / Mx Lucescu')).toBe('GPT-6.2 Sol / Mx GPT-6.2 Sol');
    expect(cleanAgentText('MIRCEA LUCESCU / Hanțu / Nova')).toBe('GPT-6.2 Sol / Gemini 4 Hydrogen / MiniMax M3.1 Flash');
  });
  it('cleans nested archived prose but preserves identifiers and sourced news', () => {
    const value={rationale:'Andrei, Cosmin și Mihai au dreptate',marketKey:'DC:1X',home:'Ianis Hagi FC',model:'nex-agi/nex-n2.5-pro',headlines:[{title:'Ianis Hagi revine',source:'Sport'}],rows:[{response:'Mircea Lucescu refuză'}]};
    expect(cleanPayload(value)).toEqual({...value,rationale:'Claude Haiku 5.5, HY3 și GPT-6 Luna au dreptate',rows:[{response:'GPT-6.2 Sol refuză'}]});
    expect(cleanAgentText(cleanAgentText(value.rationale))).toBe(cleanAgentText(value.rationale));
  });
});
