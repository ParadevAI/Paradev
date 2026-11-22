import { describe, expect, test } from "bun:test";
import {
	isGithubAttachmentUrl,
	signedGithubAttachmentUrl,
} from "./github-attachment";

const ATTACHMENT =
	"https://github.com/user-attachments/assets/eba1526e-7388-4ed6-b058-c2ffcca091dd";
const SIGNED =
	"https://github-production-user-asset-6210df.s3.amazonaws.com/5122602/697617424-eba1526e.png?X-Amz-Signature=abc";

function respond(status: number, location?: string) {
	const requests: { url: string; init?: RequestInit }[] = [];
	const fetch = (async (url: string, init?: RequestInit) => {
		requests.push({ url, init });
		return new Response(null, {
			status,
			headers: location ? { location } : undefined,
		});
	}) as unknown as typeof globalThis.fetch;
	return { fetch, requests };
}

describe("GitHub attachments", () => {
	test("only github.com upload URLs count as attachments", () => {
		expect(isGithubAttachmentUrl(ATTACHMENT)).toBe(true);
		expect(isGithubAttachmentUrl(`${ATTACHMENT}?raw=1`)).toBe(false);
		expect(
			isGithubAttachmentUrl(
				ATTACHMENT.replace("github.com", "github.com.example.org"),
			),
		).toBe(false);
		expect(
			isGithubAttachmentUrl(
				"https://github.com/user-attachments/files/123/report.pdf",
			),
		).toBe(false);
	});

	test("asks GitHub with the token and hands back where it redirects", async () => {
		const { fetch, requests } = respond(302, SIGNED);
		expect(await signedGithubAttachmentUrl(ATTACHMENT, "tok", { fetch })).toBe(
			SIGNED,
		);
		expect(requests[0]?.init).toMatchObject({
			method: "HEAD",
			redirect: "manual",
			headers: { Authorization: "Bearer tok" },
		});
	});

	test("an attachment the token can't see is null", async () => {
		const { fetch } = respond(404);
		expect(
			await signedGithubAttachmentUrl(ATTACHMENT, "tok", { fetch }),
		).toBeNull();
	});

	test("never sends the token anywhere but a github.com attachment", async () => {
		const { fetch, requests } = respond(302, SIGNED);
		expect(
			await signedGithubAttachmentUrl("https://example.com/x.png", "tok", {
				fetch,
			}),
		).toBeNull();
		expect(requests).toEqual([]);
	});

	test("a redirect to a cleartext URL is refused", async () => {
		const { fetch } = respond(302, "http://example.com/x.png");
		expect(
			await signedGithubAttachmentUrl(ATTACHMENT, "tok", { fetch }),
		).toBeNull();
	});
});
