import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import { ScrollArea } from "@superset/ui/scroll-area";
import { Spinner } from "@superset/ui/spinner";
import { useEffect, useMemo, useState } from "react";
import {
	LuChevronUp,
	LuFolder,
	LuHouse,
	LuLoaderCircle,
	LuRefreshCw,
} from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useProjectPathPickerDialogStore } from "renderer/stores/project-path-picker-dialog";

export function ProjectPathPickerDialog() {
	const { isOpen, initialPath, onConfirm, onCancel, close } =
		useProjectPathPickerDialogStore();
	const [browsePath, setBrowsePath] = useState<string | undefined>(undefined);
	const [pathInput, setPathInput] = useState("");

	const { data: homeDir } = electronTrpc.window.getHomeDir.useQuery(undefined, {
		enabled: isOpen,
	});

	const directoriesQuery = electronTrpc.projects.listDirectories.useQuery(
		browsePath ? { path: browsePath } : undefined,
		{
			enabled: isOpen,
			retry: false,
		},
	);

	useEffect(() => {
		if (!isOpen) return;
		const nextPath = initialPath ?? undefined;
		setBrowsePath(nextPath);
		setPathInput(nextPath ?? "");
	}, [isOpen, initialPath]);

	useEffect(() => {
		if (!isOpen || !directoriesQuery.data?.currentPath) return;
		setPathInput(directoriesQuery.data.currentPath);
	}, [isOpen, directoriesQuery.data?.currentPath]);

	const currentPath = useMemo(
		() => directoriesQuery.data?.currentPath ?? pathInput,
		[directoriesQuery.data?.currentPath, pathInput],
	);

	const handleClose = () => {
		onCancel?.();
		close();
	};

	const handleGo = () => {
		const target = pathInput.trim();
		setBrowsePath(target.length > 0 ? target : undefined);
	};

	const handleConfirm = () => {
		if (!directoriesQuery.data?.currentPath) return;
		onConfirm?.([directoriesQuery.data.currentPath]);
		close();
	};

	return (
		<Dialog
			open={isOpen}
			onOpenChange={(open) => {
				if (!open) handleClose();
			}}
		>
			<DialogContent className="sm:max-w-[640px]">
				<DialogHeader>
					<DialogTitle>Open Project on Server</DialogTitle>
					<DialogDescription>
						Browse folders on the machine running the backend and select a
						repository root.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-3">
					<div className="flex items-center gap-2">
						<Button
							type="button"
							variant="outline"
							size="icon"
							onClick={() => setBrowsePath(homeDir ?? undefined)}
							disabled={!homeDir || directoriesQuery.isPending}
							aria-label="Go to home directory"
						>
							<LuHouse className="size-4" />
						</Button>
						<Button
							type="button"
							variant="outline"
							size="icon"
							onClick={() => {
								const parentPath = directoriesQuery.data?.parentPath;
								if (parentPath) setBrowsePath(parentPath);
							}}
							disabled={
								!directoriesQuery.data?.parentPath || directoriesQuery.isPending
							}
							aria-label="Go to parent directory"
						>
							<LuChevronUp className="size-4" />
						</Button>
						<Button
							type="button"
							variant="outline"
							size="icon"
							onClick={() => void directoriesQuery.refetch()}
							disabled={directoriesQuery.isFetching}
							aria-label="Refresh directory list"
						>
							{directoriesQuery.isFetching ? (
								<LuLoaderCircle className="size-4 animate-spin" />
							) : (
								<LuRefreshCw className="size-4" />
							)}
						</Button>
						<Input
							value={pathInput}
							onChange={(event) => setPathInput(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									event.preventDefault();
									handleGo();
								}
							}}
							placeholder="/absolute/path/on/server"
							className="font-mono text-xs"
						/>
						<Button type="button" variant="secondary" onClick={handleGo}>
							Go
						</Button>
					</div>

					<div className="rounded-md border border-border">
						<ScrollArea className="h-72">
							<div className="p-1">
								{directoriesQuery.isPending && (
									<div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
										<Spinner className="size-4" />
										Loading directories...
									</div>
								)}

								{directoriesQuery.error && (
									<div className="p-3 text-sm text-destructive">
										{directoriesQuery.error.message}
									</div>
								)}

								{directoriesQuery.data &&
									directoriesQuery.data.directories.length === 0 && (
										<div className="p-3 text-sm text-muted-foreground">
											No subdirectories in this folder.
										</div>
									)}

								{directoriesQuery.data?.directories.map((directory) => (
									<button
										key={directory.path}
										type="button"
										onClick={() => setBrowsePath(directory.path)}
										className="w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
									>
										<LuFolder className="size-4 shrink-0 text-muted-foreground" />
										<span className="truncate">{directory.name}</span>
									</button>
								))}
							</div>
						</ScrollArea>
					</div>

					<div className="text-xs text-muted-foreground font-mono break-all">
						Current: {currentPath || "Not selected"}
					</div>
				</div>

				<DialogFooter>
					<Button type="button" variant="outline" onClick={handleClose}>
						Cancel
					</Button>
					<Button
						type="button"
						onClick={handleConfirm}
						disabled={!directoriesQuery.data?.currentPath}
					>
						Open This Folder
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
