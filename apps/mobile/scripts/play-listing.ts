// Checks the Google Play listing in play-store.config.js against Play's limits,
// and with --push uploads its text and images through the Play Developer API.
//
//   bun apps/mobile/scripts/play-listing.ts            # check only
//   PLAY_SERVICE_ACCOUNT_KEY=key.json bun apps/mobile/scripts/play-listing.ts --push
//
// --push needs the app to exist in Play Console, one build uploaded by hand, and
// a service account with release access to the app.
import { createSign } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const MOBILE_DIR = resolve(__dirname, "..");
const config = require(join(MOBILE_DIR, "play-store.config.js"));
const API = "https://androidpublisher.googleapis.com/androidpublisher/v3";
const UPLOAD_API =
	"https://androidpublisher.googleapis.com/upload/androidpublisher/v3";

const TEXT_LIMITS = { title: 30, shortDescription: 80, fullDescription: 4000 };

function pngSize(file: string): { width: number; height: number } {
	const bytes = readFileSync(file);
	if (bytes.toString("ascii", 1, 4) !== "PNG")
		throw new Error(`${file} is not a PNG`);
	return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function screenshotFiles(): string[] {
	const dir = join(MOBILE_DIR, config.images.phoneScreenshots);
	try {
		return readdirSync(dir)
			.filter((name) => name.endsWith(".png"))
			.sort()
			.map((name) => join(dir, name));
	} catch {
		return [];
	}
}

function check(): string[] {
	const problems: string[] = [];
	for (const [language, listing] of Object.entries<Record<string, string>>(
		config.listings,
	)) {
		for (const [field, limit] of Object.entries(TEXT_LIMITS)) {
			const length = [...(listing[field] ?? "")].length;
			if (length === 0) problems.push(`${language} ${field} is empty`);
			if (length > limit)
				problems.push(
					`${language} ${field} is ${length} characters; Play allows ${limit}`,
				);
		}
	}
	const icon = pngSize(join(MOBILE_DIR, config.images.icon));
	if (icon.width !== 512 || icon.height !== 512)
		problems.push(`icon is ${icon.width}x${icon.height}; Play wants 512x512`);
	const feature = pngSize(join(MOBILE_DIR, config.images.featureGraphic));
	if (feature.width !== 1024 || feature.height !== 500)
		problems.push(
			`feature graphic is ${feature.width}x${feature.height}; Play wants 1024x500`,
		);
	const shots = screenshotFiles();
	if (shots.length < 2 || shots.length > 8)
		problems.push(
			`${shots.length} phone screenshots in ${config.images.phoneScreenshots}; Play wants 2 to 8`,
		);
	for (const shot of shots) {
		const { width, height } = pngSize(shot);
		const long = Math.max(width, height);
		const short = Math.min(width, height);
		if (short < 320 || long > 3840 || long > short * 2)
			problems.push(
				`${shot}: ${width}x${height} is outside 320–3840 px or past 2:1`,
			);
	}
	return problems;
}

async function accessToken(keyFile: string): Promise<string> {
	const key = JSON.parse(readFileSync(keyFile, "utf8"));
	const now = Math.floor(Date.now() / 1000);
	const encode = (value: object) =>
		Buffer.from(JSON.stringify(value)).toString("base64url");
	const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({
		iss: key.client_email,
		scope: "https://www.googleapis.com/auth/androidpublisher",
		aud: "https://oauth2.googleapis.com/token",
		iat: now,
		exp: now + 3600,
	})}`;
	const signature = createSign("RSA-SHA256")
		.update(unsigned)
		.sign(key.private_key, "base64url");
	const response = await fetch("https://oauth2.googleapis.com/token", {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
			assertion: `${unsigned}.${signature}`,
		}),
	});
	if (!response.ok)
		throw new Error(`token: ${response.status} ${await response.text()}`);
	return (await response.json()).access_token;
}

async function push(keyFile: string) {
	const token = await accessToken(keyFile);
	const app = `applications/${config.packageName}`;
	const call = async (
		method: string,
		url: string,
		body?: BodyInit,
		contentType = "application/json",
	) => {
		const response = await fetch(url, {
			method,
			headers: {
				authorization: `Bearer ${token}`,
				"content-type": contentType,
			},
			body,
		});
		if (!response.ok)
			throw new Error(
				`${method} ${url}: ${response.status} ${await response.text()}`,
			);
		return response.status === 204 ? null : response.json();
	};

	const edit = await call("POST", `${API}/${app}/edits`, "{}");
	const editUrl = `${API}/${app}/edits/${edit.id}`;
	await call(
		"PATCH",
		`${editUrl}/details`,
		JSON.stringify({
			defaultLanguage: config.defaultLanguage,
			...config.details,
		}),
	);
	for (const [language, listing] of Object.entries<object>(config.listings)) {
		await call(
			"PUT",
			`${editUrl}/listings/${language}`,
			JSON.stringify({ language, ...listing }),
		);
		const images: [string, string[]][] = [
			["icon", [join(MOBILE_DIR, config.images.icon)]],
			["featureGraphic", [join(MOBILE_DIR, config.images.featureGraphic)]],
			["phoneScreenshots", screenshotFiles()],
		];
		for (const [imageType, files] of images) {
			await call("DELETE", `${editUrl}/listings/${language}/${imageType}`);
			for (const file of files) {
				await call(
					"POST",
					`${UPLOAD_API}/${app}/edits/${edit.id}/listings/${language}/${imageType}?uploadType=media`,
					readFileSync(file),
					"image/png",
				);
			}
		}
		console.log(`${language}: text and images staged`);
	}
	await call("POST", `${editUrl}:commit`);
	console.log(`Committed edit ${edit.id} for ${config.packageName}`);
}

const problems = check();
if (problems.length > 0) {
	console.error(problems.map((problem) => `✗ ${problem}`).join("\n"));
	process.exit(1);
}
console.log("✓ Listing text and images are within Play's limits");

if (process.argv.includes("--push")) {
	const keyFile = process.env.PLAY_SERVICE_ACCOUNT_KEY;
	if (!keyFile) {
		console.error(
			"Set PLAY_SERVICE_ACCOUNT_KEY to the service account's JSON key file.",
		);
		process.exit(1);
	}
	await push(keyFile);
}
