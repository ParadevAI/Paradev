/**
 * Query function for a host-keyed query whose host may be unreachable.
 *
 * An invalidation runs the queryFn of whichever observer rendered last, even a
 * disabled one. Fail when unreachable: an error keeps the cached data, an
 * empty answer replaces it.
 */
export function hostQueryFn<T>(
	hostUrl: string | null,
	load: (hostUrl: string) => Promise<T>,
): () => Promise<T> {
	return async () => {
		if (!hostUrl) throw new HostUnreachableError();
		return load(hostUrl);
	};
}

export class HostUnreachableError extends Error {
	constructor() {
		super("Host is unreachable");
		this.name = "HostUnreachableError";
	}
}
