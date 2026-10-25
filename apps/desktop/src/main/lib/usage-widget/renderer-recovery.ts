export function isAbortedLoad(error: unknown) {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		error.code === "ERR_ABORTED"
	);
}

export class RendererRecovery {
	private pending: ReturnType<typeof setTimeout> | undefined;
	private attempts: number[] = [];
	private unavailable = false;
	private automaticBlocked = false;
	private disposed = false;

	constructor(
		private readonly reload: () => Promise<unknown>,
		private readonly alive: () => boolean,
		private readonly clock = Date.now,
		private readonly schedule = setTimeout,
		private readonly cancel = clearTimeout,
	) {}

	failed(automatic = true) {
		this.unavailable = true;
		if (!automatic) {
			this.automaticBlocked = true;
			this.cancelPending();
		}
		if (automatic) this.request(false);
	}

	private request(manual: boolean) {
		if (this.disposed || this.pending !== undefined || !this.alive()) return;
		if (manual) this.automaticBlocked = false;
		else if (this.automaticBlocked) return;
		const now = this.clock();
		this.attempts = this.attempts.filter((time) => now - time < 300_000);
		if (!manual && this.attempts.length >= 2) return;
		this.attempts.push(now);
		this.pending = this.schedule(() => {
			this.pending = undefined;
			if (this.disposed || this.automaticBlocked || !this.alive()) return;
			void Promise.resolve()
				.then(() => {
					if (!this.disposed && !this.automaticBlocked && this.alive())
						return this.reload();
				})
				.catch((error: unknown) => {
					if (!isAbortedLoad(error)) this.failed();
				});
		}, 500);
	}

	retry() {
		if (this.unavailable) this.request(true);
	}

	loaded() {
		this.unavailable = false;
		this.cancelPending();
	}

	dispose() {
		this.disposed = true;
		this.cancelPending();
	}

	private cancelPending() {
		if (this.pending !== undefined) this.cancel(this.pending);
		this.pending = undefined;
	}
}
