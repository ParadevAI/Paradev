import SuperJSON from "superjson";

/**
 * Minimal tRPC-over-HTTP client for cloud API → relay → host-service calls.
 *
 * We don't import the host-service's AppRouter type here because it would
 * pull host-only modules (better-sqlite3, node-pty, etc) into the cloud
 * bundle. Instead, each caller inlines the input/output types they need
 * and this helper just handles transport.
 */
export interface RelayClientOptions {
	relayUrl: string;
	hostId: string;
	jwt: string;
	timeoutMs?: number;
}

export class RelayDispatchError extends Error {
	constructor(
		message: string,
		public readonly status: number,
		public readonly body: string,
	) {
		super(message);
		this.name = "RelayDispatchError";
	}
}

/**
 * Extract the host-side message from a tRPC error envelope so callers store
 * "agents.run: Workspace … not found" instead of the raw JSON blob.
 */
function parseTrpcErrorMessage(rawBody: string): string | null {
	try {
		const parsed = JSON.parse(rawBody) as {
			error?: { json?: { message?: unknown } };
		};
		const message = parsed.error?.json?.message;
		return typeof message === "string" ? message : null;
	} catch {
		return null;
	}
}

/**
 * Invoke a single host-service tRPC mutation through the relay proxy.
 *
 * tRPC HTTP protocol (non-batched): POST body is `{ json: <input> }` when
 * using SuperJSON transformer, and the server response is
 * `{ result: { data: { json: <output> } } }`.
 */
export function relayMutation<TInput, TOutput>(
	options: RelayClientOptions,
	procedure: string,
	input: TInput,
): Promise<TOutput> {
	return hostServiceMutation(
		{
			baseUrl: `${options.relayUrl}/hosts/${options.hostId}`,
			headers: { authorization: `Bearer ${options.jwt}` },
			timeoutMs: options.timeoutMs,
		},
		procedure,
		input,
	);
}

/** {@link relayMutation} for a host-service query, which tRPC serves on GET. */
export function relayQuery<TInput, TOutput>(
	options: RelayClientOptions,
	procedure: string,
	input: TInput,
): Promise<TOutput> {
	return hostServiceQuery(
		{
			baseUrl: `${options.relayUrl}/hosts/${options.hostId}`,
			headers: { authorization: `Bearer ${options.jwt}` },
			timeoutMs: options.timeoutMs,
		},
		procedure,
		input,
	);
}

export type HostServiceOptions = {
	baseUrl: string;
	headers: Record<string, string>;
	timeoutMs?: number;
};

/** {@link relayMutation} against any host-service base URL, such as a sandbox's. */
export function hostServiceMutation<TInput, TOutput>(
	options: HostServiceOptions,
	procedure: string,
	input: TInput,
): Promise<TOutput> {
	return hostServiceRequest(options, procedure, {
		method: "POST",
		url: `${options.baseUrl}/trpc/${procedure}`,
		body: JSON.stringify(SuperJSON.serialize(input)),
	});
}

/** {@link relayQuery} against any host-service base URL, such as a sandbox's. */
export function hostServiceQuery<TInput, TOutput>(
	options: HostServiceOptions,
	procedure: string,
	input: TInput,
): Promise<TOutput> {
	const encoded = encodeURIComponent(
		JSON.stringify(SuperJSON.serialize(input)),
	);
	return hostServiceRequest(options, procedure, {
		method: "GET",
		url: `${options.baseUrl}/trpc/${procedure}?input=${encoded}`,
	});
}

/**
 * True only when the host answered that it has no such procedure: a build that
 * predates it. Any other failure, a 404 for a missing workspace included, is not.
 */
export function isMissingProcedure(err: unknown, procedure: string): boolean {
	return (
		err instanceof RelayDispatchError &&
		err.status === 404 &&
		err.message === `${procedure}: No procedure found on path "${procedure}"`
	);
}

async function hostServiceRequest<TOutput>(
	options: HostServiceOptions,
	procedure: string,
	request: { method: "GET" | "POST"; url: string; body?: string },
): Promise<TOutput> {
	const controller = new AbortController();
	const timer = setTimeout(
		() => controller.abort(),
		options.timeoutMs ?? 25_000,
	);

	let response: Response;
	try {
		response = await fetch(request.url, {
			method: request.method,
			headers:
				request.method === "POST"
					? { "content-type": "application/json", ...options.headers }
					: options.headers,
			body: request.body,
			signal: controller.signal,
		});
	} finally {
		clearTimeout(timer);
	}

	const rawBody = await response.text();
	if (!response.ok) {
		const trpcMessage = parseTrpcErrorMessage(rawBody);
		throw new RelayDispatchError(
			trpcMessage
				? `${procedure}: ${trpcMessage}`
				: `relay ${response.status}: ${rawBody.slice(0, 500)}`,
			response.status,
			rawBody,
		);
	}

	type TrpcEnvelope = { result?: { data?: unknown } };
	let parsed: TrpcEnvelope;
	try {
		parsed = JSON.parse(rawBody) as TrpcEnvelope;
	} catch {
		throw new RelayDispatchError(
			`invalid JSON from relay: ${rawBody.slice(0, 200)}`,
			response.status,
			rawBody,
		);
	}

	if (!parsed.result || parsed.result.data === undefined) {
		throw new RelayDispatchError(
			`missing result.data in relay response: ${rawBody.slice(0, 200)}`,
			response.status,
			rawBody,
		);
	}

	return SuperJSON.deserialize(parsed.result.data as never) as TOutput;
}
