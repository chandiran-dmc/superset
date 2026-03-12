import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir, hostname } from "node:os";
import { extname } from "node:path";
import { AUTH_PROVIDERS } from "@superset/shared/constants";
import { observable } from "@trpc/server/observable";
import { showOpenDialogCompat } from "main/lib/electron-optional";
import { deriveModelProviderStatus } from "shared/ai/provider-status";
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
			.mutation(async ({ input }) => {
				const result = await showOpenDialogCompat({
					options: {
						properties: ["openDirectory", "createDirectory"],
						title: input?.title ?? "Select Directory",
						defaultPath: input?.defaultPath ?? undefined,
					},
				});

				if (result.canceled || result.filePaths.length === 0) {
					return { canceled: true, path: null };
				}

				return { canceled: false, path: result.filePaths[0] };
			}),
		selectImageFile: publicProcedure.mutation(async () => {
			const result = await showOpenDialogCompat({
				options: {
					properties: ["openFile"],
					title: "Select Organization Logo",
					filters: [
						{
							name: "Images",
							extensions: ["png", "jpg", "jpeg", "webp"],
						},
					],
				},
			});

			if (result.canceled || result.filePaths.length === 0) {
				return { canceled: true, dataUrl: null };
			}

			try {
				const filePath = result.filePaths[0];
				const buffer = await readFile(filePath);
				const extension = extname(filePath).slice(1).toLowerCase();
				const mimeType = extension === "jpg" ? "jpeg" : extension || "png";
				const dataUrl = `data:image/${mimeType};base64,${buffer.toString("base64")}`;

				return { canceled: false, dataUrl };
			} catch {
				return { canceled: true, dataUrl: null };
			}
		}),
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

const webAuthStatus = {
	authenticated: false,
	method: null,
	source: null,
	issue: null,
	hasManagedOAuth: false,
} as const;

const webSlashCommands = [
	{
		name: "new",
		aliases: [],
		description: "Start a new session",
		argumentHint: "",
		kind: "builtin" as const,
		source: "builtin" as const,
		action: {
			type: "new_session" as const,
		},
	},
	{
		name: "clear",
		aliases: [],
		description: "Clear context into a fresh session",
		argumentHint: "",
		kind: "builtin" as const,
		source: "builtin" as const,
		action: {
			type: "new_session" as const,
		},
	},
	{
		name: "stop",
		aliases: [],
		description: "Stop active response",
		argumentHint: "",
		kind: "builtin" as const,
		source: "builtin" as const,
		action: {
			type: "stop_stream" as const,
		},
	},
	{
		name: "model",
		aliases: [],
		description: "Set active model",
		argumentHint: "<model>",
		kind: "builtin" as const,
		source: "builtin" as const,
		action: {
			type: "set_model" as const,
			passArguments: true,
		},
	},
	{
		name: "mcp",
		aliases: [],
		description: "Show MCP server overview",
		argumentHint: "",
		kind: "builtin" as const,
		source: "builtin" as const,
		action: {
			type: "show_mcp_overview" as const,
		},
	},
];

function resolveWebSlashCommand(text: string) {
	const trimmed = text.trim();
	const match = trimmed.match(/^\/([^\s]+)(?:\s+([\s\S]*))?$/);
	if (!match) {
		return { handled: false as const };
	}

	const invokedAs = (match[1] ?? "").toLowerCase();
	const argument = (match[2] ?? "").trim();

	if (invokedAs === "new" || invokedAs === "clear") {
		return {
			handled: true as const,
			commandName: invokedAs === "clear" ? "clear" : "new",
			invokedAs,
			action: {
				type: "new_session" as const,
			},
		};
	}

	if (invokedAs === "stop") {
		return {
			handled: true as const,
			commandName: "stop",
			invokedAs,
			action: {
				type: "stop_stream" as const,
			},
		};
	}

	if (invokedAs === "model") {
		return {
			handled: true as const,
			commandName: "model",
			invokedAs,
			action: {
				type: "set_model" as const,
				argument: argument || undefined,
			},
		};
	}

	if (invokedAs === "mcp") {
		return {
			handled: true as const,
			commandName: "mcp",
			invokedAs,
			action: {
				type: "show_mcp_overview" as const,
			},
		};
	}

	return { handled: false as const };
}

