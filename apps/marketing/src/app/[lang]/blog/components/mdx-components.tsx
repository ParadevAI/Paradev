import { isValidElement, type ReactNode } from "react";
import { HiMiniArrowDownTray } from "react-icons/hi2";
import type { BundledLanguage } from "shiki";
import { Investors } from "@/app/[lang]/components/Investors";
import { LogoMarquee } from "@/app/[lang]/components/LogoMarquee";
import { PhotoFan } from "@/app/[lang]/components/PhotoFan";
import { StoreBadges } from "@/app/[lang]/components/StoreBadges";
import { StoryPhoto } from "@/app/[lang]/components/StoryPhoto";
import { getAbout } from "@/lib/about";
import { slugify } from "@/lib/blog-utils";
import { getPublicImageSize } from "@/lib/public-image-size";
import { BlogCodeBlock } from "./BlogCodeBlock";
import { Testimonial } from "./Testimonial";
import { TestimonialGrid } from "./TestimonialGrid";

const BLOG_PHOTO_FAN_SPACING_PX = 60;

function extractCodeFromChildren(children: React.ReactNode): {
	code: string;
	language: BundledLanguage;
} {
	if (
		children &&
		typeof children === "object" &&
		"props" in children &&
		children.props
	) {
		const codeProps = children.props as {
			children?: string;
			className?: string;
		};
		const code = codeProps.children?.trim() ?? "";
		const className = codeProps.className ?? "";
		const match = className.match(/language-(\w+)/);
		const language = (match?.[1] ?? "text") as BundledLanguage;
		return { code, language };
	}
	return { code: String(children ?? ""), language: "text" as BundledLanguage };
}

function textContent(node: ReactNode): string {
	if (typeof node === "string" || typeof node === "number") return String(node);
	if (Array.isArray(node)) return node.map(textContent).join("");
	if (isValidElement<{ children?: ReactNode }>(node)) {
		return textContent(node.props.children);
	}
	return "";
}

function Video({ src, title }: { src: string; title?: string }) {
	return (
		<span className="block my-8 not-prose">
			{/* biome-ignore lint/a11y/useMediaCaption: User-uploaded videos don't have caption tracks */}
			<video
				src={src}
				title={title}
				className="w-full rounded-lg border border-border"
				controls
				playsInline
				preload="metadata"
			/>
			{title && (
				<span className="block text-center text-sm text-muted-foreground mt-3">
					{title}
				</span>
			)}
		</span>
	);
}

export const mdxComponents = {
	h2: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
		<h2 id={slugify(textContent(children)) || undefined} {...props}>
			{children}
		</h2>
	),
	h3: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
		<h3 id={slugify(textContent(children)) || undefined} {...props}>
			{children}
		</h3>
	),
	pre: ({ children }: React.HTMLAttributes<HTMLPreElement>) => {
		const { code, language } = extractCodeFromChildren(children);
		return <BlogCodeBlock code={code} language={language} />;
	},
	code: ({
		children,
		className,
		...props
	}: React.HTMLAttributes<HTMLElement>) => {
		if (className?.includes("language-")) {
			return (
				<code className={className} {...props}>
					{children}
				</code>
			);
		}
		return (
			<code
				{...props}
				className="bg-white/5 px-1.5 py-0.5 rounded text-[0.875em] text-white/90 font-mono"
			>
				{children}
			</code>
		);
	},
	img: ({ src, alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
		<span className="block my-8 not-prose">
			{/* biome-ignore lint/performance/noImgElement: MDX images come from authors as plain paths, not static imports */}
			<img
				src={src}
				alt={alt}
				{...(typeof src === "string" ? getPublicImageSize(src) : null)}
				className="w-full rounded-lg border border-border"
				{...props}
			/>
			{alt && (
				<span className="block text-center text-sm text-muted-foreground mt-3">
					{alt}
				</span>
			)}
		</span>
	),
	Video,
	Testimonial,
	TestimonialGrid,
	Investors: () => {
		const { investors, moreInvestors } = getAbout();
		return (
			<div className="not-prose my-10">
				<Investors investors={investors} moreInvestors={moreInvestors} />
			</div>
		);
	},
	CTAButton: ({ href, children }: { href: string; children: ReactNode }) => (
		<div className="not-prose my-10 flex">
			<a
				href={href}
				className="group flex items-center gap-2 bg-foreground px-6 py-3 text-base text-background transition-colors hover:bg-brand hover:text-white"
			>
				{children}
				<span className="relative size-4 overflow-hidden">
					<HiMiniArrowDownTray className="size-4 transition-transform duration-300 ease-out group-hover:translate-y-full" />
					<HiMiniArrowDownTray className="absolute inset-0 size-4 -translate-y-full transition-transform duration-300 ease-out group-hover:translate-y-0" />
				</span>
			</a>
		</div>
	),
	LogoMarquee: () => (
		<div className="not-prose my-8">
			<LogoMarquee />
		</div>
	),
	TeamPhotos: () => {
		const photos = getAbout().photos.filter((photo) => !photo.story);
		return (
			<div className="not-prose my-10">
				<PhotoFan photos={photos} cardSpacingPx={BLOG_PHOTO_FAN_SPACING_PX} />
			</div>
		);
	},
	StoryPhoto: () => {
		const photo = getAbout().photos.find((candidate) => candidate.story);
		if (!photo) return null;
		return (
			<StoryPhoto
				photo={photo}
				sizes="(max-width: 768px) 100vw, 768px"
				className="not-prose my-8"
			/>
		);
	},
	StoreBadges: (props: React.ComponentProps<typeof StoreBadges>) => (
		<div className="not-prose my-6">
			<StoreBadges {...props} />
		</div>
	),
};
