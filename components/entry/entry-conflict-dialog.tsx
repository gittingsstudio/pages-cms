"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MergeResult } from "@/lib/merge";

type ConflictChoice = "mine" | "theirs";

const formatValue = (value: unknown): string => {
  if (value === undefined || value === null || value === "") return "(empty)";
  if (typeof value === "string") return value.length > 280 ? `${value.slice(0, 280)}…` : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    const json = JSON.stringify(value, null, 2);
    return json.length > 280 ? `${json.slice(0, 280)}…` : json;
  } catch {
    return String(value);
  }
};

function EntryConflictDialog({
  open,
  result,
  labels,
  isSaving,
  onSaveMerged,
  onLoadTheirs,
  onCancel,
}: {
  open: boolean;
  result: MergeResult | null;
  labels: Record<string, string>;
  isSaving: boolean;
  onSaveMerged: (choices: Record<string, ConflictChoice>) => void;
  onLoadTheirs: () => void;
  onCancel: () => void;
}) {
  const [choices, setChoices] = useState<Record<string, ConflictChoice>>({});

  useEffect(() => {
    setChoices({});
  }, [result]);

  if (!result) return null;

  const labelFor = (key: string) => labels[key] || key;
  const hasConflicts = result.conflicts.length > 0;
  const allChosen = result.conflicts.every((conflict) => choices[conflict.key]);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !isSaving) onCancel(); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Someone else saved this entry</DialogTitle>
          <DialogDescription>
            {hasConflicts
              ? "You both changed the same fields. Pick which version to keep for each, and the rest will be combined."
              : "Their changes don't overlap with yours, so both can be kept."}
          </DialogDescription>
        </DialogHeader>

        {result.theirChanges.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Bringing in their changes to{" "}
            <span className="font-medium text-foreground">
              {result.theirChanges.map(labelFor).join(", ")}
            </span>
            .
          </p>
        )}

        {hasConflicts && (
          <div className="space-y-4">
            {result.conflicts.map((conflict) => (
              <fieldset key={conflict.key} className="space-y-2">
                <legend className="text-sm font-medium">{labelFor(conflict.key)}</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(["mine", "theirs"] as const).map((side) => {
                    const selected = choices[conflict.key] === side;
                    return (
                      <button
                        key={side}
                        type="button"
                        onClick={() => setChoices((prev) => ({ ...prev, [conflict.key]: side }))}
                        aria-pressed={selected}
                        className={cn(
                          "rounded-md border p-3 text-left text-sm transition-colors hover:bg-muted/60",
                          selected && "border-primary ring-1 ring-primary",
                        )}
                      >
                        <div className="mb-1 text-xs font-medium text-muted-foreground">
                          {side === "mine" ? "Your version" : "Their version"}
                        </div>
                        <pre className="whitespace-pre-wrap break-words font-sans text-sm">
                          {formatValue(side === "mine" ? conflict.mine : conflict.theirs)}
                        </pre>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ))}
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="ghost" onClick={onLoadTheirs} disabled={isSaving}>
            Discard mine, load theirs
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => onSaveMerged(choices)}
              disabled={isSaving || (hasConflicts && !allChosen)}
            >
              {isSaving ? "Saving" : "Save combined version"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { EntryConflictDialog };
export type { ConflictChoice };
