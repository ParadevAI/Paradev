import { afterEach, describe, expect, test } from "bun:test";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { cleanup, fireEvent, render, screen } = await import(
	"@testing-library/react"
);
const { CompactionDivider } = await import("./CompactionDivider");

afterEach(cleanup);

describe("CompactionDivider", () => {
	test("shows how far the context shrank and opens the summary on demand", () => {
		const { container } = render(
			<CompactionDivider
				compaction={{
					status: "completed",
					trigger: "manual",
					tokensBefore: 61_043,
					tokensAfter: 9_120,
					summary: "Read the readme; nothing changed.",
				}}
			/>,
		);

		expect(container.textContent).toContain(
			"Context compacted· 61K → 9.1K tokens",
		);
		expect(container.textContent).not.toContain("nothing changed");
		fireEvent.click(screen.getByRole("button"));
		expect(container.textContent).toContain(
			"Read the readme; nothing changed.",
		);
	});

	test("names a running, failed or legacy compaction", () => {
		const label = (
			compaction: Parameters<typeof CompactionDivider>[0]["compaction"],
		) => {
			const { container, unmount } = render(
				<CompactionDivider compaction={compaction} />,
			);
			const text = container.textContent;
			unmount();
			return text;
		};

		expect(label({ status: "running", tokensBefore: 30_818 })).toBe(
			"Compacting context…",
		);
		expect(label({ status: "failed", error: "Prompt too long" })).toBe(
			"Compaction failed· Prompt too long",
		);
		expect(label(undefined)).toBe("Context compacted");
	});
});
