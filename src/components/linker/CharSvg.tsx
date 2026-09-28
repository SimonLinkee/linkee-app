"use client";

/** Renders a character/accessory SVG string produced by src/lib/linker/characters.ts. */
export default function CharSvg({ html, className }: { html: string; className?: string }) {
  return <span className={className} style={{ display: "inline-block", lineHeight: 0 }} dangerouslySetInnerHTML={{ __html: html }} />;
}
