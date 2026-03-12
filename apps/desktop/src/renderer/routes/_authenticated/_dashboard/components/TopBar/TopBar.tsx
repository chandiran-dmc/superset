import { useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { HiOutlineWifi } from "react-icons/hi2";
import { env } from "renderer/env.renderer";
import { useOnlineStatus } from "renderer/hooks/useOnlineStatus";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getWorkspaceDisplayName } from "renderer/lib/getWorkspaceDisplayName";
import { NavigationControls } from "./components/NavigationControls";
import { OpenInMenuButton } from "./components/OpenInMenuButton";
import { OrganizationDropdown } from "./components/OrganizationDropdown";
import { ResourceConsumption } from "./components/ResourceConsumption";
import { SearchBarTrigger } from "./components/SearchBarTrigger";
import { SidebarToggle } from "./components/SidebarToggle";
import { WindowControls } from "./components/WindowControls";

export function TopBar() {
	const [isNarrowViewport, setIsNarrowViewport] = useState(() => {
		if (typeof window === "undefined") return false;
		return window.matchMedia("(max-width: 1023px)").matches;
	});

	useEffect(() => {
		if (typeof window === "undefined") return;
		const mediaQuery = window.matchMedia("(max-width: 1023px)");
		const handleChange = () => setIsNarrowViewport(mediaQuery.matches);
		handleChange();
		mediaQuery.addEventListener("change", handleChange);
		return () => mediaQuery.removeEventListener("change", handleChange);
	}, []);

	const { data: platform } = electronTrpc.window.getPlatform.useQuery();
	const { workspaceId } = useParams({ strict: false });
	const { data: workspace } = electronTrpc.workspaces.get.useQuery(
		{ id: workspaceId ?? "" },
		{ enabled: !!workspaceId },
	);
	const isOnline = useOnlineStatus();
	// Default to Mac layout while loading to avoid overlap with traffic lights
	const isMac = platform === undefined || platform === "darwin";

	return (
		<div className="drag gap-2 h-12 w-full flex items-center justify-between bg-muted/45 border-b border-border relative dark:bg-muted/35">
			<div
				className="flex items-center gap-1.5 h-full"
				style={{
					paddingLeft: isMac && !isNarrowViewport ? "88px" : "16px",
				}}
			>
				<SidebarToggle />
				<NavigationControls />
				{!isNarrowViewport && <ResourceConsumption />}
			</div>

			{workspaceId && !isNarrowViewport && (
				<div className="absolute inset-0 flex items-center justify-center pointer-events-none">
					<div className="pointer-events-auto">
						<SearchBarTrigger
							workspaceName={
								workspace
									? getWorkspaceDisplayName(
											workspace.name,
											workspace.type,
											workspace.project?.name,
										)
									: undefined
							}
						/>
					</div>
				</div>
			)}

			<div className="flex items-center gap-2 h-full pr-3 shrink-0">
				{!isOnline && (
					<div className="no-drag flex items-center gap-1.5 text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
						<HiOutlineWifi className="size-3.5" />
						{!isNarrowViewport && <span>Offline</span>}
					</div>
				)}
				{workspace?.worktreePath && (
					<OpenInMenuButton
						worktreePath={workspace.worktreePath}
						branch={workspace.worktree?.branch}
						projectId={workspace.project?.id}
					/>
				)}
				{!(env.DESKTOP_WEB_MODE || env.SKIP_ENV_VALIDATION) && (
					<OrganizationDropdown />
				)}
				{!isMac && <WindowControls />}
			</div>
		</div>
	);
}
