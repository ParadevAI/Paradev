import { createHash } from "node:crypto";
import type { SessionAccount } from "../trpc/router/usage/session-account/session-account";
export interface BackgroundAdoptionSource {
	terminalId: string;
	workspaceId: string;
	launchId: string;
	sessionId: string;
	account: SessionAccount;
	definitionId: string | null;
	startedAt: number;
}
export interface BackgroundAdoptionGrantInput {
	source: BackgroundAdoptionSource;
	terminalId: string;
	cwd: string;
	adoptedAt: number;
	worker: { pid: number; birthHash: string };
}
function hash(value: unknown) {
	return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
export function backgroundWorkerBirthHash(birth: string) {
	return hash(birth).slice(0, 32);
}
export function backgroundAdoptionLaunchId(
	input: BackgroundAdoptionGrantInput,
): string {
	const a = input.source.account;
	const scope = [
		a.agent,
		a.selection,
		a.directory,
		a.identity,
		a.credentialKind,
		a.pinned === true,
		a.conflict === true,
	];
	const digest = hash([
		"background-adoption-v1",
		input.source.terminalId,
		input.source.workspaceId,
		input.source.launchId,
		input.source.sessionId,
		input.source.definitionId,
		input.source.startedAt,
		scope,
		input.terminalId,
		input.cwd,
		input.adoptedAt,
		input.worker.pid,
		input.worker.birthHash,
	]);
	return `bg1:${input.worker.pid}:${input.worker.birthHash}:${digest}`;
}
export function parseBackgroundAdoptionLaunchId(
	launchId: string | null | undefined,
) {
	const match = /^bg1:([1-9]\d{0,9}):([a-f0-9]{32}):[a-f0-9]{64}$/.exec(
		launchId ?? "",
	);
	const pid = Number(match?.[1]);
	return match && Number.isSafeInteger(pid) && pid <= 2_147_483_647
		? { pid, birthHash: match[2] as string }
		: null;
}
