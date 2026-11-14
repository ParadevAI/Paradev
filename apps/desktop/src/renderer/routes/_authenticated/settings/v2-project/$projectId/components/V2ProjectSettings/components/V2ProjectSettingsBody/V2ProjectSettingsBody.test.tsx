import { afterEach, describe, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render } from "@testing-library/react";
import type { ComponentProps } from "react";
import type { HostRepository } from "renderer/hooks/host-projects/useHostProjects";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { V2ProjectSettingsBody } from "./V2ProjectSettingsBody";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(cleanup);

type BodyProps = ComponentProps<typeof V2ProjectSettingsBody>;

const HOST_URL = "http://127.0.0.1:7777";

function repository(
	id: string,
	overrides: Partial<HostRepository> = {},
): HostRepository {
	return {
		id,
		projectId: "project-1",
		isPrimary: false,
		name: id,
		path: `/repos/${id}`,
		provider: "github",
		owner: "acme",
		repoName: id,
		url: `https://github.com/acme/${id}`,
		remoteName: "origin",
		sparseCheckoutPaths: [],
		pathState: "ok",
		...overrides,
	};
}

const app = repository("app", {
	isPrimary: true,
	sparseCheckoutPaths: ["apps/desktop"],
});

const project: BodyProps["project"] = {
	projectKey: "project-1",
	id: "project-1",
	name: "Acme",
	primaryRepositoryId: "app",
	repositories: [app],
	icon: null,
	color: null,
	hostIds: ["host-1"],
	hostReachable: true,
	createdAt: 1,
	updatedAt: 1,
};

const hostProject = {
	id: "project-1",
	name: "Acme",
	icon: null,
	color: null,
	primaryRepositoryId: "app",
	repositories: [app],
	worktreeBaseDir: null,
	branchPrefixMode: null,
	branchPrefixCustom: null,
	namingInstructions: "Prefix branches with fix/ or feat/",
} as unknown as NonNullable<BodyProps["hostProject"]>;

function renderBody(props: Partial<BodyProps> = {}) {
	const queryClient = new QueryClient();
	return render(
		<electronTrpc.Provider
			client={electronTrpc.createClient({ links: [] })}
			queryClient={queryClient}
		>
			<QueryClientProvider client={queryClient}>
				<V2ProjectSettingsBody
					projectId="project-1"
					project={project}
					hostProject={hostProject}
					targetHostUrl={HOST_URL}
					targetHostId="host-1"
					targetHostName="This device"
					isRemoteTarget={false}
					isHostOnline
					hostOptions={[]}
					onHostChange={() => {}}
					onHostProjectChanged={() => {}}
					scriptsEditor={<div data-testid="scripts" />}
					usesConfigToml={false}
					dangerZone={<div data-testid="danger" />}
					{...props}
				/>
			</QueryClientProvider>
		</electronTrpc.Provider>,
	);
}

describe("V2ProjectSettingsBody", () => {
	test("offers the project icon picker so users can set an icon (#5843)", () => {
		const view = renderBody();
		expect(view.getByLabelText("Change project icon and color")).toHaveProperty(
			"disabled",
			false,
		);
	});

	test("seeds the naming-instructions editor from the targeted host row", () => {
		const view = renderBody();
		expect(
			view.container.querySelector<HTMLTextAreaElement>(
				"#project-naming-instructions",
			)?.value,
		).toBe("Prefix branches with fix/ or feat/");
	});

	test("seeds the sparse-checkout editor from the targeted host row", () => {
		const view = renderBody();
		expect(
			view.container.querySelector<HTMLTextAreaElement>(
				"#project-sparse-checkout",
			)?.value,
		).toBe("apps/desktop");
	});

	test("hides the host-backed editors until the host row has loaded", () => {
		const view = renderBody({ hostProject: undefined });
		expect(view.container.querySelector("#project-naming-instructions")).toBe(
			null,
		);
		expect(view.container.querySelector("#project-sparse-checkout")).toBe(null);
		expect(view.getByLabelText("Change project icon and color")).toBeDefined();
	});

	test("places the scripts and danger-zone sections it is given", () => {
		const view = renderBody();
		for (const slot of ["scripts", "danger"]) {
			expect(view.getByTestId(slot)).toBeDefined();
		}
	});
});

describe("V2ProjectSettingsBody with several repositories", () => {
	const api = repository("api", { sparseCheckoutPaths: ["src"] });
	const multi = {
		...hostProject,
		repositories: [api, app],
	} as NonNullable<BodyProps["hostProject"]>;

	test("lists every repository and marks the primary", () => {
		const view = renderBody({ hostProject: multi });
		expect(view.getByText("Primary")).toBeDefined();
		expect(view.getAllByText("api").length).toBeGreaterThan(0);
		expect(view.queryByText("Repository")).toBe(null);
	});

	test("gives each repository its own sparse-checkout editor", () => {
		const view = renderBody({ hostProject: multi });
		expect(
			view.container.querySelector<HTMLTextAreaElement>(
				"#project-sparse-checkout-api",
			)?.value,
		).toBe("src");
		expect(
			view.container.querySelector<HTMLTextAreaElement>(
				"#project-sparse-checkout-app",
			)?.value,
		).toBe("apps/desktop");
	});

	test("flags a repository whose folder is missing", () => {
		const view = renderBody({
			hostProject: {
				...multi,
				repositories: [{ ...api, pathState: "missing" }, app],
			},
		});
		expect(view.getAllByText("Folder is missing").length).toBeGreaterThan(0);
	});

	test("lists no other host's repositories when the targeted host has none", () => {
		const view = renderBody({
			project: { ...project, repositories: [api, app] },
			hostProject: null,
		});
		expect(view.getAllByText("Not set up on This device").length).toBe(2);
		expect(view.getByText("Set up on This device")).toBeTruthy();
		expect(view.queryByText("/repos/api")).toBe(null);
	});

	test("asks to update a host whose row has no repositories instead of offering set-up", () => {
		const view = renderBody({
			project: { ...project, repositories: [api, app] },
			hostProject: null,
			isHostOutdated: true,
		});
		expect(
			view.getAllByText("Update This device to manage this project").length,
		).toBeGreaterThan(0);
		expect(view.queryByText("Set up on This device")).toBe(null);
	});
});
