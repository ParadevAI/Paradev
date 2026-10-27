import type { HostJobs } from "@superset/agent-harness";
import { type TrpcCallOptions, trpcMutation } from "../trpcCall";

export interface HostTarget {
	url: string;
	bearer: string;
	headers?: Record<string, string>;
}

export function callHost<T>(
	target: HostTarget,
	procedure: string,
	input: unknown,
	options: TrpcCallOptions = {},
): Promise<T> {
	return trpcMutation<T>(
		`${target.url}/trpc/agentJobs.${procedure}`,
		{ authorization: `Bearer ${target.bearer}`, ...(target.headers ?? {}) },
		input,
		options,
	);
}

export function httpHostJobs(
	target: HostTarget,
	options: TrpcCallOptions = {},
): HostJobs {
	const call = <T>(procedure: string, input: unknown) =>
		callHost<T>(target, procedure, input, options);
	return {
		exec: (input) => call("exec", input),
		output: (input) => call("output", input),
		kill: (input) => call("kill", input),
		readFile: (input) => call("readFile", input),
		writeFile: (input) => call("writeFile", input),
		mkdir: (input) => call("mkdir", input),
		stat: (input) => call("stat", input),
		readdir: (input) => call("readdir", input),
	};
}

export function hostContext(
	target: HostTarget,
	workspaceId: string,
	options: TrpcCallOptions = {},
): Promise<{ cwd: string; homeDir: string; platform: string }> {
	return callHost(target, "context", { workspaceId }, options);
}
