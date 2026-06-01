"use client";

// Tiny, dependency-free markdown renderer. Supports headings, paragraphs,
// fenced code blocks, inline code, bullet lists. Enough for AI answers.

import React from "react";

function escape(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inline(s: string): string {
  // **bold**
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // *italic*
  s = s.replace(/\*(.+?)\*/g, "<em>$1</em>");
  // `code`
  s = s.replace(/`([^`]+)`/g, (_m, c) => `<code>${escape(c)}</code>`);
  return s;
}

export function Markdown({ text }: { text: string }) {
  const html = React.useMemo(() => renderToHtml(text || ""), [text]);
  return <div className="markdown text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />;
}

function renderToHtml(text: string): string {
  const lines = text.split("\n");
  let out = "";
  let i = 0;
  let inList = false;
  while (i < lines.length) {
    const line = lines[i];

    // fenced code block
    const fence = line.match(/^```(\w+)?\s*$/);
    if (fence) {
      const lang = fence[1] || "";
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      out += `<pre data-lang="${lang}"><code>${escape(buf.join("\n"))}</code></pre>`;
      continue;
    }

    // heading
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      if (inList) { out += "</ul>"; inList = false; }
      const level = h[1].length;
      out += `<h${level}>${inline(escape(h[2]))}</h${level}>`;
      i++;
      continue;
    }

    // bullet
    const b = line.match(/^[-*]\s+(.*)$/);
    if (b) {
      if (!inList) { out += "<ul>"; inList = true; }
      out += `<li>${inline(escape(b[1]))}</li>`;
      i++;
      continue;
    }

    // blank
    if (line.trim() === "") {
      if (inList) { out += "</ul>"; inList = false; }
      i++;
      continue;
    }

    // paragraph
    if (inList) { out += "</ul>"; inList = false; }
    out += `<p>${inline(escape(line))}</p>`;
    i++;
  }
  if (inList) out += "</ul>";
  return out;
}
