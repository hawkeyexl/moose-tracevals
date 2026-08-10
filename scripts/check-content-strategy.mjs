/**
 * Enforces the invariants docs/content_strategy/ declares about itself. The
 * ID-anchor model (audience --< persona --< journey --> doc touchpoint) is only
 * worth having if the anchors resolve, so this checks them rather than trusting
 * review:
 *
 *   1. No dangling `aud-*` / `persona-*` / `cuj-*` reference.
 *   2. No orphans — every persona has >=1 CUJ, every CUJ >=1 persona.
 *   3. Every CUJ step marked `exists: true` resolves to a real page; the rest
 *      are recorded as gaps, which is the point of the gap analysis.
 *   4. Relative links between strategy files resolve on disk.
 *   5. Every `/tracevals/...` link in a published page points at a page that
 *      exists.
 *   6. Every published page declares `title` and `description`.
 *   7. Every `#fragment` in a site link resolves to a real heading — renaming a
 *      heading otherwise breaks CUJ deep-links silently.
 *
 * Run with `npm run docs:check-strategy`. See ADR 01007.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve, relative, sep } from "node:path";

const ROOT = process.cwd();
const STRAT = join(ROOT, "docs", "content_strategy");
const PAGES = join(ROOT, "docs", "src", "content", "docs");
const BASE = "/tracevals";

let failures = 0;
let sectionFailures = 0;
const fail = (m) => { failures++; sectionFailures++; console.error(`  ✗ ${m}`); };

/** Starts a section and resets its failure counter. */
const section = (title) => { sectionFailures = 0; console.log(`\n${title}`); };

/**
 * Summarises a section. Only prints the all-clear when the section actually
 * passed: an unconditional ✓ next to a ✗ reads as a false all-clear to anyone
 * scanning the log, which is the one thing a verification tool must not do.
 */
const summarise = (m) => {
  if (sectionFailures === 0) console.log(`  ✓ ${m}`);
  else console.error(`  ✗ ${sectionFailures} problem(s) in this section`);
};

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : join(dir, e.name),
  );
}

const files = walk(STRAT).filter((f) => f.endsWith(".md"));
const docs = files.map((f) => ({ path: f, text: readFileSync(f, "utf8") }));

// --- 1. Anchor integrity -----------------------------------------------------
section("1. Anchor integrity");
const defined = new Set();
for (const d of docs) {
  const m = d.text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) continue;
  const id = m[1].match(/^id:\s*(\S+)/m);
  if (id) defined.add(id[1]);
}
const referenced = new Map();
for (const d of docs) {
  for (const ref of d.text.match(/\b(aud|persona|cuj)-[a-z0-9-]+/g) ?? []) {
    if (!referenced.has(ref)) referenced.set(ref, new Set());
    referenced.get(ref).add(relative(ROOT, d.path));
  }
}
for (const [ref, where] of referenced) {
  if (!defined.has(ref)) fail(`dangling id "${ref}" referenced in ${[...where].join(", ")}`);
}
summarise(`${defined.size} ids defined, ${referenced.size} referenced, 0 dangling`);

// --- 2. No orphans -----------------------------------------------------------
section("2. Orphan check");

/**
 * Reads a YAML list from frontmatter in either style — `key: [a, b]` or a block
 * of `  - a` lines. Accepting only one style would make a legal reformat look
 * like an orphaned persona, which is a false alarm this gate must not raise.
 */
function yamlList(fm, key) {
  const inline = fm.match(new RegExp(`^${key}:[ \\t]*\\[(.*?)\\]`, "m"));
  if (inline) return inline[1].split(",").map((s) => s.trim()).filter(Boolean);
  const block = fm.match(new RegExp(`^${key}:[ \\t]*\\r?\\n((?:[ \\t]+- .+(?:\\r?\\n|$))+)`, "m"));
  return (block?.[1] ?? "")
    .split("\n")
    .map((l) => l.trim().replace(/^- /, ""))
    .filter(Boolean);
}

const personaJourneys = new Map();
const cujPersonas = new Map();
for (const d of docs) {
  const fm = d.text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
  const id = fm.match(/^id:\s*(\S+)/m)?.[1];
  if (!id) continue;
  if (id.startsWith("persona-")) personaJourneys.set(id, yamlList(fm, "journeys"));
  if (id.startsWith("cuj-")) cujPersonas.set(id, yamlList(fm, "personas"));
}
for (const [p, js] of personaJourneys) if (js.length === 0) fail(`persona ${p} has no CUJ`);
for (const [c, ps] of cujPersonas) if (ps.length === 0) fail(`CUJ ${c} has no persona`);
summarise(`${personaJourneys.size} personas each with >=1 CUJ, ${cujPersonas.size} CUJs each with >=1 persona`);

