// Usage: bun --env-file=<file with VERCEL_OIDC_TOKEN or AI_GATEWAY_API_KEY> scripts/evalChannelRouter.ts [--holdout]
import { routeChannelMessage } from "../channelRouter";
import { type EvalCase, evalSet, holdoutSet } from "../evalSet";

const CONCURRENCY = 5;

interface CaseResult {
	evalCase: EvalCase;
	devIds: string[];
	scores: Record<string, number>;
	ms: number;
}

function gatewayToken(): string {
	const token =
		process.env.AI_GATEWAY_API_KEY ??
		process.env.VERCEL_AI_GATEWAY_KEY ??
		process.env.VERCEL_OIDC_TOKEN;
	if (!token) {
		throw new Error(
			"Set AI_GATEWAY_API_KEY, VERCEL_AI_GATEWAY_KEY or VERCEL_OIDC_TOKEN",
		);
	}
	return token;
}

async function runCase(evalCase: EvalCase, token: string): Promise<CaseResult> {
	const start = performance.now();
	const decision = await routeChannelMessage(
		{
			channelName: evalCase.channelName,
			message: evalCase.message,
			recent: evalCase.recent,
			devs: evalCase.devs,
		},
		{ fetch, token: async () => token, timeoutMs: 10_000 },
	);
	return { evalCase, ...decision, ms: performance.now() - start };
}

async function runAll(cases: EvalCase[], token: string): Promise<CaseResult[]> {
	const results: CaseResult[] = [];
	let next = 0;
	await Promise.all(
		Array.from({ length: CONCURRENCY }, async () => {
			for (let index = next++; index < cases.length; index = next++) {
				const evalCase = cases[index];
				if (evalCase) results[index] = await runCase(evalCase, token);
			}
		}),
	);
	return results;
}

function percentile(sorted: number[], fraction: number): number {
	return (
		sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ??
		0
	);
}

function percent(value: number): string {
	return `${(value * 100).toFixed(1)}%`;
}

function report(results: CaseResult[]) {
	let truePositives = 0;
	let falsePositives = 0;
	let falseNegatives = 0;
	let exact = 0;
	let nobodyCases = 0;
	let nobodyRouted = 0;
	const misses: CaseResult[] = [];
	for (const result of results) {
		const expected = new Set(result.evalCase.expected);
		for (const id of result.devIds) {
			if (expected.has(id)) truePositives++;
			else falsePositives++;
		}
		for (const id of expected)
			if (!result.devIds.includes(id)) falseNegatives++;
		const isExact =
			result.devIds.length === expected.size &&
			result.devIds.every((id) => expected.has(id));
		if (isExact) exact++;
		else misses.push(result);
		if (expected.size === 0) {
			nobodyCases++;
			if (result.devIds.length > 0) nobodyRouted++;
		}
	}
	const latencies = results.map((result) => result.ms).sort((a, b) => a - b);
	console.log(`cases: ${results.length} (${nobodyCases} nobody)`);
	console.log(
		`precision: ${percent(truePositives / (truePositives + falsePositives || 1))}`,
	);
	console.log(
		`recall: ${percent(truePositives / (truePositives + falseNegatives || 1))}`,
	);
	console.log(
		`false-positive rate on nobody cases: ${percent(nobodyRouted / (nobodyCases || 1))}`,
	);
	console.log(`exact match: ${percent(exact / results.length)}`);
	console.log(
		`latency p50: ${Math.round(percentile(latencies, 0.5))}ms  p95: ${Math.round(percentile(latencies, 0.95))}ms`,
	);
	console.log(`\nmisclassified (${misses.length}):`);
	for (const miss of misses) {
		const scores = Object.entries(miss.scores)
			.map(([id, score]) => `${id}=${score.toFixed(2)}`)
			.join(" ");
		console.log(
			`  [${miss.evalCase.kind}] ${miss.evalCase.id}: expected [${miss.evalCase.expected.join(",")}] got [${miss.devIds.join(",")}] ${scores}`,
		);
		console.log(
			`    ${miss.evalCase.message.authorName}: ${miss.evalCase.message.body}`,
		);
	}
}

const cases = process.argv.includes("--holdout") ? holdoutSet : evalSet;
report(await runAll(cases, gatewayToken()));
