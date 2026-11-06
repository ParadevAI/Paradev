import { describe, expect, test } from "bun:test";

// terminal.writeInput delivers raw keystrokes. A TUI agent reads a prompt's
// embedded newlines as Enter presses and splits text across pty read chunks,
// so a long multi-line prompt arrives mangled and unsubmitted. Text for a
// running terminal goes through terminal.send, which paste-frames it.
const RENDERER_ROOT = import.meta.dir.split("/").slice(0, -3).join("/");

// Ctrl+C is a keystroke, not text.
const KEYSTROKE_WRITERS = [
	"routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useV2WorkspaceRun/useV2WorkspaceRun.ts",
];

const RAW_WRITE =
	/terminal\s*\.\s*writeInput\s*\.\s*(?:useMutation|mutate(?:Async)?)\b/;

describe("text never reaches a terminal through the raw keystroke channel", () => {
	test("terminal.writeInput is only called for keystrokes", async () => {
		const offenders: string[] = [];
		const glob = new Bun.Glob("**/*.{ts,tsx}");
		for await (const file of glob.scan({ cwd: RENDERER_ROOT })) {
			if (file.includes(".test.")) continue;
			if (KEYSTROKE_WRITERS.includes(file)) continue;
			const source = await Bun.file(`${RENDERER_ROOT}/${file}`).text();
			const match = source.match(RAW_WRITE);
			if (match) {
				const line = source.slice(0, match.index).split("\n").length;
				offenders.push(`${file}:${line}`);
			}
		}
		expect(offenders).toEqual([]);
	});

	test("the shared agent writer sends through terminal.send", async () => {
		const source = await Bun.file(
			`${import.meta.dir}/useSendToTerminalAgent.ts`,
		).text();
		expect(source).toMatch(/terminal\s*\.\s*send\s*\.\s*useMutation\b/);
	});
});

const V2_PANES =
	"routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components";

// Design mode stages a note in the agent's input so the user can add more
// before sending (#8566). Every other caller sends right away.
const EXPECTED_SUBMIT: Record<string, boolean> = {
	[`${V2_PANES}/BrowserPane/components/DesignModePopover/DesignModePopover.tsx`]: false,
	[`${V2_PANES}/DiffPane/hooks/useDiffCommentComposer/useDiffCommentComposer.ts`]: true,
	[`${V2_PANES}/TerminalPane/components/TerminalRichInput/TerminalRichInput.tsx`]: true,
	"routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/NewPageComposer/NewPageComposer.tsx": true,
};

describe("submit on the shared agent writer", () => {
	test("the hook forwards the caller's submit instead of a constant", async () => {
		const source = await Bun.file(
			`${import.meta.dir}/useSendToTerminalAgent.ts`,
		).text();
		expect(source).not.toMatch(/submit:\s*(?:true|false)/);
	});

	test("design mode stages the note and every other caller submits", async () => {
		for (const [file, submit] of Object.entries(EXPECTED_SUBMIT)) {
			const source = await Bun.file(`${RENDERER_ROOT}/${file}`).text();
			const calls = [
				...source.matchAll(
					/sendToTerminalAgent\(\{[^}]*?submit:\s*(true|false)/g,
				),
			].map((match) => match[1] === "true");
			expect({ file, calls }).toEqual({ file, calls: [submit] });
		}
	});
});
