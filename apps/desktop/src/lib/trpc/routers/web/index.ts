import { router } from "../..";
import { createAnalyticsRouter } from "../analytics";
import { createBrowserHistoryRouter } from "../browser-history";
import { createChangesRouter } from "../changes";
import { createConfigRouter } from "../config";
import { createExternalRouter } from "../external";
import { createFilesystemRouter } from "../filesystem";
import { createHostServiceManagerRouter } from "../host-service-manager";
import { createMenuRouter } from "../menu";
import { createPortsRouter } from "../ports";
import { createProjectsRouter } from "../projects";
import { createSettingsRouter } from "../settings";
import { createTerminalRouter } from "../terminal";
import { createUiStateRouter } from "../ui-state";
import { createWorkspacesRouter } from "../workspaces";
import {
	createWebAuthRouter,
	createWebAutoUpdateRouter,
	createWebBrowserRouter,
	createWebCacheRouter,
	createWebChatMastraServiceRouter,
	createWebChatServiceRouter,
	createWebHotkeysRouter,
	createWebModelProvidersRouter,
	createWebNotificationsRouter,
	createWebPermissionsRouter,
	createWebResourceMetricsRouter,
	createWebRingtoneRouter,
	createWebWindowRouter,
} from "./stubs";

export const createWebAppRouter = () => {
	return router({
		chatMastraService: createWebChatMastraServiceRouter(),
		chatService: createWebChatServiceRouter(),
		analytics: createAnalyticsRouter(),
		browser: createWebBrowserRouter(),
		browserHistory: createBrowserHistoryRouter(),
		auth: createWebAuthRouter(),
		autoUpdate: createWebAutoUpdateRouter(),
		cache: createWebCacheRouter(),
		modelProviders: createWebModelProvidersRouter(),
		window: createWebWindowRouter(),
		projects: createProjectsRouter(() => null),
		workspaces: createWorkspacesRouter(),
		terminal: createTerminalRouter(),
		changes: createChangesRouter(),
		filesystem: createFilesystemRouter(),
		notifications: createWebNotificationsRouter(),
		permissions: createWebPermissionsRouter(),
		ports: createPortsRouter(),
		resourceMetrics: createWebResourceMetricsRouter(),
		menu: createMenuRouter(),
		hotkeys: createWebHotkeysRouter(),
		external: createExternalRouter(),
		settings: createSettingsRouter(),
		config: createConfigRouter(),
		uiState: createUiStateRouter(),
		ringtone: createWebRingtoneRouter(),
		hostServiceManager: createHostServiceManagerRouter(),
	});
};

export type WebAppRouter = ReturnType<typeof createWebAppRouter>;
