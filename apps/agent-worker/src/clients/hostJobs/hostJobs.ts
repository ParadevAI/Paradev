import { TrpcCallError, type TrpcCallOptions, trpcMutation } from "../trpcCall";

export interface HostTarget {
	url: string;
	bearer: string;
	headers?: Record<string, string>;
}

export interface HostCallOptions extends TrpcCallOptions {
	/** Delays between attempts while the host is briefly unreachable, such as a host-service restart. */
	retryDelaysMs?: number[];
	sleep?: (ms: number) => Promise<void>;
}

const RETRY_DELAYS_MS = [500, 1_000, 2_000, 4_000, 8_000, 15_000, 30_000];

/** Every agentJobs procedure is safe to repeat: exec dedupes on the call id. */
export async function callHost<T>(
	target: HostTarget,
	procedure: string,
	input: unknown,
	options: HostCallOptions = {},
): Promise<T> {
	const delays = options.retryDelaysMs ?? RETRY_DELAYS_MS;
	const sleep =
		options.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
	for (let attempt = 0; ; attempt++) {
		try {
			return await trpcMutation<T>(
				`${target.url}/trpc/agentJobs.${procedure}`,
				{ authorization: `Bearer ${target.bearer}`, ...(target.headers ?? {}) },
				input,
				options,
			);
		} catch (error) {
			const delay = delays[attempt];
			if (delay === undefined || !isUnreachable(error)) throw error;
			await sleep(delay);
		}
	}
}

function isUnreachable(error: unknown): boolean {
	if (error instanceof TrpcCallError)
		return [502, 503, 504].includes(error.status);
	return error instanceof TypeError;
}

export function hostContext(
	target: HostTarget,
	workspaceId: string,
	options: TrpcCallOptions = {},
): Promise<{ cwd: string; homeDir: string; platform: string }> {
	return callHost(target, "context", { workspaceId }, options);
}
