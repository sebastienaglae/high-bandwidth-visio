import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../src/markdown.js";

describe("renderMarkdown", () => {
  it("escapes HTML injection", () => {
    const out = renderMarkdown('<img src=x onerror="alert(1)">');
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;img");
  });

  it("escapes injection inside markdown constructs", () => {
    const out = renderMarkdown("**<script>alert(1)</script>**");
    expect(out).toContain("<strong>");
    expect(out).not.toContain("<script>");
  });

  it("renders bold and italic", () => {
    expect(renderMarkdown("**bold**")).toBe("<strong>bold</strong>");
    expect(renderMarkdown("*italic*")).toContain("<em>italic</em>");
    expect(renderMarkdown("**bold** and *italic*")).toContain("<strong>bold</strong> and <em>italic</em>");
  });

  it("does not treat ** inside words as bold", () => {
    const out = renderMarkdown("a**b");
    expect(out).not.toContain("<strong>");
  });

  it("renders inline code", () => {
    expect(renderMarkdown("use `npm ci` please")).toContain('<code class="md-inline">npm ci</code>');
  });

  it("renders fenced code blocks escaped", () => {
    const out = renderMarkdown("```\n<script>x</script>\n```");
    expect(out).toContain('<pre class="md-code">');
    expect(out).not.toContain("<script>");
  });

  it("renders http(s) links with safe rel attributes", () => {
    const out = renderMarkdown("[site](https://example.com)");
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it("rejects javascript: links", () => {
    const out = renderMarkdown("[x](javascript:alert(1))");
    expect(out).not.toContain("<a href");
  });

  it("converts newlines to <br/>", () => {
    expect(renderMarkdown("a\nb")).toContain("a<br/>b");
  });

  it("handles code blocks mixed with text", () => {
    const out = renderMarkdown("before\n```\ncode\n```\nafter");
    expect(out.indexOf("before")).toBeLessThan(out.indexOf("md-code"));
    expect(out.indexOf("md-code")).toBeLessThan(out.indexOf("after"));
  });
});
