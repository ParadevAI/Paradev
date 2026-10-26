type Schedule = (callback: () => void, delay: number) => () => void;

const schedule: Schedule = (callback, delay) => {
	const timer = setTimeout(callback, delay);
	return () => clearTimeout(timer);
};

export function pointInsideBounds(
	point: { x: number; y: number },
	bounds: { x: number; y: number; width: number; height: number },
): boolean {
	return (
		point.x >= bounds.x &&
		point.x < bounds.x + bounds.width &&
		point.y >= bounds.y &&
		point.y < bounds.y + bounds.height
	);
}

export class HoverIntent {
	private timer: (() => void) | undefined;
	current: string | null = null;
	constructor(
		private readonly show: (accountId: string) => void,
		private readonly hide: () => void,
		private readonly pointerInsidePreview: () => boolean = () => false,
		private readonly scheduleTimer: Schedule = schedule,
	) {}
	enter(accountId: string) {
		this.clearTimer();
		if (this.current === accountId) return;
		if (this.current) {
			this.current = accountId;
			this.show(accountId);
			return;
		}
		this.timer = this.scheduleTimer(() => {
			this.timer = undefined;
			this.current = accountId;
			this.show(accountId);
		}, 300);
	}
	leave() {
		this.clearTimer();
		this.timer = this.scheduleTimer(() => {
			this.timer = undefined;
			if (this.current && this.pointerInsidePreview()) this.leave();
			else this.close();
		}, 180);
	}
	close() {
		this.clearTimer();
		this.current = null;
		this.hide();
	}
	private clearTimer() {
		this.timer?.();
		this.timer = undefined;
	}
}
