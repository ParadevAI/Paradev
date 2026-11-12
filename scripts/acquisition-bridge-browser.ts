import { acquisitionEntry } from "../apps/web/src/lib/acquisition-entry";
import { createBridgeHttp } from "../packages/shared/src/acquisition-bridge/http";
import {
	type AcquisitionKV,
	type IdentifyEvent,
	LINEAGE_CAS_SCRIPT,
} from "../packages/shared/src/acquisition-bridge/server";

class FixtureStore implements AcquisitionKV {
	private records = new Map<string, { value: unknown; expires: number }>();
	async get<T>(key: string): Promise<T | null> {
		const record = this.records.get(key);
		return record && record.expires > Date.now()
			? (structuredClone(record.value) as T)
			: null;
	}
	async getdel<T>(key: string): Promise<T | null> {
		const value = await this.get<T>(key);
		this.records.delete(key);
		return value;
	}
	async set(key: string, value: unknown, options: { ex?: number } = {}) {
		this.records.set(key, {
			value: structuredClone(value),
			expires: Date.now() + (options.ex ?? 86400) * 1000,
		});
		return "OK";
	}
	async eval(script: string, keys: string[], args: (string | number)[]) {
		if (script !== LINEAGE_CAS_SCRIPT) return 1;
		const old = await this.get<{ revision: number }>(keys[0] ?? "");
		if (!old || old.revision !== args[0]) return 0;
		await this.set(keys[0] ?? "", JSON.parse(String(args[1])), {
			ex: Number(args[2]),
		});
		return 1;
	}
}
const marketing = "http://localhost:41331";
const web = "http://127.0.0.1:41332";
const http = createBridgeHttp({
	kv: new FixtureStore(),
	marketingOrigin: marketing,
	webOrigin: web,
	consentKey: "superset-analytics-consent",
});
const events: IdentifyEvent[] = [];
const built = await Bun.build({
	entrypoints: ["apps/marketing/src/lib/analytics/acquisition-client.ts"],
	target: "browser",
});
if (!built.success) throw new Error(String(built.logs));
const script = await built.outputs[0]?.text();
const page = (html: string) =>
	new Response(html, {
		headers: { "Content-Type": "text/html", "Cache-Control": "no-store" },
	});
Bun.serve({
	hostname: "0.0.0.0",
	port: 41331,
	async fetch(request) {
		const url = new URL(request.url);
		if (url.pathname.startsWith("/api/acquisition/"))
			return http.marketing(request, url.pathname.split("/").pop() ?? "");
		if (url.pathname === "/client.js")
			return new Response(script, {
				headers: { "Content-Type": "application/javascript" },
			});
		if (url.pathname === "/sdk.js")
			return new Response(
				Bun.file(
					"apps/marketing/node_modules/posthog-js/dist/array.full.no-external.js",
				),
				{ headers: { "Content-Type": "application/javascript" } },
			);
		if (url.pathname.startsWith("/ingest"))
			return Response.json({
				featureFlags: {},
				config: {},
				errorsWhileComputingFlags: false,
			});
		return page(
			`<html><body><script src="/sdk.js"></script><script type="module">const choice=new URL(location.href).searchParams.get('choice');if(choice)localStorage.setItem('superset-analytics-consent',choice);const client=await import('/client.js');const id=await client.syncAcquisition();posthog.init('phc_fixture',{api_host:location.origin+'/ingest',persistence:'cookie',person_profiles:'always',capture_pageview:false,capture_pageleave:false,autocapture:false,disable_session_recording:true,advanced_disable_feature_flags:true,...(id?{bootstrap:{distinctID:id,isIdentifiedID:false}}:{})});posthog.capture('fixture_marketing_touch');window.fixture={id:posthog.get_distinct_id(),state:posthog.get_property('$user_state'),choice:client.acquisitionConsent()};document.body.dataset.ready='yes';</script><a id="signup" href="${web}/sign-up">Fixture signup</a><a id="desktop" href="${web}/auth/desktop/success?desktop_state=fixture-state&desktop_protocol=superset&desktop_local_callback=http%3A%2F%2F127.0.0.1%3A4567%2Fauth%2Fcallback">Fixture desktop continuation</a></body></html>`,
		);
	},
});
Bun.serve({
	hostname: "0.0.0.0",
	port: 41332,
	async fetch(request) {
		const url = new URL(request.url);
		if (url.pathname === "/events") return Response.json(events);
		if (url.pathname.startsWith("/api/acquisition/")) {
			const action = url.pathname.split("/").pop() ?? "";
			if (action === "bind")
				return http.bind(request, "fixture-account-a", async (event) => {
					events.push(event);
				});
			return http.web(request, action);
		}
		const entry = acquisitionEntry(url, request.headers);
		if (entry) return Response.redirect(entry);
		return page(
			`<html><body>Fixture auth continuation (not real OAuth/native session)<script>fetch('/api/acquisition/bind',{method:'POST'}).then(()=>document.body.dataset.ready='yes');</script></body></html>`,
		);
	},
});
console.log(
	"Local-only browser fixture: localhost:41331 (marketing), 127.0.0.1:41332 (web). In-memory KV and fixture auth/capture, actual bridge handlers and pinned marketing SDK/client. No production calls.",
);
