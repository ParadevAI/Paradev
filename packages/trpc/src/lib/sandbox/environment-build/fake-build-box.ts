import type { BuildCommandState } from "../vercel";

const CHECKOUT_MS = 2_000;
const INSTALL_MS = 20_000;
const STOP_MS = 3_000;
const FAKE_COMMIT = "f".repeat(40);

interface FakeCommand {
	startedAt: number;
	durationMs: number;
	exitCode: number;
	lines: (elapsedMs: number) => string[];
}

interface FakeBox {
	snapshotId: string | null;
	stoppedAt: number | null;
	commands: Map<string, FakeCommand>;
}

const shared = globalThis as { __fakeBuildBoxes?: Map<string, FakeBox> };
shared.__fakeBuildBoxes ??= new Map();
const boxes = shared.__fakeBuildBoxes;

function log(message: string): void {
	console.log(`[fake-build-box] ${message}`);
}

function boxNamed(name: string): FakeBox {
	const box = boxes.get(name);
	if (!box) throw new Error(`No fake build box ${name}`);
	return box;
}

/** In-memory stand-in for the Vercel calls a build makes; a dev and test tool only. */
export const fakeBuildBox = {
	async createBuildBox(args: { name: string }): Promise<void> {
		const existing = boxes.get(args.name);
		if (existing) {
			log(`create ${args.name}: exists, not created again`);
			return;
		}
		boxes.set(args.name, {
			snapshotId: null,
			stoppedAt: null,
			commands: new Map(),
		});
		log(`create ${args.name}`);
	},

	async startBuildCommand(args: {
		name: string;
		key: string;
		env: Record<string, string>;
	}): Promise<void> {
		const box = boxNamed(args.name);
		if (box.commands.has(args.key)) {
			log(`start ${args.name}/${args.key}: already started`);
			return;
		}
		const install = args.key === "install";
		const failing = install && Boolean(args.env.FAIL_INSTALL);
		box.commands.set(args.key, {
			startedAt: Date.now(),
			durationMs: install ? INSTALL_MS : CHECKOUT_MS,
			exitCode: failing ? 3 : 0,
			lines: install
				? (elapsed) => [
						...Array.from(
							{ length: Math.min(20, Math.floor(elapsed / 1000)) },
							(_, index) => `fake [install] line ${index + 1}`,
						),
						...(failing && elapsed >= INSTALL_MS
							? ["FAIL_INSTALL is set"]
							: []),
					]
				: (elapsed) => (elapsed >= CHECKOUT_MS ? [FAKE_COMMIT] : []),
		});
		log(`start ${args.name}/${args.key} detached`);
	},

	async readBuildCommand(args: {
		name: string;
		key: string;
	}): Promise<BuildCommandState> {
		const command = boxNamed(args.name).commands.get(args.key);
		if (!command) throw new Error(`No fake command ${args.key}`);
		const elapsed = Date.now() - command.startedAt;
		const done = elapsed >= command.durationMs;
		const state = {
			exitCode: done ? command.exitCode : null,
			tail: command.lines(elapsed).slice(-40).join("\n"),
		};
		log(
			`read ${args.name}/${args.key}: ${done ? `exit ${state.exitCode}` : "running"}`,
		);
		return state;
	},

	async buildBoxSnapshotId(name: string): Promise<string | null> {
		return boxes.get(name)?.snapshotId ?? null;
	},

	async stopBuildBox(name: string): Promise<void> {
		const box = boxNamed(name);
		if (box.stoppedAt !== null) return;
		box.stoppedAt = Date.now();
		log(`stop ${name}`);
	},

	async buildBoxSnapshotTaken(
		name: string,
		previous: string | null,
	): Promise<boolean> {
		const box = boxNamed(name);
		if (box.stoppedAt === null || Date.now() - box.stoppedAt < STOP_MS) {
			log(`snapshot ${name}: not yet`);
			return false;
		}
		box.snapshotId ??= `snap_fake_${name}`;
		log(`snapshot ${name}: taken`);
		return box.snapshotId !== previous;
	},

	async deleteSandbox(name: string): Promise<void> {
		boxes.delete(name);
		log(`delete ${name}`);
	},
};
