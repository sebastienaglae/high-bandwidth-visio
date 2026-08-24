// Tiny, safe markdown subset for chat messages.
// Everything is HTML-escaped first; links are restricted to http(s).

const ESCAPE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPE[c]);
}

export function renderMarkdown(src: string): string {
  // 1. Pull out fenced code blocks before any other processing.
  const codeBlocks: string[] = [];
  const withPlaceholders = src.replace(/```([\s\S]*?)```/g, (_, code) => {
    codeBlocks.push(`<pre class="md-code">${escapeHtml(code.replace(/^\n/, ""))}</pre>`);
    return `\u0000CB${codeBlocks.length - 1}\u0000`;
  });

  // 2. Escape the rest.
  let h = escapeHtml(withPlaceholders);

  // 3. Inline code.
  h = h.replace(/`([^`\n]+)`/g, '<code class="md-inline">$1</code>');

  // 4. Links: [text](http(s)://...) — javascript: and friends rejected.
  h = h.replace(
    /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_m, text: string, url: string) =>
      `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`
  );

  // 5. Bold, italic.
  h = h.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  h = h.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");

  // 6. Line breaks.
  h = h.replace(/\n/g, "<br/>");

  // 7. Restore code blocks.
  h = h.replace(/\u0000CB(\d+)\u0000/g, (_, i) => codeBlocks[Number(i)]);

  return h;
}
