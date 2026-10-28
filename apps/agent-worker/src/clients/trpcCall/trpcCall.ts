import SuperJSON from "superjson";

export class TrpcCallError extends Error {
	constructor(
		message: string,
		readonly status: number,
		readonly code: string | null,
	) {
		super(message);
		this.name = "TrpcCallError";
	}
}

export interface TrpcCallOptions {
	fetch?: typeof fetch;
	timeoutMs?: number;
}

type SuperJsonResult = Parameters<typeof SuperJSON.deserialize>[0];

/** One tRPC mutation over HTTP with superjson, without importing the server's router types. */
export async function trpcMutation<T>(
	url: string,
	headers: Record<string, string>,
	input: unknown,
	options: TrpcCallOptions = {},
): Promise<T> {
	const fetcher = options.fetch ?? fetch;
	const response = await fetcher(url, {
		method: "POST",
		headers: { "content-type": "application/json", ...headers },
		body: JSON.stringify(SuperJSON.serialize(input)),
		signal: AbortSignal.timeout(options.timeoutMs ?? 60_000),
	});
	const text = await response.text();
	if (!response.ok) {
		let message = text;
		let code: string | null = null;
		try {
			const parsed = JSON.parse(text) as {
				error?: { json?: { message?: string; data?: { code?: string } } };
			};
			message = parsed.error?.json?.message ?? text;
			code = parsed.error?.json?.data?.code ?? null;
		} catch {}
		throw new TrpcCallError(message, response.status, code);
	}
	const parsed = JSON.parse(text) as { result: { data: SuperJsonResult } };
	return SuperJSON.deserialize<T>(parsed.result.data);
}
