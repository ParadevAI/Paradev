/**
 * Pure utility functions and types for the comparison page system.
 * These can be safely imported in both server and client components.
 */

import { formatContentDate } from "./content-utils";

export type ComparisonPageType = "1v1" | "roundup" | "tutorial";

export interface ComparisonPage {
	slug: string;
	url: string;
	title: string;
	description: string;
	date: string;
	lastUpdated?: string;
	type: ComparisonPageType;
	competitors: string[];
	keywords: string[];
	image?: string;
	content: string;
}

export interface ComparisonFaqItem {
	question: string;
	answer: string;
}

export function formatCompareDate(date: string): string {
	return formatContentDate(date, "short");
}

export function getComparisonPageTypeLabel(type: ComparisonPageType): string {
	switch (type) {
		case "roundup":
			return "Roundup";
		case "tutorial":
			return "Tutorial";
		default:
			return "Comparison";
	}
}

const FAQ_HEADING = /^##\s+(Frequently Asked Questions|FAQ)\s*$/i;

function faqHeadingIndex(lines: string[]): number {
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index]?.trim() ?? "";
		if (FAQ_HEADING.test(line)) return index;
		// Translated bodies retain the original FAQ anchor immediately before its translated heading.
		if (!/^<span id="(frequently-asked-questions|faq)" \/>$/.test(line))
			continue;
		let next = index + 1;
		while (next < lines.length && !lines[next]?.trim()) next++;
		if (/^##\s+/.test(lines[next] ?? "")) return next;
	}
	return -1;
}

export function splitComparisonFaq(content: string): {
	body: string;
	faq: string | null;
} {
	const lines = content.split("\n");
	const faqStart = faqHeadingIndex(lines);
	if (faqStart === -1) {
		return { body: content, faq: null };
	}
	let fragmentStart = faqStart;
	while (fragmentStart > 0 && !lines[fragmentStart - 1]?.trim())
		fragmentStart--;
	if (
		/^<span id="(frequently-asked-questions|faq)" \/>$/.test(
			lines[fragmentStart - 1]?.trim() ?? "",
		)
	) {
		fragmentStart--;
	} else {
		fragmentStart = faqStart;
	}
	return {
		body: lines.slice(0, fragmentStart).join("\n"),
		faq: lines.slice(fragmentStart).join("\n"),
	};
}

function stripMarkdownFormatting(value: string): string {
	return value
		.replace(/<span id="[^"]*" \/>/g, "")
		.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
		.replace(/`([^`]+)`/g, "$1")
		.replace(/[*_~>#]/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

export function extractComparisonFaqItems(
	content: string,
): ComparisonFaqItem[] {
	const lines = content.split("\n");
	const items: ComparisonFaqItem[] = [];
	const faqStart = faqHeadingIndex(lines);

	let inFaqSection = false;
	let currentQuestion: string | undefined;
	let currentAnswerLines: string[] = [];

	const flushItem = () => {
		if (!currentQuestion) {
			currentAnswerLines = [];
			return;
		}

		const answer = stripMarkdownFormatting(currentAnswerLines.join(" "));
		if (!answer) {
			currentQuestion = undefined;
			currentAnswerLines = [];
			return;
		}

		items.push({
			question: stripMarkdownFormatting(currentQuestion),
			answer,
		});

		currentQuestion = undefined;
		currentAnswerLines = [];
	};

	for (const [lineIndex, line] of lines.entries()) {
		const trimmedLine = line.trim();

		if (lineIndex === faqStart) {
			inFaqSection = true;
			continue;
		}

		if (!inFaqSection) {
			continue;
		}

		if (/^##\s+/.test(trimmedLine)) {
			flushItem();
			break;
		}

		const questionMatch = trimmedLine.match(/^###\s+(.+)$/);
		if (questionMatch) {
			flushItem();
			currentQuestion = questionMatch[1];
			continue;
		}

		if (currentQuestion) {
			currentAnswerLines.push(trimmedLine);
		}
	}

	flushItem();

	return items;
}

/**
 * Extracts the ranked list of tools from the first Markdown table in a roundup,
 * reading the first column of each data row. Used to emit ItemList structured
 * data so "best X" listicles are eligible for rich results.
 */
export function extractRoundupItems(content: string): string[] {
	const lines = content.split("\n");
	const items: string[] = [];

	let inTable = false;
	let seenSeparator = false;

	for (const line of lines) {
		const trimmed = line.trim();
		const isTableRow = trimmed.startsWith("|") && trimmed.endsWith("|");

		if (!inTable) {
			if (isTableRow) {
				inTable = true;
				seenSeparator = false;
			}
			continue;
		}

		if (!isTableRow) {
			break; // table ended
		}

		// The row after the header is the |---|---| separator.
		if (!seenSeparator) {
			if (/^\|[\s:|-]+\|$/.test(trimmed)) {
				seenSeparator = true;
			}
			continue; // skip header and separator rows
		}

		// Split the row into cells on unescaped pipes, then unescape "\|".
		const cells = trimmed.slice(1, -1).split(/(?<!\\)\|/);
		const firstCell = (cells[0] ?? "").replace(/\\\|/g, "|");
		const name = stripMarkdownFormatting(firstCell);
		if (name) {
			items.push(name);
		}
	}

	return items;
}
