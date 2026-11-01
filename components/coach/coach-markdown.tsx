import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { remarkCoachEmphasis } from "@/lib/markdown/coach-emphasis";

const components: Components = {
  a: ({ href, children }) => href
    ? <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
    : <span>{children}</span>,
  // Coaching text does not need to load remote model-generated image URLs.
  img: ({ alt }) => alt ? <span className="text-muted-foreground">{alt}</span> : null,
  table: ({ children }) => <div className="coach-table-scroll" role="region" aria-label="教练回复中的表格" tabIndex={0}><table>{children}</table></div>,
  pre: ({ children }) => <pre tabIndex={0}>{children}</pre>,
};

/** Render stored and new coach messages without interpreting raw HTML. */
export function CoachMarkdown({ content }: { content: string }) {
  return <div className="coach-markdown min-w-0 text-sm leading-[1.7] text-foreground">
    <Markdown remarkPlugins={[remarkGfm, remarkCoachEmphasis]} components={components} skipHtml>{content}</Markdown>
  </div>;
}
