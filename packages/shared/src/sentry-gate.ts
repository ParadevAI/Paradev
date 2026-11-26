interface GateableTransport<Envelope, Response> {
	send(envelope: Envelope): PromiseLike<Response>;
	flush(timeout?: number): PromiseLike<boolean>;
}

export function gateSentryTransport<
	Options,
	Envelope,
	Response,
	T extends GateableTransport<Envelope, Response>,
>(
	makeTransport: (options: Options) => T,
	isEnabled: () => boolean,
): (options: Options) => T {
	return (options) => {
		const transport = makeTransport(options);
		return {
			...transport,
			send: (envelope: Envelope) =>
				isEnabled()
					? transport.send(envelope)
					: Promise.resolve({} as Response),
			flush: (timeout?: number) => transport.flush(timeout),
		};
	};
}
