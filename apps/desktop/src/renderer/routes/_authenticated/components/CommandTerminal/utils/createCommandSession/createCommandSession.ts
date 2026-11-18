export interface TerminalSize {
	cols: number;
	rows: number;
}

type CommandEvent =
	| { type: "data"; data: string }
	| { type: "exit"; exitCode: number; signal?: number }
	| { type: "error"; error: string }
	| { type: "disconnect"; reason: string };

export interface CommandTransport {
	subscribe(handlers: {
		onStarted: () => void;
		onData: (event: CommandEvent) => void;
		onError: (error: unknown) => void;
	}): { unsubscribe(): void };
	create(size: TerminalSize): Promise<unknown>;
	write(data: string): Promise<unknown>;
	resize(size: TerminalSize): Promise<unknown>;
	kill(): Promise<unknown>;
}

export function createCommandSession({
	transport,
	size,
	onOutput,
	onExit,
	onError,
}: {
	transport: CommandTransport;
	size: TerminalSize;
	onOutput: (data: string) => void;
	onExit: (code: number | null) => void;
	onError: (error: unknown) => void;
}) {
	let state: "waiting" | "starting" | "running" | "ended" | "disposed" =
		"waiting";
	const pendingInput: string[] = [];
	const finished = () => state === "ended" || state === "disposed";
	const kill = () => void transport.kill().catch(onError);
	const finish = (code: number | null, error?: unknown) => {
		if (state === "ended" || state === "disposed") return;
		const wasRunning = state === "running";
		state = "ended";
		pendingInput.length = 0;
		if (error !== undefined) {
			if (wasRunning) kill();
			onError(error);
		}
		onExit(code);
	};
	const fail = (error: unknown) => finish(null, error);
	const write = (data: string) => {
		if (state === "waiting" || state === "starting") pendingInput.push(data);
		else if (state === "running") void transport.write(data).catch(fail);
	};
	const resize = (nextSize: TerminalSize) => {
		size = nextSize;
		if (state === "running") void transport.resize(size).catch(fail);
	};
	const start = async () => {
		if (state !== "waiting") return;
		state = "starting";
		try {
			await transport.create(size);
			if (finished()) {
				kill();
				return;
			}
			state = "running";
			resize(size);
			for (const data of pendingInput.splice(0)) write(data);
		} catch (error) {
			fail(error);
		}
	};
	const subscription = transport.subscribe({
		onStarted: () => void start(),
		onData: (event) => {
			if (state === "ended" || state === "disposed") return;
			switch (event.type) {
				case "data":
					onOutput(event.data);
					break;
				case "exit":
					finish(event.signal ? 128 + event.signal : event.exitCode);
					break;
				case "error":
					fail(new Error(event.error));
					break;
				case "disconnect":
					fail(new Error(event.reason));
					break;
			}
		},
		onError: fail,
	});
	return {
		write,
		resize,
		dispose() {
			if (state === "disposed") return;
			const wasRunning = state === "running";
			state = "disposed";
			pendingInput.length = 0;
			subscription.unsubscribe();
			if (wasRunning) kill();
		},
	};
}
