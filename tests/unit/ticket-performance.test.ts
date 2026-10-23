import { expect,it } from 'vitest';
import { ticketPerformance,type PerformanceTicket } from '@/lib/ticket-performance';
const ticket=(outcome:string,legs:PerformanceTicket['selections'],generation='COMPLETED'):PerformanceTicket=>({generation_status:generation,outcome_status:outcome,actual_odds:4,selections:legs});
it('reports only the filtered ticket list and separates undecided, void and NO BET',()=>{
 const rows=[ticket('WON',[{outcome:'WON',odds:2,market_key:'DC:1X',model_probability:0.8}]),ticket('PENDING',[{outcome:'PENDING',odds:2,market_key:'DC:1X',model_probability:0.1}]),ticket('NOT_APPLICABLE',[],'NO_BET')];
 const all=ticketPerformance(rows);expect(all.tickets).toMatchObject({total:3,completed:2,won:1,pending:1,no_bet:1});
 expect(all.selections[0]).toMatchObject({n:2,won:1,pending:1,brier:expect.closeTo(0.04)});
 expect(ticketPerformance(rows.slice(0,1)).tickets).toMatchObject({total:1,won:1,pending:0});
});
it('uses only non-void prices for the hypothetical total of a partially void ticket',()=>{
 expect(ticketPerformance([ticket('PARTIAL_VOID',[{outcome:'WON',odds:2},{outcome:'VOID',odds:2}])]).tickets).toMatchObject({partial_void:1,units:1});
});
