import { useEffect, useRef, useState } from "react";
import { env } from "renderer/env.renderer";
import { useCreateOrAttachWithTheme } from "renderer/hooks/useCreateOrAttachWithTheme";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import type {
	TerminalClearScrollbackMutate,
	TerminalDetachMutate,
	TerminalResizeMutate,
	TerminalWriteCallbacks,
	TerminalWriteMutate,
} from "../types";

export interface UseTerminalConnectionOptions {
	workspaceId: string;
}

const WEB_WRITE_BUFFER_FLUSH_DELAY_MS = 4;
const WEB_IMMEDIATE_WRITE_MAX_BYTES = 4;

/**
 * Hook to manage terminal connection state and mutations.
 *
 * Encapsulates:
 * - createOrAttach mutation (for lifecycle callbacks)
 * - imperative tRPC calls for write/resize/detach/clearScrollback hot paths
 * - Stable refs to mutation functions (to avoid re-renders)
 * - Connection error state
 * - Workspace CWD query
 *
 * NOTE: Stream subscription is intentionally NOT included here because it needs
 * direct access to xterm refs for event handling. Keep that in the component.
 */
export function useTerminalConnection({
	workspaceId,
}: UseTerminalConnectionOptions) {
	const [connectionError, setConnectionError] = useState<string | null>(null);
	const pendingWritesByPaneRef = useRef<
		Map<
			string,
			{
				data: string;
				callbacks: TerminalWriteCallbacks[];
			}
		>
	>(new Map());
	const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// tRPC mutations
	const createOrAttachMutation = useCreateOrAttachWithTheme();

	// Query for workspace cwd
	const { data: workspaceCwd } =
		electronTrpc.terminal.getWorkspaceCwd.useQuery(workspaceId);

	// Stable refs - these don't change identity on re-render
	const createOrAttachRef = useRef(createOrAttachMutation.mutate);

	const flushBufferedWrites = () => {
		if (flushTimerRef.current) {
			clearTimeout(flushTimerRef.current);
			flushTimerRef.current = null;
		}

		const pendingEntries = Array.from(pendingWritesByPaneRef.current.entries());
		if (pendingEntries.length === 0) return;
		pendingWritesByPaneRef.current.clear();

		for (const [paneId, pending] of pendingEntries) {
			electronTrpcClient.terminal.write
				.mutate({ paneId, data: pending.data })
				.then(() => {
					for (const callbacks of pending.callbacks) {
						callbacks.onSuccess?.();
					}
				})
				.catch((error) => {
					const payload = {
						message: error instanceof Error ? error.message : "Write failed",
					};
					for (const callbacks of pending.callbacks) {
						callbacks.onError?.(payload);
					}
				})
				.finally(() => {
					for (const callbacks of pending.callbacks) {
						callbacks.onSettled?.();
					}
				});
		}
	};

	const scheduleBufferedWriteFlush = () => {
		if (flushTimerRef.current) return;
		flushTimerRef.current = setTimeout(() => {
			flushBufferedWrites();
		}, WEB_WRITE_BUFFER_FLUSH_DELAY_MS);
	};

	// Use imperative client calls for write/resize/detach/clear to avoid
	// mutation-observer re-renders on every keystroke.
	const writeRef = useRef<TerminalWriteMutate>((input, callbacks) => {
		if (env.DESKTOP_WEB_MODE) {
			// Keep normal typing low-latency by sending tiny writes immediately.
			// Larger chunks (paste/streamed text) still use the buffer.
			if (
				input.data.length <= WEB_IMMEDIATE_WRITE_MAX_BYTES &&
				!pendingWritesByPaneRef.current.has(input.paneId)
			) {
				electronTrpcClient.terminal.write
					.mutate(input)
					.then(() => {
						callbacks?.onSuccess?.();
					})
					.catch((error) => {
						callbacks?.onError?.({
							message: error instanceof Error ? error.message : "Write failed",
						});
					})
					.finally(() => {
						callbacks?.onSettled?.();
					});
				return;
			}

			const existing = pendingWritesByPaneRef.current.get(input.paneId);
			if (existing) {
				existing.data += input.data;
				if (callbacks) {
					existing.callbacks.push(callbacks);
				}
			} else {
				pendingWritesByPaneRef.current.set(input.paneId, {
					data: input.data,
					callbacks: callbacks ? [callbacks] : [],
				});
			}
			scheduleBufferedWriteFlush();
			return;
		}

		electronTrpcClient.terminal.write
			.mutate(input)
			.then(() => {
				callbacks?.onSuccess?.();
			})
			.catch((error) => {
				callbacks?.onError?.({
					message: error instanceof Error ? error.message : "Write failed",
				});
			})
			.finally(() => {
				callbacks?.onSettled?.();
			});
	});

	useEffect(() => {
		return () => {
			flushBufferedWrites();
		};
	}, []);

	const resizeRef = useRef<TerminalResizeMutate>((input) => {
		electronTrpcClient.terminal.resize.mutate(input).catch((error) => {
			console.warn("[Terminal] Failed to resize terminal:", error);
		});
	});
	const detachRef = useRef<TerminalDetachMutate>((input) => {
		electronTrpcClient.terminal.detach.mutate(input).catch((error) => {
			console.warn("[Terminal] Failed to detach terminal:", error);
		});
	});
	const clearScrollbackRef = useRef<TerminalClearScrollbackMutate>((input) => {
		electronTrpcClient.terminal.clearScrollback.mutate(input).catch((error) => {
			console.warn("[Terminal] Failed to clear scrollback:", error);
		});
	});

	// Keep refs up to date
	createOrAttachRef.current = createOrAttachMutation.mutate;

	return {
		// Connection error state
		connectionError,
		setConnectionError,

		// Workspace CWD from query
		workspaceCwd,

		// Stable refs to mutation functions (use these in effects/callbacks)
		refs: {
			createOrAttach: createOrAttachRef,
			write: writeRef,
			resize: resizeRef,
			detach: detachRef,
			clearScrollback: clearScrollbackRef,
		},
	};
}
