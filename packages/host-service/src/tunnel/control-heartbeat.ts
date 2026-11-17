export const PING_INTERVAL_MS = 15_000;
export const MIN_PONG_TIMEOUT_MS = 5_000;
export const MAX_PONG_TIMEOUT_MS = 10_000;
const PONG_TIMEOUT_RTT_MULTIPLIER = 4;
const RTT_SAMPLES = 8;

export interface ControlHeartbeatOptions {
	sendPing: () => void;
	onDead: (details: { silentForMs: number; pongTimeoutMs: number }) => void;
	pingIntervalMs?: number;
	minPongTimeoutMs?: number;
	maxPongTimeoutMs?: number;
}

// Pings while the control socket is open and declares it dead when a ping
// gets no inbound frame back within a deadline scaled to the observed pong
// round trip. A half-open socket is then found within one ping interval plus
// that deadline, not after a fixed silence window.
export class ControlHeartbeat {
	private readonly options: Required<ControlHeartbeatOptions>;
	private pingTimer: ReturnType<typeof setInterval> | null = null;
	private pongTimer: ReturnType<typeof setTimeout> | null = null;
	private pingSentAt: number | null = null;
	private lastInboundAt = 0;
	private readonly rtts: number[] = [];

	constructor(options: ControlHeartbeatOptions) {
		this.options = {
			pingIntervalMs: PING_INTERVAL_MS,
			minPongTimeoutMs: MIN_PONG_TIMEOUT_MS,
			maxPongTimeoutMs: MAX_PONG_TIMEOUT_MS,
			...options,
		};
	}

	start(): void {
		this.stop();
		this.lastInboundAt = performance.now();
		this.pingTimer = setInterval(
			() => this.ping(),
			this.options.pingIntervalMs,
		);
	}

	stop(): void {
		if (this.pingTimer) clearInterval(this.pingTimer);
		if (this.pongTimer) clearTimeout(this.pongTimer);
		this.pingTimer = null;
		this.pongTimer = null;
		this.pingSentAt = null;
	}

	onInbound(isPong: boolean): void {
		const now = performance.now();
		this.lastInboundAt = now;
		if (this.pingSentAt === null) return;
		if (isPong) {
			this.rtts.push(now - this.pingSentAt);
			if (this.rtts.length > RTT_SAMPLES) this.rtts.shift();
		}
		this.pingSentAt = null;
		if (this.pongTimer) clearTimeout(this.pongTimer);
		this.pongTimer = null;
	}

	pongTimeoutMs(): number {
		const { minPongTimeoutMs, maxPongTimeoutMs } = this.options;
		if (this.rtts.length === 0) return maxPongTimeoutMs;
		const scaled = Math.max(...this.rtts) * PONG_TIMEOUT_RTT_MULTIPLIER;
		return Math.min(Math.max(scaled, minPongTimeoutMs), maxPongTimeoutMs);
	}

	private ping(): void {
		this.options.sendPing();
		if (this.pingSentAt !== null) return;
		this.pingSentAt = performance.now();
		const pongTimeoutMs = this.pongTimeoutMs();
		this.pongTimer = setTimeout(() => {
			this.pongTimer = null;
			if (this.pingSentAt === null) return;
			const silentForMs = performance.now() - this.lastInboundAt;
			this.stop();
			this.options.onDead({ silentForMs, pongTimeoutMs });
		}, pongTimeoutMs);
	}
}
