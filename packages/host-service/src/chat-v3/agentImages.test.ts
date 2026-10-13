import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	closeSync,
	existsSync,
	ftruncateSync,
	mkdirSync,
	mkdtempSync,
	openSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MAX_CHAT_IMAGE_BYTES } from "@superset/shared/attachment-limits";
import { storeAgentImage } from "./agentImages";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);

let cwd: string;
let outside: string;

beforeEach(() => {
	cwd = mkdtempSync(join(tmpdir(), "agent-images-cwd-"));
	outside = mkdtempSync(join(tmpdir(), "agent-images-out-"));
});
afterEach(() => {
	rmSync(cwd, { recursive: true, force: true });
	rmSync(outside, { recursive: true, force: true });
});

describe("storeAgentImage", () => {
	it("writes inline bytes under the workspace attachments dir, ignored by git, once per content", () => {
		const first = storeAgentImage(
			{ kind: "bytes", mimeType: "image/png", bytes: PNG },
			cwd,
		);
		const again = storeAgentImage(
			{ kind: "bytes", mimeType: "image/png", bytes: PNG, name: "shot.png" },
			cwd,
		);
		expect(first?.path).toMatch(
			/^\.superset\/attachments\/image-[0-9a-f]{12}\.png$/,
		);
		expect(again?.path).toMatch(
			/^\.superset\/attachments\/shot-[0-9a-f]{12}\.png$/,
		);
		const dir = join(cwd, ".superset", "attachments");
		expect(readdirSync(dir).sort()).toEqual(
			[".gitignore", first?.path.split("/").pop(), again?.path.split("/").pop()]
				.filter((entry): entry is string => Boolean(entry))
				.sort(),
		);
		expect(readFileSync(join(dir, ".gitignore"), "utf8")).toBe("*\n");
		expect(
			storeAgentImage({ kind: "bytes", mimeType: "image/png", bytes: PNG }, cwd)
				?.path,
		).toBe(first?.path);
		expect(readdirSync(dir)).toHaveLength(3);
	});

	it("copies linked files, including ones already in the attachments directory", () => {
		const linked = join(outside, "home page.png");
		writeFileSync(linked, PNG);
		const copied = storeAgentImage(
			{ kind: "file", mimeType: "image/png", path: linked },
			cwd,
		);
		expect(copied?.path).toMatch(
			/^\.superset\/attachments\/home_page-[0-9a-f]{12}\.png$/,
		);
		expect(
			readFileSync(join(cwd, copied?.path ?? "")).equals(Buffer.from(PNG)),
		).toBe(true);

		const dir = join(cwd, ".superset", "attachments");
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, "upload.png"), PNG);
		expect(
			storeAgentImage(
				{ kind: "file", mimeType: "image/png", path: join(dir, "upload.png") },
				cwd,
			)?.path,
		).toMatch(/^\.superset\/attachments\/upload-[0-9a-f]{12}\.png$/);
	});

	it.each([
		"outside",
		"attachments",
	])("skips an over-cap file in %s", (location) => {
		const dir =
			location === "outside" ? outside : join(cwd, ".superset", "attachments");
		mkdirSync(dir, { recursive: true });
		const linked = join(dir, "huge.png");
		writeFileSync(linked, PNG);
		expect(
			storeAgentImage(
				{ kind: "file", mimeType: "image/png", path: linked },
				cwd,
				undefined,
				PNG.byteLength - 1,
			),
		).toBe(null);
		if (location === "outside")
			expect(existsSync(join(cwd, ".superset"))).toBe(false);
	});

	it("rejects non-files even when they already live in the attachments directory", () => {
		const path = join(cwd, ".superset", "attachments", "directory.png");
		mkdirSync(path, { recursive: true });
		expect(
			storeAgentImage({ kind: "file", mimeType: "image/png", path }, cwd),
		).toBeNull();
	});

	it("rejects files beyond the shared preview size cap", () => {
		const path = join(cwd, ".superset", "attachments", "large.png");
		mkdirSync(join(cwd, ".superset", "attachments"), { recursive: true });
		writeFileSync(path, PNG);
		const fd = openSync(path, "r+");
		try {
			ftruncateSync(fd, MAX_CHAT_IMAGE_BYTES + 1);
			expect(
				storeAgentImage({ kind: "file", mimeType: "image/png", path }, cwd),
			).toBeNull();
		} finally {
			closeSync(fd);
		}
	});

	it.each([
		"outside",
		"attachments",
	])("restores each tool's stored copy when a source in %s changes or disappears", (location) => {
		const dir =
			location === "outside" ? outside : join(cwd, ".superset", "attachments");
		mkdirSync(dir, { recursive: true });
		const path = join(dir, "shot.png");
		const source = { kind: "file" as const, mimeType: "image/png", path };
		const firstContext = {
			sessionId: "session-1",
			referenceId: "tool:read-1",
			replaying: false,
		};
		const secondContext = { ...firstContext, referenceId: "tool:read-2" };
		writeFileSync(path, PNG);
		const first = storeAgentImage(source, cwd, firstContext);
		writeFileSync(path, new Uint8Array([...PNG, 2]));
		const second = storeAgentImage(source, cwd, secondContext);
		expect(first?.path).not.toBe(second?.path);
		expect(
			storeAgentImage(source, cwd, { ...firstContext, replaying: true }),
		).toEqual(first);
		rmSync(path);
		expect(
			storeAgentImage(source, cwd, { ...firstContext, replaying: true }),
		).toEqual(first);
		expect(
			storeAgentImage(source, cwd, { ...secondContext, replaying: true }),
		).toEqual(second);
		expect(
			storeAgentImage(source, cwd, {
				...firstContext,
				sessionId: "session-2",
				replaying: true,
			}),
		).toBeNull();
		expect(readFileSync(join(cwd, first?.path ?? ""))).toEqual(
			Buffer.from(PNG),
		);
	});

	it("answers null for a file it cannot read or an empty image", () => {
		expect(
			storeAgentImage(
				{
					kind: "file",
					mimeType: "image/png",
					path: join(outside, "gone.png"),
				},
				cwd,
			),
		).toBe(null);
		expect(
			storeAgentImage(
				{ kind: "bytes", mimeType: "image/png", bytes: new Uint8Array() },
				cwd,
			),
		).toBe(null);
	});
});
