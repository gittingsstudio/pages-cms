"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type PresencePerson = {
  userId: string;
  name: string | null;
  image: string | null;
  isDirty: boolean;
  lastSeenAt: string;
};

type PresenceLatest = {
  sha: string;
  commitSha: string | null;
  updatedAt: string;
};

const HEARTBEAT_MS = 15_000;

const getInitials = (name: string | null) => {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? "?").toUpperCase() + (parts[1]?.[0] ?? "").toUpperCase();
};

/**
 * Tells the server we have this entry open and learns who else does.
 * Also reports when a newer version of the file was saved after we loaded ours.
 */
const useEntryPresence = ({
  owner,
  repo,
  branch,
  path,
  sha,
  isDirty,
}: {
  owner: string;
  repo: string;
  branch: string;
  path?: string;
  sha?: string;
  isDirty: boolean;
}) => {
  const [others, setOthers] = useState<PresencePerson[]>([]);
  const [latest, setLatest] = useState<PresenceLatest | null>(null);
  const sinceRef = useRef<string | null>(null);
  const shaRef = useRef(sha);
  const dirtyRef = useRef(isDirty);
  dirtyRef.current = isDirty;

  const url = `/api/${owner}/${repo}/${encodeURIComponent(branch)}/presence`;

  // A new sha (loaded or saved) restarts the "changed since" window.
  useEffect(() => {
    if (shaRef.current !== sha) {
      shaRef.current = sha;
      sinceRef.current = null;
      setLatest(null);
    }
  }, [sha]);

  const beat = useCallback(async () => {
    if (!path) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path,
          dirty: dirtyRef.current,
          sha: shaRef.current,
          since: sinceRef.current,
        }),
      });
      if (!response.ok) return;
      const payload = await response.json();
      const data = payload?.data;
      if (!data) return;
      setOthers(Array.isArray(data.others) ? data.others : []);
      if (data.latest && data.latest.sha !== shaRef.current) setLatest(data.latest);
      if (!sinceRef.current && typeof data.serverTime === "string") sinceRef.current = data.serverTime;
    } catch {
      // Presence is best effort.
    }
  }, [path, url]);

  useEffect(() => {
    if (!path) return;
    void beat();
    const interval = window.setInterval(() => void beat(), HEARTBEAT_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void beat();
    };
    document.addEventListener("visibilitychange", onVisible);

    const leave = () => {
      const body = new Blob([JSON.stringify({ path, leave: true })], { type: "application/json" });
      if (!navigator.sendBeacon?.(url, body)) {
        void fetch(url, { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } });
      }
    };
    window.addEventListener("pagehide", leave);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, [beat, path, url]);

  // Let others know quickly when we start or stop having unsaved changes.
  useEffect(() => {
    if (!path) return;
    const timeout = window.setTimeout(() => void beat(), 500);
    return () => window.clearTimeout(timeout);
  }, [beat, isDirty, path]);

  return { others, latest, dismissLatest: () => setLatest(null) };
};

function EntryPresenceAvatars({ others }: { others: PresencePerson[] }) {
  if (others.length === 0) return null;
  const shown = others.slice(0, 3);
  const hidden = others.length - shown.length;

  const describe = (person: PresencePerson) =>
    `${person.name || "Someone"} ${person.isDirty ? "is editing (unsaved changes)" : "is viewing"}`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex shrink-0 items-center -space-x-2" aria-label={others.map(describe).join(", ")}>
          {shown.map((person) => (
            <div key={person.userId} className="relative">
              <Avatar className="size-7 border-2 border-background">
                {person.image && <AvatarImage src={person.image} alt={person.name ?? ""} />}
                <AvatarFallback className="text-[10px]">{getInitials(person.name)}</AvatarFallback>
              </Avatar>
              <span
                className={cn(
                  "absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-background",
                  person.isDirty ? "bg-amber-500" : "bg-emerald-500",
                )}
              />
            </div>
          ))}
          {hidden > 0 && (
            <div className="z-10 flex size-7 items-center justify-center rounded-full border-2 border-background bg-muted text-[10px] font-medium">
              +{hidden}
            </div>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <div className="space-y-0.5">
          {others.map((person) => (
            <div key={person.userId}>{describe(person)}</div>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export { useEntryPresence, EntryPresenceAvatars };
export type { PresencePerson, PresenceLatest };
