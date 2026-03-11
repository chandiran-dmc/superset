import { createHash } from "node:crypto";
import { homedir, hostname } from "node:os";
import { AUTH_PROVIDERS } from "@superset/shared/constants";
import { observable } from "@trpc/server/observable";
import { AUTO_UPDATE_STATUS } from "shared/auto-update";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { createFallbackResourceMetricsSnapshot } from "../resource-metrics.schema";

function emptySubscription<T>() {
	return observable<T>(() => {
		return () => {
			// No-op.
		};
	});
}

export const createWebAuthRouter = () => {
	return router({
		getStoredToken: publicProcedure.query(() => null),

		getDeviceInfo: publicProcedure.query(() => {
			const input = `${hostname()}::${homedir()}`;
			const deviceId = createHash("sha256").update(input).digest("hex");
			return {
				deviceId,
				deviceName: hostname(),
			};
		}),

		persistToken: publicProcedure
			.input(
				z.object({
					token: z.string(),
					expiresAt: z.string(),
				}),
			)
			.mutation(() => ({ success: true })),

		onTokenChanged: publicProcedure.subscription(() =>
			emptySubscription<{ token: string; expiresAt: string } | null>(),
		),

		signIn: publicProcedure
			.input(z.object({ provider: z.enum(AUTH_PROVIDERS) }))
			.mutation(({ input }) => ({
				success: false,
				error: `Sign-in via ${input.provider} is disabled in local web mode`,
			})),

		signOut: publicProcedure.mutation(() => ({ success: true })),
	});
};

export const createWebWindowRouter = () => {
	return router({
		minimize: publicProcedure.mutation(() => ({ success: false })),
		maximize: publicProcedure.mutation(() => ({
			success: false,
			isMaximized: false,
		})),
		close: publicProcedure.mutation(() => ({ success: false })),
		isMaximized: publicProcedure.query(() => false),
		getPlatform: publicProcedure.query(() => process.platform),
		getHomeDir: publicProcedure.query(() => homedir()),
		selectDirectory: publicProcedure
			.input(
				z
					.object({
						title: z.string().optional(),
						defaultPath: z.string().optional(),
					})
					.optional(),
			)
			.mutation(() => ({ canceled: true, path: null })),
		selectImageFile: publicProcedure.mutation(() => ({
			canceled: true,
			dataUrl: null,
		})),
	});
};

export const createWebHotkeysRouter = () => {
	return router({
		export: publicProcedure.mutation(() => ({ canceled: true })),
		import: publicProcedure.mutation(() => ({ canceled: true })),
	});
};

export const createWebPermissionsRouter = () => {
	return router({
		getStatus: publicProcedure.query(() => ({
			fullDiskAccess: false,
			accessibility: false,
			microphone: false,
		})),
		requestFullDiskAccess: publicProcedure.mutation(() => undefined),
		requestAccessibility: publicProcedure.mutation(() => undefined),
		requestMicrophone: publicProcedure.mutation(() => ({ granted: false })),
		requestAppleEvents: publicProcedure.mutation(() => undefined),
		requestLocalNetwork: publicProcedure.mutation(() => undefined),
	});
};

export const createWebRingtoneRouter = () => {
	return router({
		preview: publicProcedure
			.input(z.object({ ringtoneId: z.string() }))
			.mutation(() => ({ success: true as const })),
		stop: publicProcedure.mutation(() => ({ success: true as const })),
		getCustom: publicProcedure.query(() => null),
		importCustom: publicProcedure.mutation(() => ({
			canceled: true as const,
			ringtone: null,
		})),
	});
};

