import { many, one, query } from '../db';
import { addDays, dateRange, localDate, localMidnightUtc } from '../time';
import { getLeagues, loadFixtures } from '../sports/fixtures';
import type { Fixture, OddsSnapshot } from '../sports/types';
import { runAutomation } from '../automation';

/** Cloudflare requests read the persisted offer, never fan out to 77 providers. */
export async function storedCatalog(start=localDate(),count=8) {
  const [leagues,meta,rows]=await Promise.all([
    getLeagues({top10Only:false}),
    one<{payload:{fetchedAt?:string;errors?:string[]}}>("SELECT payload FROM sports_catalog_cache WHERE provider='espn-catalog'"),
    many<{id:string;provider:Fixture['provider'];provider_id:string;league_id:string;home_team:string;away_team:string;home_team_id:string|null;away_team_id:string|null;home_logo:string|null;away_logo:string|null;kickoff_utc:Date;status:Fixture['status'];home_score:number|null;away_score:number|null;source_observed_at:Date|null;bookmaker:string|null;source:string|null;markets:OddsSnapshot['markets']|null;observed_at:Date|null;provider_updated_at:Date|null}>(
      `SELECT f.*,o.bookmaker,o.source,o.markets,o.observed_at,o.provider_updated_at FROM fixtures f
       LEFT JOIN odds_snapshots o ON o.id=(SELECT id FROM odds_snapshots WHERE fixture_id=f.id ORDER BY id DESC LIMIT 1)
       WHERE f.kickoff_utc >= $1 AND f.kickoff_utc < $2 ORDER BY f.kickoff_utc LIMIT 2000`,
      [localMidnightUtc(start).toISOString().replace('Z','000Z'),localMidnightUtc(addDays(start,count)).toISOString().replace('Z','000Z')]),
  ]);
  const byId=new Map(leagues.map(l=>[l.id,l]));
  const fixtures:Fixture[]=rows.flatMap(r=>{
    const league=byId.get(r.league_id);if(!league)return [];
    return [{id:r.id,provider:r.provider,providerId:r.provider_id,leagueId:league.id,leagueKey:league.providerKey,leagueName:league.name,country:league.country,
      home:r.home_team,away:r.away_team,homeTeamId:r.home_team_id??undefined,awayTeamId:r.away_team_id??undefined,homeLogo:r.home_logo??undefined,awayLogo:r.away_logo??undefined,
      kickoff:r.kickoff_utc.toISOString(),status:r.status,homeScore:r.home_score,awayScore:r.away_score,fetchedAt:(r.source_observed_at??r.kickoff_utc).toISOString(),
      odds:r.markets&&r.bookmaker&&r.observed_at?{bookmaker:r.bookmaker,source:r.source??'',markets:r.markets,observedAt:r.observed_at.toISOString(),providerUpdatedAt:r.provider_updated_at?.toISOString()??null}:null}];
  });
  const at=Date.parse(meta?.payload.fetchedAt??'')||0;
  return {data:{fixtures,leagues,days:dateRange(start,count),errors:meta?.payload.errors??[],fetchedAt:at?new Date(at).toISOString():''},at,refreshing:!at||Date.now()-at>3600_000};
}

/** Render only; no AI. The shared lease prevents two instances refreshing together. */
export async function refreshStoredCatalog(){
  return runAutomation('fixture-catalog',async()=>{
    const cached=await one<{payload:{fetchedAt?:string}}>("SELECT payload FROM sports_catalog_cache WHERE provider='espn-catalog'");
    if(Date.now()-Date.parse(cached?.payload.fetchedAt??'')<3600_000)return {cached:true};
    const data=await loadFixtures(localDate(),8,{top10Only:false,persist:true});
    const detail={fetchedAt:data.fetchedAt,errors:data.errors};
    await query("INSERT INTO sports_catalog_cache(provider,payload) VALUES('espn-catalog',$1) ON CONFLICT(provider) DO UPDATE SET payload=excluded.payload",[JSON.stringify(detail)]);
    return {fixtures:data.fixtures.length,sourceErrors:data.errors.length};
  });
}
