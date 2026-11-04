"use client";

import { DrawnCheck } from "@/components/ui/status-button";
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
  acceptDisabled = false,
  dismissDisabled = false,
}: {
  suggestion: Suggestion;
  onAccept: () => void;
  onDismiss: () => void;
  onUndo?: () => void;
  notice?: string | null;
  acceptDisabled?: boolean;
  dismissDisabled?: boolean;
}) {
  const decided = suggestion.status !== "pending";
  return (
    <div className={cn("overflow-hidden rounded-[10px] border border-coach-line bg-sheet px-3.5 py-3 transition-[border-color,background-color] duration-(--dur-layout) ease-(--ease-soft)", decided && "border-border bg-transparent")}>
      <p className={cn("font-serif text-[15.5px] leading-relaxed transition-colors duration-(--dur-layout) ease-(--ease-soft)", decided && "text-muted-foreground")}>
        {(suggestion.type === "express" || suggestion.type === "example") ? suggestion.suggestedText : <DiffText from={suggestion.selectionText} to={suggestion.suggestedText} />}
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{suggestion.reason}</p>
      {notice && <p className="mt-1.5 text-xs text-warn">{notice}</p>}
      <div key={suggestion.status} className={cn("motion-swap mt-3 flex items-center gap-1.5", !decided && "-mx-3.5 -mb-3 border-t bg-sunk/60 px-3 py-2")}>
        {suggestion.status === "pending" ? (
          <>
            <Button size="sm" variant="outline" disabled={acceptDisabled} onClick={onAccept}>
              {(suggestion.type === "express" || suggestion.type === "example") ? "插入到光标处" : "采用"}
            </Button>
            <Button size="sm" variant="ghost" disabled={dismissDisabled} onClick={onDismiss}>
              忽略
            </Button>
          </>
        ) : (
          <>
            <span role="status" className="flex items-center gap-1 text-xs text-muted-foreground">
              {suggestion.status === "accepted" && <DrawnCheck className="size-3.5 text-good" />}
              {suggestion.status === "accepted" ? "已采用" : "已忽略"}
            </span>
            {suggestion.status === "accepted" && onUndo && <Button size="xs" variant="ghost" className="ml-1 text-muted-foreground" onClick={onUndo}>撤销</Button>}
          </>
        )}
      </div>
    </div>
  );
}