export const createWebBrowserRouter = () => {
	return router({
		register: publicProcedure
			.input(z.object({ paneId: z.string(), webContentsId: z.number() }))
			.mutation(() => ({ success: true })),
		unregister: publicProcedure
			.input(z.object({ paneId: z.string() }))
			.mutation(() => ({ success: true })),
		navigate: publicProcedure
			.input(z.object({ paneId: z.string(), url: z.string() }))
			.mutation(() => ({ success: true })),
		goBack: publicProcedure
			.input(z.object({ paneId: z.string() }))
			.mutation(() => ({ success: true })),
		goForward: publicProcedure
			.input(z.object({ paneId: z.string() }))
			.mutation(() => ({ success: true })),
		reload: publicProcedure
			.input(z.object({ paneId: z.string(), hard: z.boolean().optional() }))
			.mutation(() => ({ success: true })),
		screenshot: publicProcedure
			.input(z.object({ paneId: z.string() }))
			.mutation(async () => ({ base64: "" })),
		evaluateJS: publicProcedure
			.input(z.object({ paneId: z.string(), code: z.string() }))
			.mutation(async () => ({ result: null })),
		getConsoleLogs: publicProcedure
			.input(z.object({ paneId: z.string() }))
			.query(
				() =>
					[] as Array<{ level: string; message: string; timestamp: number }>,
			),
		consoleStream: publicProcedure
			.input(z.object({ paneId: z.string() }))
			.subscription(() =>
				emptySubscription<{
					level: string;
					message: string;
					timestamp: number;
				}>(),
			),
		onNewWindow: publicProcedure
			.input(z.object({ paneId: z.string() }))
			.subscription(() => emptySubscription<{ url: string }>()),
		onContextMenuAction: publicProcedure
			.input(z.object({ paneId: z.string() }))
			.subscription(() => emptySubscription<{ action: string; url: string }>()),
		openDevTools: publicProcedure
			.input(z.object({ paneId: z.string() }))
			.mutation(() => ({ success: true })),
		getDevToolsUrl: publicProcedure
			.input(z.object({ browserPaneId: z.string() }))
			.query(async () => ({ url: null as string | null })),
		getPageInfo: publicProcedure
			.input(z.object({ paneId: z.string() }))
			.query(() => null),
		clearBrowsingData: publicProcedure
			.input(
				z.object({
					type: z.enum(["cookies", "cache", "storage", "all"]),
				}),
			)
			.mutation(async () => ({ success: true })),
	});
};

export const createWebAutoUpdateRouter = () => {
	return router({
		subscribe: publicProcedure.subscription(() => {
			return observable<{ status: string; version?: string; error?: string }>(
				(emit) => {
					emit.next({ status: AUTO_UPDATE_STATUS.IDLE });
					return () => {
						// No-op.
					};
				},
			);
		}),
		getStatus: publicProcedure.query(() => ({
			status: AUTO_UPDATE_STATUS.IDLE,
		})),
		check: publicProcedure.mutation(() => undefined),
		install: publicProcedure.mutation(() => undefined),
		dismiss: publicProcedure.mutation(() => undefined),
		simulateReady: publicProcedure.mutation(() => undefined),
		simulateDownloading: publicProcedure.mutation(() => undefined),
		simulateError: publicProcedure.mutation(() => undefined),
	});
};

export const createWebCacheRouter = () => {
	return router({
		clearElectricCache: publicProcedure.mutation(async () => ({
			success: true,
		})),
	});
};

export const createWebChatServiceRouter = () => {
	return router({});
};

export const createWebChatMastraServiceRouter = () => {
	return router({});
};

export const createWebModelProvidersRouter = () => {
	return router({});
};

export const createWebHostServiceManagerRouter = () => {
	return router({});
};

export const createWebConfigRouter = () => {
	return router({});
};

export const createWebNotificationsRouter = () => {
	return router({
		subscribe: publicProcedure.subscription(() =>
			emptySubscription<{
				type: string;
				data?: Record<string, unknown>;
			}>(),
		),
	});
};

export const createWebResourceMetricsRouter = () => {
	return router({
		getSnapshot: publicProcedure
			.input(
				z
					.object({
						mode: z.enum(["interactive", "idle"]).optional(),
						force: z.boolean().optional(),
					})
					.optional(),
			)
			.query(() => createFallbackResourceMetricsSnapshot()),
	});
};
