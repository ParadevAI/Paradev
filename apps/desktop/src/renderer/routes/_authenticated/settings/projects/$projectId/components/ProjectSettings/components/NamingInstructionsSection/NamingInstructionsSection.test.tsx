import { describe, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { NamingInstructionsSection } from "./NamingInstructionsSection";

type SectionProps = Parameters<typeof NamingInstructionsSection>[0];

function renderEditor(props: Partial<SectionProps> = {}) {
	return renderToStaticMarkup(
		<QueryClientProvider client={new QueryClient()}>
			<NamingInstructionsSection
				projectId="project-1"
				hostUrl="http://127.0.0.1:7777"
				instructions={null}
				globalInstructions={null}
				ignoreGlobalInstructions={false}
				onChanged={() => {}}
				{...props}
			/>
		</QueryClientProvider>,
	);
}

describe("NamingInstructionsSection", () => {
	test("opens on the host row's instructions", () => {
		expect(
			renderEditor({ instructions: "Use the ticket id as the branch name" }),
		).toContain(">Use the ticket id as the branch name</textarea>");
	});

	test("opens empty on a host that has none", () => {
		expect(renderEditor()).toContain("></textarea>");
	});

	test("shows the global instructions it inherits", () => {
		const html = renderEditor({ globalInstructions: "Prefix with feat/" });
		expect(html).toContain('placeholder="Prefix with feat/"');
		expect(html).toContain("Empty uses the global instructions.");
		expect(html).toContain("Ignore global naming instructions");
	});

	test("does not show the global instructions when the project ignores them", () => {
		const html = renderEditor({
			globalInstructions: "Prefix with feat/",
			ignoreGlobalInstructions: true,
		});
		expect(html).not.toContain("Prefix with feat/");
		expect(html).toContain("Empty uses the default naming.");
	});

	test("a host without global instructions gets no toggle and no inherited text", () => {
		const html = renderEditor({
			globalInstructions: "Prefix with feat/",
			ignoreGlobalInstructions: undefined,
		});
		expect(html).not.toContain("Prefix with feat/");
		expect(html).not.toContain("Ignore global naming instructions");
	});
});
