"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Monitor,
  RotateCw,
  Smartphone,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { requireApiSuccess } from "@/lib/api-client";
import {
  getPreviewRootConfig,
  joinPreviewUrl,
  resolvePreviewBaseUrl,
  resolvePreviewPath,
  type PreviewStatus,
} from "@/lib/preview";
import { cn } from "@/lib/utils";

const fetchPreviewStatus = async (url: string): Promise<PreviewStatus> => {
  const response = await fetch(url);
  const data = await requireApiSuccess<any>(response, "Failed to fetch preview status");
  return data.data as PreviewStatus;
};

const usePreviewUrl = ({
  configObject,
  owner,
  repo,
  branch,
  schema,
  path,
  contentObject,
  lastSavedCommit,
  isOpen,
}: {
  configObject: any;
  owner: string;
  repo: string;
  branch: string;
  schema: any;
  path?: string;
  contentObject?: Record<string, unknown>;
  lastSavedCommit?: string | null;
  isOpen: boolean;
}) => {
  const netlifySite = getPreviewRootConfig(configObject)?.netlify?.site;
  const statusUrl = netlifySite
    ? `/api/${owner}/${repo}/${encodeURIComponent(branch)}/preview`
    : null;

  const waitingForSave = (deploy: PreviewStatus["deploy"] | undefined) =>
    Boolean(lastSavedCommit && deploy?.commitRef !== lastSavedCommit && deploy?.state !== "error");

  const { data: status, error, isLoading, mutate } = useSWR<PreviewStatus>(
    statusUrl,
    fetchPreviewStatus,
    {
      revalidateOnFocus: isOpen,
      // Only poll while the panel is showing; one fetch is enough for "open in new tab".
      refreshInterval: (latest) => {
        if (!isOpen) return 0;
        return !latest || latest.deploy?.state === "building" || waitingForSave(latest.deploy)
          ? 5000
          : 30000;
      },
    },
  );

  const baseUrl = netlifySite
    ? status?.baseUrl ?? null
    : resolvePreviewBaseUrl(configObject, branch);

  const url = useMemo(() => {
    if (!baseUrl) return null;
    return joinPreviewUrl(baseUrl, resolvePreviewPath(schema, path, contentObject));
  }, [baseUrl, contentObject, path, schema]);

  return {
    url,
    status,
    statusError: error instanceof Error ? error.message : null,
    isLoading: Boolean(statusUrl) && isLoading,
    hasStatus: Boolean(statusUrl),
    isWaitingForSave: waitingForSave(status?.deploy),
    refreshStatus: mutate,
  };
};

type PreviewState = ReturnType<typeof usePreviewUrl>;

function PreviewStatusLine({ preview }: { preview: PreviewState }) {
  const { status, statusError, hasStatus, isLoading, isWaitingForSave } = preview;

  if (!hasStatus) {
    return (
      <span className="truncate text-muted-foreground">
        Last deployed version. Saved changes show up after the site rebuilds.
      </span>
    );
  }

  if (statusError) {
    return (
      <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
        <AlertTriangle className="size-3.5 shrink-0 text-amber-500" />
        <span className="truncate">{statusError}</span>
      </span>
    );
  }

  if (isLoading && !status) {
    return (
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        Checking deploy status
      </span>
    );
  }

  const deploy = status?.deploy;
  if (!deploy) {
    return <span className="truncate text-muted-foreground">No deploys found for this branch yet.</span>;
  }

  if (deploy.state === "error") {
    return (
      <span className="flex min-w-0 items-center gap-1.5 text-destructive">
        <AlertTriangle className="size-3.5 shrink-0" />
        <span className="truncate">Latest build failed{deploy.errorMessage ? `: ${deploy.errorMessage}` : "."}</span>
        {deploy.adminUrl && (
          <a href={deploy.adminUrl} target="_blank" rel="noreferrer" className="shrink-0 underline">
            Logs
          </a>
        )}
      </span>
    );
  }

  if (deploy.state === "building" || isWaitingForSave) {
    return (
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        {isWaitingForSave ? "Building your latest save" : "Building"}
      </span>
    );
  }

  const when = deploy.publishedAt || deploy.createdAt;
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
      <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />
      <span className="truncate">
        Up to date{when ? ` · deployed ${formatDistanceToNow(new Date(when), { addSuffix: true })}` : ""}
      </span>
    </span>
  );
}

function EntryPreviewPanel({
  preview,
  onClose,
}: {
  preview: PreviewState;
  onClose: () => void;
}) {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [reloadKey, setReloadKey] = useState(0);
  const lastReadyCommitRef = useRef<string | null>(null);

  // Reload the frame once a new build finishes.
  const deploy = preview.status?.deploy;
  useEffect(() => {
    if (deploy?.state !== "ready" || !deploy.commitRef) return;
    if (lastReadyCommitRef.current && lastReadyCommitRef.current !== deploy.commitRef) {
      setReloadKey((key) => key + 1);
    }
    lastReadyCommitRef.current = deploy.commitRef;
  }, [deploy?.commitRef, deploy?.state]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border bg-background">
      <div className="flex items-center gap-1 border-b px-2 py-1.5 text-xs">
        <div className="min-w-0 flex-1 px-1">
          <PreviewStatusLine preview={preview} />
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => setDevice(device === "desktop" ? "mobile" : "desktop")}
              aria-label={device === "desktop" ? "Show phone width" : "Show full width"}
            >
              {device === "desktop" ? <Smartphone /> : <Monitor />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{device === "desktop" ? "Phone width" : "Full width"}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => {
                setReloadKey((key) => key + 1);
                void preview.refreshStatus();
              }}
              aria-label="Reload preview"
            >
              <RotateCw />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Reload</TooltipContent>
        </Tooltip>
        {preview.url && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon-xs" asChild>
                <a href={preview.url} target="_blank" rel="noreferrer" aria-label="Open preview in a new tab">
                  <ExternalLink />
                </a>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Open in new tab</TooltipContent>
          </Tooltip>
        )}
        <Button type="button" variant="ghost" size="icon-xs" onClick={onClose} aria-label="Close preview">
          <X />
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 justify-center bg-muted/40">
        {preview.url ? (
          <iframe
            key={`${preview.url}-${reloadKey}`}
            src={preview.url}
            title="Preview"
            className={cn(
              "h-full border-0 bg-white",
              device === "mobile" ? "w-[390px] max-w-full border-x" : "w-full",
            )}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="flex items-center p-6 text-center text-sm text-muted-foreground">
            {preview.isLoading ? "Loading preview" : "No preview URL for this branch yet."}
          </div>
        )}
      </div>
      {preview.url && (
        <div className="truncate border-t px-3 py-1 text-[11px] text-muted-foreground" title={preview.url}>
          {preview.url}
        </div>
      )}
    </div>
  );
}

export { EntryPreviewPanel, usePreviewUrl };
export type { PreviewState };
