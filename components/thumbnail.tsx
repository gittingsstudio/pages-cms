"use client";

import { useState, useEffect, useMemo } from "react";
import { getImageUrl } from "@/lib/github-image";
import { useRepo } from "@/contexts/repo-context";
import { useConfig } from "@/contexts/config-context";
import { cn } from "@/lib/utils";
import { Ban, ImageOff } from "lucide-react";

export function Thumbnail({
  path,
  sha,
  width = 256,
  className
}: {
  path: string | null;
  sha?: string | null;
  width?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  const { owner, repo } = useRepo();

  const { config } = useConfig();
  const branch = config?.branch!;

  const url = useMemo(
    () => path ? getImageUrl(owner, repo, branch, path, { width, version: sha }) : null,
    [owner, repo, branch, path, width, sha],
  );

  useEffect(() => {
    setFailed(false);
  }, [url]);

  return (
    <div
      className={cn(
        "bg-muted w-full aspect-square overflow-hidden relative",
        className
      )}
    >
      {path
        ? url && !failed
          ? <img
              src={url}
              alt={path.split("/").pop() || "thumbnail"}
              loading="lazy"
              decoding="async"
              onError={() => setFailed(true)}
              className="absolute inset-0 w-full h-full object-cover"
            />
          : <div className="flex justify-center items-center absolute inset-0 text-muted-foreground" title="Couldn't load image">
              <Ban className="h-4 w-4"/>
            </div>
        : <div className="flex justify-center items-center absolute inset-0 text-muted-foreground" title="No image">
            <ImageOff className="h-4 w-4"/>
          </div>
      }
    </div>
  );
};
