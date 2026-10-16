import { z } from "zod";
import {
	type CardContext,
	type CardField,
	CardUnavailable,
	CHANGED_SINCE_CONFIRM,
	defineCard,
	type GithubReleaseView,
	withInput,
} from "../types";
import {
	githubFor,
	personSchema,
	repoFacts,
	repoRefs,
	UNREADABLE,
} from "./githubClient";

interface Refs {
	owner: string;
	repo: string;
	tag: string;
	target?: string;
	name?: string;
	notes?: string;
	previous_tag?: string;
	prerelease?: boolean;
	latest?: boolean;
}

const TAG = /^(?!\.{1,2}$)[^\s~^:?*[\\]{1,100}$/;
const NAME_MAX = 200;
const NOTES_REF_MAX = 6000;
const NOTES_MAX = 20_000;
const COMMITS_SHOWN = 20;
const DRAFTS_READ = 30;

const releaseSchema = z.object({
	tag_name: z.string(),
	html_url: z.string(),
	draft: z.boolean().optional(),
});

const commitSchema = z.object({
	sha: z.string(),
	commit: z.object({
		message: z.string(),
		author: z.object({ name: z.string().optional() }).nullable(),
	}),
	author: personSchema.nullable().optional(),
});

const releaseInput = z.object({
	/** `sha` from the view: the commit the reader saw. */
	sha: z.string().regex(/^[0-9a-f]{40}$/),
	name: z.string().trim().min(1).max(NAME_MAX),
	notes: z.string().max(NOTES_MAX).default(""),
	prerelease: z.boolean().default(false),
	latest: z.boolean().default(true),
});
type ReleaseInput = z.infer<typeof releaseInput>;

interface Data {
	repo: string;
	tag: string;
	tagExists: boolean;
	sha: string;
	previous: string | null;
	existing: string | null;
	canPush: boolean;
	plan: GithubReleaseView["plan"];
}

const first = (message: string) => message.split("\n")[0]?.slice(0, 200) ?? "";

/** Whole lines of the notes that fit a card's refs. */
function fitted(notes: string): string {
	if (notes.length <= NOTES_REF_MAX) return notes;
	const cut = notes.slice(0, NOTES_REF_MAX - 2);
	const line = cut.lastIndexOf("\n");
	return `${line > 0 ? cut.slice(0, line) : cut}\n…`;
}

const blocked = (data: Data) => {
	if (!data.canPush)
		return `Your GitHub account cannot release on ${data.repo}`;
	return data.existing ?? true;
};

function cut(draft: boolean) {
	return {
		available: blocked,
		confirmFor: (data: Data, raw: unknown) => {
			const input = releaseInput.safeParse(raw);
			if (!input.success) return "";
			const { name, latest, prerelease } = input.data;
			const sentence = data.plan[draft ? "draft" : "publish"].replace(
				"{name}",
				() => name,
			);
			if (prerelease) return `${sentence}${data.plan.prerelease}`;
			return !draft && latest ? `${sentence}${data.plan.latest}` : sentence;
		},
		run: withInput(
			releaseInput,
			async ({
				refs,
				data,
				ctx,
				input,
			}: {
				refs: Refs;
				data: Data;
				ctx: CardContext;
				input: ReleaseInput;
			}) => {
				if (input.sha !== data.sha)
					throw new CardUnavailable("error", CHANGED_SINCE_CONFIRM);
				const github = await githubFor(ctx);
				const made = z.object({ html_url: z.string() }).safeParse(
					await github.write(
						"POST",
						`/repos/${refs.owner}/${refs.repo}/releases`,
						{
							tag_name: data.tag,
							...(data.tagExists ? {} : { target_commitish: data.sha }),
							name: input.name,
							body: input.notes,
							draft,
							prerelease: input.prerelease,
							...(draft
								? {}
								: {
										make_latest:
											input.latest && !input.prerelease ? "true" : "false",
									}),
						},
					),
				);
				return {
					outcome: {
						release: draft ? "draft" : "published",
						tag: data.tag,
						sha: data.sha,
						name: input.name,
						prerelease: input.prerelease,
						url: made.success ? made.data.html_url : null,
					},
					notice: {
						tone: "good" as const,
						text: draft
							? `Saved "${input.name}" as a draft release`
							: `Published ${data.tag} on ${data.repo}`,
					},
				};
			},
		),
	};
}

export const githubRelease = defineCard<Refs, Data>({
	type: "github.release",
	label: "Cut a release",
	ask: "Publish release",
	brand: "github",
	refs: z.object({
		...repoRefs,
		tag: z.string().regex(TAG),
		/** A branch or commit for a new tag; the default branch when absent. */
		target: z.string().min(1).max(200).optional(),
		name: z.string().max(NAME_MAX).optional(),
		/** The drafted notes in Markdown; without them the card lists the commits since the previous release. */
		notes: z.string().max(NOTES_REF_MAX).optional(),
		/** The release to compare with. Without it GitHub's latest release is used, which may belong to another product in the same repository. */
		previous_tag: z.string().regex(TAG).optional(),
		prerelease: z.boolean().optional(),
		latest: z.boolean().optional(),
	}),
	async resolve({ refs, ctx }) {
		const github = await githubFor(ctx);
		const repo = `${refs.owner}/${refs.repo}`;
		const base = `/repos/${repo}`;
		const tagPath = encodeURIComponent(refs.tag);
		const [facts, published, releases, tagRef, latest] = await Promise.all([
			repoFacts(github, refs.owner, refs.repo),
			github.find(`${base}/releases/tags/${tagPath}`, releaseSchema),
			github.get(
				`${base}/releases?per_page=${DRAFTS_READ}`,
				z.array(releaseSchema),
			),
			github.find(
				`${base}/git/ref/tags/${tagPath}`,
				z.object({ ref: z.string() }),
			),
			refs.previous_tag
				? null
				: github.find(`${base}/releases/latest`, releaseSchema),
		]);
		const tagExists = tagRef !== null;
		const target = tagExists ? refs.tag : (refs.target ?? facts.defaultBranch);
		const head = await github.find(
			`${base}/commits/${encodeURIComponent(target)}`,
			z.object({ sha: z.string() }),
		);
		if (!head)
			throw new CardUnavailable(
				"gone",
				`${repo} has no branch or commit named ${target}`,
			);
		const previous = refs.previous_tag ?? latest?.tag_name ?? null;
		const range = previous
			? `${encodeURIComponent(previous)}...${head.sha}`
			: null;
		// Page 2 of one commit: the count, without the first page's file patches.
		const compared = range
			? await github.find(
					`${base}/compare/${range}?per_page=1&page=2`,
					z.object({ total_commits: z.number() }),
				)
			: null;
		if (range && !compared)
			throw new CardUnavailable(
				"gone",
				`${repo} has no tag ${previous} to compare with`,
			);
		const total = compared?.total_commits ?? 0;
		const commits = (
			total > 0
				? await github.get(
						`${base}/commits?sha=${head.sha}&per_page=${Math.min(total, COMMITS_SHOWN)}`,
						z.array(commitSchema),
					)
				: []
		).map((each) => ({
			sha: each.sha,
			message: first(each.commit.message),
			author: each.author?.login ?? each.commit.author?.name ?? null,
		}));
		const compareUrl =
			previous && compared
				? `${facts.url}/compare/${encodeURIComponent(previous)}...${encodeURIComponent(target)}`
				: null;
		const drafted =
			refs.notes ??
			[
				commits.length ? "## What's changed" : "",
				...commits.map((each) => `- ${each.message}`),
				total > commits.length
					? `- …and ${total - commits.length} more commits`
					: "",
				compareUrl ? `\n**Full changelog**: ${compareUrl}` : "",
			]
				.filter(Boolean)
				.join("\n");
		const short = head.sha.slice(0, 7);
		const tagged = tagExists
			? `tagged ${refs.tag} at ${short}`
			: `with the new tag ${refs.tag} on ${target} at ${short}`;
		const plan = {
			publish: `Publish the release "{name}" on ${repo}, ${tagged}?`,
			draft: `Save "{name}" as a draft release on ${repo}, ${tagged}? Nothing is published.`,
			latest: " It becomes the latest release.",
			prerelease: " It is marked as a pre-release.",
			generate:
				refs.notes === undefined ? null : "Replace the notes with GitHub's?",
		};
		const draft = releases.find(
			(each) => each.draft && each.tag_name === refs.tag,
		);
		const existing = published ?? draft ?? null;
		const view: GithubReleaseView = {
			kind: "github.release",
			repo,
			tag: refs.tag,
			tagExists,
			target,
			sha: head.sha,
			name: refs.name ?? refs.tag,
			notes: drafted,
			prerelease: refs.prerelease ?? false,
			latest: refs.latest ?? true,
			existing: existing
				? { url: existing.html_url, draft: existing === draft }
				: null,
			previous: previous
				? {
						tag: previous,
						url: `${facts.url}/releases/tag/${encodeURIComponent(previous)}`,
					}
				: null,
			commits,
			total,
			compareUrl,
			plan,
		};
		const fields: CardField[] = [
			{ label: "Repository", value: repo, href: facts.url },
			{ label: "Tag", value: refs.tag, mono: true },
			{ label: "Commit", value: `${target} at ${short}`, mono: true },
			...(previous
				? [
						{
							label: "Since",
							value: `${previous} (${total} commits)`,
							href: compareUrl ?? undefined,
						},
					]
				: []),
		];
		return {
			title: view.name,
			subtitle: `${repo} · ${refs.tag}`,
			status: published
				? { tone: "done", text: "Released" }
				: draft
					? { tone: "neutral", text: "Draft exists" }
					: refs.prerelease
						? { tone: "neutral", text: "Pre-release" }
						: undefined,
			fields,
			body: drafted.slice(0, 500) || undefined,
			view,
			data: {
				repo,
				tag: refs.tag,
				tagExists,
				sha: head.sha,
				previous,
				existing: published
					? `${refs.tag} is already released`
					: draft
						? `A draft release for ${refs.tag} exists on GitHub`
						: null,
				canPush: facts.canPush,
				plan,
			},
		};
	},
	actions: {
		publish: {
			label: () => "Publish release",
			style: "primary",
			role: "primary",
			...cut(false),
		},
		draft: {
			label: () => "Save draft",
			style: "secondary",
			role: "other",
			...cut(true),
		},
		generate: {
			label: () => "Generate release notes",
			style: "secondary",
			role: "other",
			terminal: false,
			applies: (data) => data.existing === null,
			available: blocked,
			confirmFor: (data) => data.plan.generate ?? undefined,
			async run({ refs, data, ctx }) {
				const github = await githubFor(ctx);
				const generated = z.object({ body: z.string() }).safeParse(
					await github.write(
						"POST",
						`/repos/${refs.owner}/${refs.repo}/releases/generate-notes`,
						{
							tag_name: data.tag,
							target_commitish: data.sha,
							...(data.previous ? { previous_tag_name: data.previous } : {}),
						},
					),
				);
				if (!generated.success) throw new CardUnavailable("error", UNREADABLE);
				return {
					outcome: { generated: true },
					refs: { notes: fitted(generated.data.body) },
					notice: { tone: "good", text: "Notes generated by GitHub" },
				};
			},
		},
		dismiss: {
			label: () => "Do not release",
			style: "secondary",
			role: "dismiss",
			async run() {
				return { outcome: { release: null } };
			},
		},
	},
});
