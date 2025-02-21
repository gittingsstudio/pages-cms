"use client";

import { cn } from "@/lib/utils";

export function File({
  path,
  className
}: {
  path: string | null;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-muted w-full aspect-square overflow-hidden relative",
        className
      )}
    >
      <div className="flex justify-center items-center absolute inset-0 text-muted-foreground text-sm truncate p-2">
        {path ? path.split('/').pop() : 'No file'}
      </div>
    </div>
  );
};