// --- 3. CUJ routes -----------------------------------------------------------
section("3. CUJ route resolution (exists: true must resolve to a real page)");
const routeToFile = (route) => {
  const p = route.split("#")[0].replace(new RegExp(`^${BASE}`), "").replace(/^\/|\/$/g, "");
  const candidates = p === ""
    ? ["index.mdx", "index.md"]
    : [`${p}.mdx`, `${p}.md`, `${p}/index.mdx`, `${p}/index.md`];
  return candidates.map((c) => join(PAGES, c)).find((f) => existsSync(f));
};
let trueCount = 0, gapCount = 0;
for (const d of docs) {
  for (const line of d.text.split("\n")) {
    const m = line.match(/doc:\s*"?([^",}]+)"?.*?exists:\s*(true|false|partial)/);
    if (!m) continue;
    const [, route, exists] = m;
    if (exists === "true") {
      trueCount++;
      if (!routeToFile(route)) fail(`${relative(ROOT, d.path)}: exists:true but no page for ${route}`);
    } else gapCount++;
  }
}
summarise(`${trueCount} routes marked exists:true all resolve; ${gapCount} recorded as gaps`);

// --- 4. Relative links between strategy files --------------------------------
section("4. Relative link resolution");
let linkCount = 0;
for (const d of docs) {
  for (const m of d.text.matchAll(/\]\((?!https?:|#)([^)#]+)(#[^)]*)?\)/g)) {
    linkCount++;
    const target = resolve(dirname(d.path), m[1]);
    if (!existsSync(target)) fail(`${relative(ROOT, d.path)}: broken link -> ${m[1]}`);
  }
}
summarise(`${linkCount} relative links checked`);

// --- 5. Site-internal links in pages -----------------------------------------
section("5. Site links in published pages");
let siteLinks = 0;
// Three link forms reach a reader, and all three must be checked. Body links
// (`](/tracevals/…)`) and component props (`href="/tracevals/…"`) are the
// obvious two; the third is `link:` inside frontmatter, which is how a Starlight
// splash hero declares its call-to-action buttons. Those render as the most
// prominent links on the landing page, so leaving them unchecked would let the
// primary nav 404 while this gate stayed green.
const SITE_LINK = /(?:href=|]\(|^\s*link:\s*)"?(\/tracevals\/[^")\s]*)"?/gm;
for (const f of walk(PAGES).filter((f) => /\.mdx?$/.test(f))) {
  const text = readFileSync(f, "utf8");
  for (const m of text.matchAll(SITE_LINK)) {
    siteLinks++;
    const route = m[1];
    if (!routeToFile(route)) fail(`${relative(ROOT, f)}: link to nonexistent page ${route}`);
  }
}
summarise(`${siteLinks} internal site links checked`);

// --- 6. Frontmatter on every page --------------------------------------------
section("6. Page frontmatter");
let pages = 0;
for (const f of walk(PAGES).filter((f) => f.endsWith(".mdx") || f.endsWith(".md"))) {
  pages++;
  const fm = readFileSync(f, "utf8").match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
  if (!/^title:\s*\S/m.test(fm)) fail(`${relative(ROOT, f)}: missing title`);
  if (!/^description:\s*\S/m.test(fm)) fail(`${relative(ROOT, f)}: missing description`);
}
summarise(`${pages} pages have title + description`);

// --- 7. Anchor links --------------------------------------------------------
// Section 5 proves the *page* exists; it says nothing about the `#fragment`.
// CUJ steps deep-link to specific sections, so renaming a heading silently
// breaks them — which is exactly the kind of drift a heading edit causes and a
// page-level check waves through.
section("7. Anchor links resolve to a real heading");

/** GitHub/Starlight slug: lowercase, strip punctuation, spaces to hyphens. */
const slugify = (heading) =>
  heading
    .replace(/`/g, "")
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");

/** route (always trailing-slashed) -> Set of heading slugs on that page. */
const headings = new Map();
for (const f of walk(PAGES).filter((f) => /\.mdx?$/.test(f))) {
  const rel = relative(PAGES, f).split(sep).join("/");
  const route = `${BASE}/${rel.replace(/index\.mdx?$/, "").replace(/\.mdx?$/, "/")}`;
  const slugs = new Set();
  let inFence = false;
  for (const line of readFileSync(f, "utf8").split("\n")) {
    if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    // Starlight's <Steps> nests headings inside an ordered list, so a heading
    // can legitimately arrive as `1. ### Install`. It still renders with an id,
    // so the list marker has to be tolerated or every Steps anchor reads broken.
    const m = line.match(/^\s*(?:(?:\d+\.|[-*])\s+)?(#{2,4})\s+(.+?)\s*$/);
    if (m) slugs.add(slugify(m[2]));
  }
  headings.set(route.replace(/\/+$/, "/"), slugs);
}

let anchors = 0;
const sources = [
  ...docs.map((d) => d.path),
  ...walk(PAGES).filter((f) => /\.mdx?$/.test(f)),
];
for (const f of sources) {
  for (const m of readFileSync(f, "utf8").matchAll(/(\/tracevals\/[^"')\s]*?)#([a-z0-9-]+)/g)) {
    anchors++;
    const route = m[1].endsWith("/") ? m[1] : `${m[1]}/`;
    const slugs = headings.get(route);
    if (slugs === undefined) continue;   // section 5 already reports a missing page
    if (!slugs.has(m[2])) {
      fail(`${relative(ROOT, f)}: no heading "#${m[2]}" on ${route}`);
    }
  }
}
summarise(`${anchors} anchor link(s) resolve to a real heading`);

console.log(`\n${failures === 0 ? "PASS" : `FAIL — ${failures} problem(s)`}`);
process.exit(failures === 0 ? 0 : 1);
