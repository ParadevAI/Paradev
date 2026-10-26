type Schedule = (callback: () => void, delay: number) => () => void;

const schedule: Schedule = (callback, delay) => {
	const timer = setTimeout(callback, delay);
	return () => clearTimeout(timer);
};

export class EdgeTransition {
	current: number | null = null;
	private sequence = 0;
	private timer: (() => void) | undefined;
	constructor(
		private readonly settled: () => void,
		private readonly scheduleTimer: Schedule = schedule,
	) {}
	begin() {
		this.cancel();
		const id = ++this.sequence;
		this.current = id;
		this.timer = this.scheduleTimer(() => this.complete(id), 1200);
		return id;
	}
	complete(id: unknown) {
		if (this.current === null || id !== this.current) return;
		this.cancel();
		this.settled();
	}
	cancel() {
		this.timer?.();
		this.timer = undefined;
		this.current = null;
	}
}
