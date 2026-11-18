import { many } from './db';
import { memo } from './memo';
import { BANDS, type CalibrationBand } from './real-chance';

/** Settled legs per price band, cached 10 minutes (one small aggregate over ticket_selections). */
export function calibrationBands(): Promise<CalibrationBand[]> {
  return memo('real-chance-bands', 10 * 60_000, async () => {
    const rows = await many<{ band: number; n: number | string; won: number | string; implied: number | string }>(
      `SELECT CASE ${BANDS.map(([, hi], i) => `WHEN odds < ${hi} THEN ${i}`).join(' ')} END AS band,
              count(*) AS n, sum(CASE WHEN outcome='WON' THEN 1 ELSE 0 END) AS won, avg(1.0/odds) AS implied
         FROM ticket_selections WHERE outcome IN ('WON','LOST') AND odds > 1 GROUP BY 1`);
    return BANDS.map(([lo, hi], i) => {
      const r = rows.find((x) => Number(x.band) === i);
      return { lo, hi, n: Number(r?.n ?? 0), won: Number(r?.won ?? 0), implied: Number(r?.implied ?? 0) };
    });
  }).catch(() => BANDS.map(([lo, hi]) => ({ lo, hi, n: 0, won: 0, implied: 0 })));
}
