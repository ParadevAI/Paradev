import { Trans } from "@lingui/react/macro";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { BlogCard } from "@/app/[lang]/blog/components/BlogCard";
import { type BlogPost, formatBlogDate, type TocItem } from "@/lib/blog-utils";

import { BlogAuthor } from "./components/BlogAuthor";

interface BlogPostLayoutProps {
	post: BlogPost;
	toc: TocItem[];
	relatedPosts: BlogPost[];
	children: ReactNode;
}

export function BlogPostLayout({
	post,
	relatedPosts,
	children,
}: BlogPostLayoutProps) {
	const formattedDate = formatBlogDate(post.date);
	const { author } = post;

	return (
		<article className="relative min-h-screen">
			<header className="mx-auto max-w-3xl px-6 pt-14 md:pt-20">
				<div className="flex items-center gap-2 text-xs text-muted-foreground">
					<Link
						href="/blog"
						className="transition-colors hover:text-foreground"
					>
						<Trans>Blog</Trans>
					</Link>
					<span aria-hidden="true" className="text-muted-foreground/50">
						/
					</span>
					<span>{post.category}</span>
				</div>
				<h1 className="mt-6 max-w-2xl text-balance text-4xl font-medium leading-[1.08] tracking-tight text-foreground md:text-5xl lg:text-[3.5rem]">
					{post.title}
				</h1>
				{post.description && (
					<p className="mt-5 max-w-lg text-pretty text-base leading-relaxed text-muted-foreground md:text-lg">
						{post.description}
					</p>
				)}
				<div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
					<BlogAuthor author={author} />
					<span aria-hidden="true" className="text-muted-foreground/50">
						·
					</span>
					<time dateTime={post.date}>{formattedDate}</time>
				</div>
				{post.lastUpdated && post.lastUpdated !== post.date && (
					<p className="mt-3 text-xs text-muted-foreground">
						<Trans>Last updated</Trans>{" "}
						<time dateTime={post.lastUpdated}>
							{formatBlogDate(post.lastUpdated)}
						</time>
					</p>
				)}
			</header>

			<div className="relative max-w-3xl mx-auto px-6 pt-10 pb-16 md:pt-12 md:pb-20">
				<div className="prose max-w-none">{children}</div>
			</div>

			{relatedPosts.length > 0 && (
				<section className="relative border-t border-border">
					<div className="max-w-3xl mx-auto px-6 py-12">
						<h2 className="text-xl font-medium text-foreground mb-6">
							<Trans>Related Posts</Trans>
						</h2>
						<div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
							{relatedPosts.map((relatedPost) => (
								<BlogCard key={relatedPost.slug} post={relatedPost} />
							))}
						</div>
					</div>
				</section>
			)}

			<footer className="relative border-t border-border">
				<div className="max-w-3xl mx-auto px-6 py-10">
					<Link
						href="/blog"
						className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
					>
						<ArrowLeft className="h-4 w-4" />
						<Trans>All posts</Trans>
					</Link>
				</div>
			</footer>
		</article>
	);
}
