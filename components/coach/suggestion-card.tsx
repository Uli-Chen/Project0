"use client";

import { Check } from "lucide-react";
import { DiffText } from "@/components/essay/diff-view";
import { Button } from "@/components/ui/button";
import type { Suggestion } from "@/lib/prototype/types";
import { cn } from "@/lib/utils";

export function SuggestionCard({
  suggestion,
  onAccept,
  onDismiss,
  onUndo,
  notice,
}: {
  suggestion: Suggestion;
  onAccept: () => void;
  onDismiss: () => void;
  onUndo?: () => void;
  notice?: string | null;
}) {
  const decided = suggestion.status !== "pending";
  return (
    <div className={cn("rounded-lg border bg-background px-3.5 py-3", decided && "bg-transparent")}>
      <p className={cn("font-serif text-[15px] leading-relaxed", decided && "text-muted-foreground")}>
        {suggestion.type === "express" ? suggestion.suggestedText : <DiffText from={suggestion.selectionText} to={suggestion.suggestedText} />}
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{suggestion.reason}</p>
      {notice && <p className="mt-1.5 text-xs text-warn">{notice}</p>}
      <div className="mt-2.5 flex items-center gap-1">
        {suggestion.status === "pending" ? (
          <>
            <Button size="sm" variant="outline" onClick={onAccept}>
              {suggestion.type === "express" ? "插入到光标处" : "采用"}
            </Button>
            <Button size="sm" variant="ghost" onClick={onDismiss}>
              忽略
            </Button>
          </>
        ) : (
          <>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              {suggestion.status === "accepted" && <Check className="size-3.5 text-good" />}
              {suggestion.status === "accepted" ? "已采用" : "已忽略"}
            </span>
            {suggestion.status === "accepted" && onUndo && <Button size="xs" variant="ghost" className="ml-1 text-muted-foreground" onClick={onUndo}>撤销</Button>}
          </>
        )}
      </div>
    </div>
  );
}
