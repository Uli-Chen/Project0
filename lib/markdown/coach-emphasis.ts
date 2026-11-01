type MarkdownNode = {
  type: string;
  value?: string;
  children?: MarkdownNode[];
  position?: { start: { offset?: number }; end: { offset?: number } };
};

/**
 * Repair unparsed model emphasis such as **立场（stance） **目前. CommonMark
 * treats a closing delimiter beside CJK punctuation as literal text. Work on
 * parsed text nodes only, so code, HTML, links and escaped markers stay intact.
 */
export function remarkCoachEmphasis() {
  return (tree: MarkdownNode, file: { value: unknown }) => {
    const source = String(file.value);
    const repair = (node: MarkdownNode): MarkdownNode[] => {
      if (node.type !== "text" || !node.value || !node.position) return [node];
      const { start, end } = node.position;
      if (start.offset === undefined || end.offset === undefined) return [node];
      // Escapes and entities are intentionally literal; do not reinterpret them.
      if (source.slice(start.offset, end.offset).replace(/\r\n?/g, "\n") !== node.value) return [node];
      const result: MarkdownNode[] = [];
      let cursor = 0;
      for (const match of node.value.matchAll(/\*\*([^*\n]+)\*\*/gu)) {
        const label = match[1].trim();
        if (!/\p{L}/u.test(label)) continue;
        const index = match.index;
        if (index > cursor) result.push({ type: "text", value: node.value.slice(cursor, index) });
        result.push({ type: "strong", children: [{ type: "text", value: label }] });
        cursor = index + match[0].length;
      }
      if (!result.length) return [node];
      if (cursor < node.value.length) result.push({ type: "text", value: node.value.slice(cursor) });
      return result;
    };
    const visit = (node: MarkdownNode) => {
      if (!node.children) return;
      node.children.forEach(visit);
      node.children = node.children.flatMap(repair);
    };
    visit(tree);
  };
}
