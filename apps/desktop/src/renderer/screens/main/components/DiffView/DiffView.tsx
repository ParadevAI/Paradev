import { useState } from 'react';

import { ChevronRight, ChevronDown, File, FilePlus, FileX, FileEdit, RefreshCw, X } from 'lucide-react';
import { Button } from '@superset/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@superset/ui/tooltip';

import type { DiffViewData, FileDiff } from './types';
import { DiffContent } from './DiffContent';
import { DiffSummary } from './DiffSummary';

interface DiffViewProps {
	data: DiffViewData;
	onRefresh?: () => void;
	isRefreshing?: boolean;
	onClose?: () => void;
}

export function DiffView({ data, onRefresh, isRefreshing = false, onClose }: DiffViewProps) {
	const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set([data.files[0]?.id]));
	const [selectedFile, setSelectedFile] = useState<string | null>(data.files[0]?.id || null);

	const toggleFile = (fileId: string) => {
		const newExpanded = new Set(expandedFiles);
		if (newExpanded.has(fileId)) {
			newExpanded.delete(fileId);
		} else {
			newExpanded.add(fileId);
		}
		setExpandedFiles(newExpanded);
	};

	const getFileIcon = (status: FileDiff['status']) => {
		switch (status) {
			case 'added':
				return <FilePlus className="w-3.5 h-3.5 text-emerald-400" />;
			case 'deleted':
				return <FileX className="w-3.5 h-3.5 text-rose-400" />;
			case 'modified':
				return <FileEdit className="w-3.5 h-3.5 text-sky-400" />;
			default:
				return <File className="w-3.5 h-3.5 text-zinc-500" />;
		}
	};

	const totalAdditions = data.files.reduce((sum, file) => sum + file.additions, 0);
	const totalDeletions = data.files.reduce((sum, file) => sum + file.deletions, 0);

	return (
		<div className="h-screen flex flex-col bg-[#1a1a1a]">
			{/* Cleaner, more minimal header */}
			<div className="border-b border-white/5 px-4 py-3 bg-[#1a1a1a]">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-3 flex-1 min-w-0">
						<h1 className="text-sm font-medium text-zinc-200 truncate">{data.title}</h1>
						{data.description && (
							<span className="text-xs text-zinc-500">•</span>
						)}
						{data.description && (
							<span className="text-xs text-zinc-500 truncate">{data.description}</span>
						)}
					</div>
					<div className="flex items-center gap-4 shrink-0">
						<div className="flex items-center gap-3 text-xs">
							<span className="text-zinc-500">{data.files.length} {data.files.length === 1 ? 'file' : 'files'}</span>
							<span className="text-emerald-400">+{totalAdditions}</span>
							<span className="text-rose-400">-{totalDeletions}</span>
						</div>
						<div className="flex items-center gap-1">
							{onRefresh && (
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											variant="ghost"
											size="icon-sm"
											onClick={onRefresh}
											disabled={isRefreshing}
											className="h-7 w-7 text-zinc-400 hover:text-zinc-200 hover:bg-white/5"
										>
											<RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
										</Button>
									</TooltipTrigger>
									<TooltipContent side="bottom">
										<p>Refresh diff</p>
									</TooltipContent>
								</Tooltip>
							)}
							{onClose && (
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											variant="ghost"
											size="icon-sm"
											onClick={onClose}
											className="h-7 w-7 text-zinc-400 hover:text-zinc-200 hover:bg-white/5"
										>
											<X className="w-3.5 h-3.5" />
										</Button>
									</TooltipTrigger>
									<TooltipContent side="bottom">
										<p>Close diff view</p>
									</TooltipContent>
								</Tooltip>
							)}
						</div>
					</div>
				</div>
			</div>

			<div className="flex flex-1 overflow-hidden">
				{/* Cleaner sidebar with better spacing and hover states */}
				<div className="w-72 border-r border-white/5 overflow-y-auto bg-[#1a1a1a]">
					<div className="py-2">
						<div className="px-3 py-2">
							<h2 className="text-xs font-medium text-zinc-500">
								Files
							</h2>
						</div>
						<div className="space-y-0.5 px-2">
							{data.files.map((file) => (
								<div key={file.id}>
									<button
										onClick={() => {
											toggleFile(file.id);
											setSelectedFile(file.id);
										}}
										className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-all duration-150 ${
											selectedFile === file.id
												? 'bg-white/8 text-zinc-100'
												: 'hover:bg-white/5 text-zinc-300'
										}`}
										type="button"
									>
										{expandedFiles.has(file.id) ? (
											<ChevronDown className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
										) : (
											<ChevronRight className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
										)}
										{getFileIcon(file.status)}
										<div className="flex-1 min-w-0">
											<div className="text-xs font-medium truncate">
												{file.fileName}
											</div>
											<div className="text-[10px] text-zinc-600 truncate">{file.filePath}</div>
										</div>
										<div className="flex items-center gap-1.5 shrink-0 text-[10px]">
											{file.additions > 0 && (
												<span className="text-emerald-400">+{file.additions}</span>
											)}
											{file.deletions > 0 && (
												<span className="text-rose-400">-{file.deletions}</span>
											)}
										</div>
									</button>
									{expandedFiles.has(file.id) && file.summary && (
										<div className="ml-8 mr-2 mt-1.5 mb-2">
											<DiffSummary summary={file.summary} status={file.status} />
										</div>
									)}
								</div>
							))}
						</div>
					</div>
				</div>

				<div className="flex-1 overflow-hidden">
					{selectedFile && (
						<DiffContent
							file={data.files.find((f) => f.id === selectedFile)!}
						/>
					)}
				</div>
			</div>
		</div>
	);
}

