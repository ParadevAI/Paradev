import {expect, test} from "bun:test";
import {bindClaudeQuotaIdentity, copyQuotaIdentity} from "./quota-identity";
import {projectWidgetQuotaMetadata} from "./widget-quota-metadata";
import type {UsageAccount} from "./types";
const clock=Date.parse("2026-10-25T12:00:00Z");
const profile={account:{uuid:"12345678-1234-1234-1234-123456789abc",email:"synthetic@example.test"},organization:{uuid:"87654321-4321-4321-4321-cba987654321"}};
const base:UsageAccount={agent:"claude",credentialKind:"subscription",accountKey:"/synthetic/profile",sourceLabel:"Synthetic",email:"synthetic@example.test",plan:"max",status:"ok",statusDetail:null,windows:[],creditsBalance:null,extraUsage:null,selection:"/synthetic/profile",isDefault:false,fetchedAt:new Date(clock)};
test("transient quota failure preserves independently verified account color scope",()=>{
 const good=bindClaudeQuotaIdentity({...base},"synthetic-token",profile,clock);
 const current=projectWidgetQuotaMetadata(good,clock);
 const failed=copyQuotaIdentity(good,{...good,status:"unavailable" as const,fetchedAt:new Date(clock+60000)});
 expect(projectWidgetQuotaMetadata(failed,clock+60000).quotaIdentity).toBe(current.quotaIdentity);
 expect(current.quotaIdentity).toMatch(/^[a-f0-9]{64}$/);
 expect(projectWidgetQuotaMetadata(failed,clock+6*60*60000+1).quotaIdentity).toBeUndefined();
});
test("sign-out, revoked proof, changed owner and unknown discovery cannot inherit color scope",()=>{
 const good=bindClaudeQuotaIdentity({...base},"synthetic-token",profile,clock);
 const first=projectWidgetQuotaMetadata(good,clock);
 for(const status of ["signed_out","token_expired"] as const)
  expect(projectWidgetQuotaMetadata(copyQuotaIdentity(good,{...good,status}),clock).quotaIdentity).toBeUndefined();
 expect(projectWidgetQuotaMetadata({...base,quotaIdentity:first.quotaIdentity},clock).quotaIdentity).toBeUndefined();
 const changed=bindClaudeQuotaIdentity({...base},"new-token",{...profile,organization:{uuid:"00000000-0000-0000-0000-000000000001"}},clock);
 expect(projectWidgetQuotaMetadata(changed,clock).quotaIdentity).not.toBe(first.quotaIdentity);
 expect(projectWidgetQuotaMetadata({...base,discoveryFailed:true},clock).sourceId).toBeUndefined();
});
