import { useEffect, useMemo, useRef, useState } from "react";
import { env } from "renderer/env.renderer";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import type { ChangeCategory } from "shared/changes-types";
import { isImageFile } from "shared/file-types";

const BRANCH_QUERY_STALE_TIME_MS = 10_000;
const WEB_RAW_FALLBACK_DELAY_MS = 800;
const WEB_RAW_FALLBACK_TIMEOUT_MS = 4_000;

interface UseFileContentParams {
	worktreePath: string;
	filePath: string;
	viewMode: "raw" | "diff" | "rendered";
	diffCategory?: ChangeCategory;
	commitHash?: string;
	oldPath?: string;
	isDirty: boolean;
	originalContentRef: React.MutableRefObject<string>;
	originalDiffContentRef: React.MutableRefObject<string>;
}

export function useFileContent({
	worktreePath,
	filePath,
	viewMode,
	diffCategory,
	commitHash,
	oldPath,
	isDirty,
	originalContentRef,
	originalDiffContentRef,
}: UseFileContentParams) {
	// For remote URLs (e.g. Vercel Blob), skip all IPC queries
	const isRemote =
		filePath.startsWith("https://") || filePath.startsWith("http://");

	const { data: branchData } = electronTrpc.changes.getBranches.useQuery(
		{ worktreePath },
		{
			enabled: !isRemote && !!worktreePath && diffCategory === "against-base",
			staleTime: BRANCH_QUERY_STALE_TIME_MS,
			refetchOnWindowFocus: false,
		},
	);
	const effectiveBaseBranch =
		branchData?.worktreeBaseBranch ?? branchData?.defaultBranch ?? "main";

	const isImage = isImageFile(filePath);
	const rawQueryEnabled =
		!isRemote &&
		viewMode !== "diff" &&
		!isImage &&
		!!filePath &&
		!!worktreePath;

	const { data: rawFileData, isLoading: isLoadingRaw } =
		electronTrpc.changes.readWorkingFile.useQuery(
			{ worktreePath, absolutePath: filePath },
			{
				enabled: rawQueryEnabled,
			},
		);

	const [fallbackRawFileData, setFallbackRawFileData] =
		useState<typeof rawFileData>();
	const [isFallbackRawLoading, setIsFallbackRawLoading] = useState(false);
	const requestedFallbackKeyRef = useRef<string | null>(null);
	const currentRawFileKey = rawQueryEnabled ? `${worktreePath}::${filePath}` : null;

	useEffect(() => {
		setFallbackRawFileData(undefined);
		setIsFallbackRawLoading(false);
		requestedFallbackKeyRef.current = null;
	}, [worktreePath, filePath, viewMode, isRemote, isImage]);

	useEffect(() => {
		if (!env.DESKTOP_WEB_MODE) return;
		if (!rawQueryEnabled) return;
		if (rawFileData !== undefined) return;

		const fallbackKey = `${worktreePath}::${filePath}`;
		if (requestedFallbackKeyRef.current === fallbackKey) return;

		let isActive = true;
		const timeoutId = setTimeout(() => {
			requestedFallbackKeyRef.current = fallbackKey;
			setIsFallbackRawLoading(true);

			Promise.race([
				electronTrpcClient.changes.readWorkingFile.query({
					worktreePath,
					absolutePath: filePath,
				}),
				new Promise<never>((_, reject) => {
					setTimeout(() => {
						reject(new Error("readWorkingFile fallback timed out"));
					}, WEB_RAW_FALLBACK_TIMEOUT_MS);
				}),
			])
				.then((result) => {
					if (!isActive) return;
					setFallbackRawFileData(result);
				})
				.catch((error) => {
					if (!isActive) return;
					console.warn("[useFileContent] Fallback readWorkingFile failed", {
						worktreePath,
						filePath,
						error,
					});
					setFallbackRawFileData({
						ok: false,
						reason: "not-found",
					});
				})
				.finally(() => {
					if (!isActive) return;
					setIsFallbackRawLoading(false);
				});
		}, WEB_RAW_FALLBACK_DELAY_MS);

		return () => {
			isActive = false;
			clearTimeout(timeoutId);
		};
	}, [filePath, rawFileData, rawQueryEnabled, worktreePath]);

	const effectiveRawFileData = rawFileData ?? fallbackRawFileData;
	const fallbackAttemptedForCurrentFile =
		currentRawFileKey !== null &&
		requestedFallbackKeyRef.current === currentRawFileKey;
	const shouldIgnorePrimaryLoadingInWebMode =
		env.DESKTOP_WEB_MODE &&
		fallbackAttemptedForCurrentFile &&
		!isFallbackRawLoading;
	const effectiveIsLoadingRaw =
		rawQueryEnabled &&
		effectiveRawFileData === undefined &&
		(isFallbackRawLoading ||
			(!shouldIgnorePrimaryLoadingInWebMode && isLoadingRaw));

	const { data: imageData, isLoading: isLoadingImage } =
		electronTrpc.changes.readWorkingFileImage.useQuery(
			{ worktreePath, absolutePath: filePath },
			{
				enabled:
					!isRemote &&
					viewMode === "rendered" &&
					isImage &&
					!!filePath &&
					!!worktreePath,
			},
		);

	const { data: diffData, isLoading: isLoadingDiff } =
		electronTrpc.changes.getFileContents.useQuery(
			{
				worktreePath,
				absolutePath: filePath,
				oldAbsolutePath: oldPath,
				category: diffCategory ?? "unstaged",
				commitHash,
				defaultBranch:
					diffCategory === "against-base" ? effectiveBaseBranch : undefined,
			},
			{
				enabled:
					!isRemote &&
					viewMode === "diff" &&
					!!diffCategory &&
					!!filePath &&
					!!worktreePath,
			},
		);

	// biome-ignore lint/correctness/useExhaustiveDependencies: Only update baseline when content loads
	useEffect(() => {
		if (effectiveRawFileData?.ok === true && !isDirty) {
			originalContentRef.current = effectiveRawFileData.content;
		}
	}, [effectiveRawFileData]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: Only update baseline when diff loads
	useEffect(() => {
		if (diffData && !isDirty) {
			originalDiffContentRef.current = diffData.modified;
		}
	}, [diffData]);

	// For remote URLs, return the URL directly as imageData (works with <img src=>)
	const remoteImageData = useMemo(
		() =>
			isRemote
				? { ok: true as const, dataUrl: filePath, byteLength: 0 }
				: undefined,
		[isRemote, filePath],
	);

	return {
		rawFileData: effectiveRawFileData,
		isLoadingRaw: effectiveIsLoadingRaw || (isImage && isLoadingImage),
		imageData: isRemote ? remoteImageData : imageData,
		isLoadingImage: isRemote ? false : isLoadingImage,
		diffData,
		isLoadingDiff,
	};
}
