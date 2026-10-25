import {expect,test} from "bun:test";
import {createClaudeResetEnvelope} from "./claude-reset-envelope";
import type {createClaudeRequestClient} from "./claude-request";
type Request=ReturnType<typeof createClaudeRequestClient>["request"];
const time=Date.parse("2026-10-25T12:00:00Z");
const body={five_hour:{utilization:32},cedar_ember:{eligible:true,grants:[{resets_left:3,paused:false}]}};
test("one primary body supplies quota and reset counts without a second tracker",async()=>{
 const calls:string[]=[]; let clock=time;
 const request:Request=async(_endpoint,_token,url)=>{calls.push(url);return Response.json(body);};
 const read=createClaudeResetEnvelope(request,()=>clock);
 const first=await read("token","https://synthetic/usage",{});
 expect((await first.response.json()).five_hour.utilization).toBe(32);
 expect(first.resetCredits?.availableCount).toBe(3);
 clock+=60000;
 const second=await read("token","https://synthetic/usage",{});
 expect(calls).toEqual(["https://synthetic/usage?cedar_ember=1","https://synthetic/usage"]);
 expect(second.resetCredits?.checkedAt.getTime()).toBe(time);
});
test("unsupported inventory falls back once under the same signal; auth and429 do not retry",async()=>{
 const signal=new AbortController().signal;
 const calls:string[]=[];
 const read=createClaudeResetEnvelope(async(_e,_t,url,init)=>{expect(init.signal).toBe(signal);calls.push(url);return calls.length===1?new Response(null,{status:403}):Response.json({five_hour:{utilization:12}});},()=>time);
 expect((await read("token","https://synthetic/usage",{signal})).response.ok).toBe(true);
 expect(calls).toHaveLength(2);
 for(const status of [401,429,503]) {
  let count=0;const r=createClaudeResetEnvelope(async()=>{count++;return new Response(null,{status});},()=>time);
  expect((await r("other","https://synthetic/usage",{})).resetCredits).toBeUndefined();expect(count).toBe(1);
 }
});
test("expired or rotated inventory never masquerades as a current exact count",async()=>{
 let clock=time;let ok=true;
 const read=createClaudeResetEnvelope(async()=>ok?Response.json(body):new Response(null,{status:429}),()=>clock);
 expect((await read("a","https://synthetic/usage",{})).resetCredits?.availableCount).toBe(3);
 ok=false;clock+=15*60000+1;
 expect((await read("a","https://synthetic/usage",{})).resetCredits).toBeUndefined();
 expect((await read("b","https://synthetic/usage",{})).resetCredits).toBeUndefined();
});
