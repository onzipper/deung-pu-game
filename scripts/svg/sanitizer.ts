// SVG sanitizer + light optimizer — no-dep (svgo is NOT in deps; see SVG-01 report).
// Contract: docs/design/deungpu_TECH_TEAM_DECISIONS_SVG_FIRST_NO_FIGMA_v1.md §2.5 ("ต้องผ่าน SVG sanitizer")
//   + §17 asset review checklist. Pure string transform — the CLI supplies file IO.
//
// SECURITY (dangerous — a finding here fails svg:lint):
//   • <script> blocks · on* event-handler attributes · external/js refs (href to http/file/js/data)
//   • <foreignObject> (arbitrary HTML) · DOCTYPE/ENTITY (XXE)
// COSMETIC (optimizer — stripped, never a failure):
//   • XML prolog · comments · <metadata> · inkscape:/sodipodi: editor cruft
//
// Regex-based on purpose: source SVGs are controlled + small, and this runs at build/lint time,
// not on untrusted runtime input. It is a gate, not a full XML parser.

/** A single thing the sanitizer removed. `dangerous` ones fail the lint gate. */
export interface SanitizeFinding {
  kind:
    | "script"
    | "event-handler"
    | "external-ref"
    | "foreign-object"
    | "doctype"
    | "comment"
    | "metadata"
    | "editor-attr";
  detail: string;
}

export interface SanitizeResult {
  /** The cleaned SVG text. */
  svg: string;
  findings: SanitizeFinding[];
}

/** Finding kinds that must never ship — svg:lint fails if any appear. */
export const DANGEROUS_KINDS: ReadonlySet<SanitizeFinding["kind"]> = new Set([
  "script",
  "event-handler",
  "external-ref",
  "foreign-object",
  "doctype",
]);

const SCRIPT_RE = /<script\b[\s\S]*?<\/script\s*>/gi;
const SCRIPT_SELFCLOSE_RE = /<script\b[^>]*\/>/gi;
const FOREIGN_OBJECT_RE = /<foreignObject\b[\s\S]*?<\/foreignObject\s*>/gi;
const DOCTYPE_RE = /<!DOCTYPE[\s\S]*?>/gi;
const COMMENT_RE = /<!--[\s\S]*?-->/g;
const METADATA_RE = /<metadata\b[\s\S]*?<\/metadata\s*>/gi;
const XML_PROLOG_RE = /<\?xml[\s\S]*?\?>/gi;
// on* handlers: attribute name starting with "on" followed by word chars, then =, then quoted value.
const EVENT_HANDLER_RE = /\s+on[a-zA-Z]+\s*=\s*("[^"]*"|'[^']*')/g;
// editor namespaces (inkscape:/sodipodi:) both as attributes and standalone elements.
const EDITOR_ATTR_RE = /\s+(?:inkscape|sodipodi):[\w-]+\s*=\s*("[^"]*"|'[^']*')/g;
// href / xlink:href pointing off-document or at code: http(s)://, //, file:, javascript:, data:
const EXTERNAL_REF_RE =
  /\s+(?:xlink:)?href\s*=\s*("|')\s*(https?:|\/\/|file:|javascript:|data:)[^"']*\1/gi;

function pushMatches(
  re: RegExp,
  text: string,
  kind: SanitizeFinding["kind"],
  findings: SanitizeFinding[],
): string {
  return text.replace(re, (match) => {
    findings.push({ kind, detail: match.slice(0, 80).replace(/\s+/g, " ").trim() });
    return "";
  });
}

/**
 * Sanitize (security) + lightly optimize (cosmetic) an SVG source string.
 * Order matters: strip scripts/foreignObject/doctype first, then handlers/refs, then cosmetics.
 */
export function sanitizeSvg(raw: string): SanitizeResult {
  const findings: SanitizeFinding[] = [];
  let svg = raw;

  // security
  svg = pushMatches(SCRIPT_RE, svg, "script", findings);
  svg = pushMatches(SCRIPT_SELFCLOSE_RE, svg, "script", findings);
  svg = pushMatches(FOREIGN_OBJECT_RE, svg, "foreign-object", findings);
  svg = pushMatches(DOCTYPE_RE, svg, "doctype", findings);
  svg = pushMatches(EXTERNAL_REF_RE, svg, "external-ref", findings);
  svg = pushMatches(EVENT_HANDLER_RE, svg, "event-handler", findings);

  // cosmetic (optimize)
  svg = pushMatches(XML_PROLOG_RE, svg, "metadata", findings);
  svg = pushMatches(METADATA_RE, svg, "metadata", findings);
  svg = pushMatches(COMMENT_RE, svg, "comment", findings);
  svg = pushMatches(EDITOR_ATTR_RE, svg, "editor-attr", findings);

  // collapse the blank lines left behind by removals
  svg = svg.replace(/\n{3,}/g, "\n\n").trim() + "\n";

  return { svg, findings };
}

/** True if a sanitize result contains any security-relevant removal. */
export function hasDangerous(result: SanitizeResult): boolean {
  return result.findings.some((f) => DANGEROUS_KINDS.has(f.kind));
}