export const createWebChatServiceRouter = () => {
	return router({
		workspace: router({
			searchFiles: publicProcedure
				.input(
					z.object({
						rootPath: z.string(),
						query: z.string(),
						includeHidden: z.boolean().default(false),
						limit: z.number().default(20),
					}),
				)
				.query(() => []),
			getSlashCommands: publicProcedure
				.input(
					z.object({
						cwd: z.string(),
					}),
				)
				.query(() => webSlashCommands),
			getMcpOverview: publicProcedure
				.input(
					z.object({
						cwd: z.string(),
					}),
				)
				.query(() => ({ sourcePath: null, servers: [] })),
			resolveSlashCommand: publicProcedure
				.input(
					z.object({
						cwd: z.string(),
						text: z.string(),
					}),
				)
				.mutation(({ input }) => resolveWebSlashCommand(input.text)),
			previewSlashCommand: publicProcedure
				.input(
					z.object({
						cwd: z.string(),
						text: z.string(),
					}),
				)
				.query(({ input }) => resolveWebSlashCommand(input.text)),
		}),
		auth: router({
			getAnthropicStatus: publicProcedure.query(() => webAuthStatus),
			getOpenAIStatus: publicProcedure.query(() => webAuthStatus),
			startOpenAIOAuth: publicProcedure.mutation(() => ({
				url: "",
				instructions: "OpenAI OAuth is unavailable in local web mode",
			})),
			completeOpenAIOAuth: publicProcedure
				.input(z.object({ code: z.string().optional() }))
				.mutation(() => ({ success: true as const })),
			cancelOpenAIOAuth: publicProcedure.mutation(() => ({
				success: true as const,
			})),
			disconnectOpenAIOAuth: publicProcedure.mutation(() => ({
				success: true as const,
			})),
			startAnthropicOAuth: publicProcedure.mutation(() => ({
				url: "",
				instructions: "Anthropic OAuth is unavailable in local web mode",
			})),
			completeAnthropicOAuth: publicProcedure
				.input(z.object({ code: z.string().min(1) }))
				.mutation(() => ({ success: true as const, expiresAt: Date.now() })),
			cancelAnthropicOAuth: publicProcedure.mutation(() => ({
				success: true as const,
			})),
			disconnectAnthropicOAuth: publicProcedure.mutation(() => ({
				success: true as const,
			})),
			setAnthropicApiKey: publicProcedure
				.input(z.object({ apiKey: z.string().min(1) }))
				.mutation(() => ({ success: true as const })),
			getAnthropicEnvConfig: publicProcedure.query(() => ({
				envText: "",
				variables: {},
			})),
			setAnthropicEnvConfig: publicProcedure
				.input(z.object({ envText: z.string() }))
				.mutation(() => ({ success: true as const })),
			clearAnthropicEnvConfig: publicProcedure.mutation(() => ({
				success: true as const,
			})),
			clearAnthropicApiKey: publicProcedure.mutation(() => ({
				success: true as const,
			})),
			setOpenAIApiKey: publicProcedure
				.input(z.object({ apiKey: z.string().min(1) }))
				.mutation(() => ({ success: true as const })),
			clearOpenAIApiKey: publicProcedure.mutation(() => ({
				success: true as const,
			})),
		}),
	});
};

export const createWebChatMastraServiceRouter = () => {
	return router({});
};

export const createWebModelProvidersRouter = () => {
	return router({
		getStatuses: publicProcedure.query(() => {
			return [
				deriveModelProviderStatus({
					providerId: "anthropic",
					authStatus: webAuthStatus,
					diagnostic: null,
				}),
				deriveModelProviderStatus({
					providerId: "openai",
					authStatus: webAuthStatus,
					diagnostic: null,
				}),
			];
		}),
		clearIssue: publicProcedure
			.input(z.object({ providerId: z.enum(["anthropic", "openai"]) }))
			.mutation(() => ({ success: true as const })),
	});
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
