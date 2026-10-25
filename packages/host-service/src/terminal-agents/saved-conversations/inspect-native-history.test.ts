import { afterEach, expect, test } from "bun:test";
import {
	appendFile,
	mkdir,
	mkdtemp,
	open,
	realpath,
	rename,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
	assertNativeResumeHistoryCurrent,
	inspectNativeResumeHistory,
} from "./inspect-native-history";

const roots: string[] = [];
const sessionId = "11111111-2222-3333-4444-555555555555";
afterEach(async () => {
	await Promise.all(
		roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
	);
});

async function fixture(provider: "claude" | "codex" = "claude") {
	const temporary = await mkdtemp(join(tmpdir(), "resume-checkpoint-"));
	roots.push(temporary);
	const root = await realpath(temporary);
	const cwd = join(root, "workspace");
	const shared = join(root, "history");
	const sourceDirectory = join(root, "source");
	const targetDirectory = join(root, "target");
	const lockRoot = join(root, "locks");
	await Promise.all(
		[cwd, shared, sourceDirectory, targetDirectory, lockRoot].map((path) =>
			mkdir(path),
		),
	);
	const storeName = provider === "claude" ? "projects" : "sessions";
	for (const directory of [sourceDirectory, targetDirectory]) {
		await symlink(shared, join(directory, storeName));
		if (provider === "codex")
			await symlink(lockRoot, join(directory, "thread-writer-locks"));
	}
	const project = join(shared, "project");
	await mkdir(project);
	const path = join(
		project,
		provider === "claude"
			? `${sessionId}.jsonl`
			: `rollout-2026-10-25T10-10-10-${sessionId}.jsonl`,
	);
	const content =
		provider === "claude"
			? `${JSON.stringify({ type: "user", sessionId, cwd, uuid: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", message: { role: "user", content: "synthetic saved history" } })}\n`
			: `${JSON.stringify({ type: "session_meta", payload: { id: sessionId, cwd } })}\n${JSON.stringify({ type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "synthetic saved history" }] } })}\n`;
	await writeFile(path, content);
	return {
		root,
		path,
		content,
		input: { provider, sourceDirectory, targetDirectory, sessionId, cwd },
	};
}

function afterRead(action: () => Promise<void>): typeof open {
	return async (path, flags, mode) => {
		const file = await open(path, flags, mode);
		let changed = false;
		return new Proxy(file, {
			get(target, property) {
				if (property === "read")
					return async (
						buffer: Buffer,
						offset: number,
						length: number,
						position: number,
					) => {
						const result = await target.read(buffer, offset, length, position);
						if (!changed) {
							changed = true;
							await action();
						}
						return result;
					};
				const value = Reflect.get(target, property, target);
				return typeof value === "function" ? value.bind(target) : value;
			},
		});
	};
}

test.each([
	"claude",
	"codex",
] as const)("a stable exact %s history includes launch-time store checkpoints", async (provider) => {
	const f = await fixture(provider);
	const history = await inspectNativeResumeHistory(f.input);
	expect(history?.path).toBe(f.path);
	expect(history?.storeBindings).toHaveLength(provider === "claude" ? 2 : 4);
	if (!history) throw new Error("Missing fixture history");
	expect(() => assertNativeResumeHistoryCurrent(history)).not.toThrow();
});

test("a parent-directory replacement cannot validate an unlinked old transcript descriptor", async () => {
	const f = await fixture();
	const result = await inspectNativeResumeHistory(
		f.input,
		afterRead(async () => {
			await rename(dirname(f.path), join(f.root, "retired-project"));
			await mkdir(dirname(f.path));
			await writeFile(
				f.path,
				f.content.replace("saved history", "replacement"),
			);
		}),
	);
	expect(result).toBeNull();
});

test("a destination history-root retarget during a read is rejected", async () => {
	const f = await fixture();
	const result = await inspectNativeResumeHistory(
		f.input,
		afterRead(async () => {
			const next = join(f.root, "other-history");
			await mkdir(next);
			const store = join(f.input.targetDirectory, "projects");
			await rm(store);
			await symlink(next, store);
		}),
	);
	expect(result).toBeNull();
});

test("a Codex destination writer-lock retarget during a read is rejected", async () => {
	const f = await fixture("codex");
	const result = await inspectNativeResumeHistory(
		f.input,
		afterRead(async () => {
			const next = join(f.root, "other-locks");
			await mkdir(next);
			const store = join(f.input.targetDirectory, "thread-writer-locks");
			await rm(store);
			await symlink(next, store);
		}),
	);
	expect(result).toBeNull();
});

test("a transcript changed after asynchronous validation fails command authorization", async () => {
	const f = await fixture();
	const history = await inspectNativeResumeHistory(f.input);
	if (!history) throw new Error("Missing fixture history");
	await appendFile(f.path, "\n");
	expect(() => assertNativeResumeHistoryCurrent(history)).toThrow();
});

test("a destination root changed after validation fails command authorization", async () => {
	const f = await fixture();
	const history = await inspectNativeResumeHistory(f.input);
	if (!history) throw new Error("Missing fixture history");
	const store = join(f.input.targetDirectory, "projects");
	await rm(store);
	await mkdir(store);
	expect(() => assertNativeResumeHistoryCurrent(history)).toThrow();
});
