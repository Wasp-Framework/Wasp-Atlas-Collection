import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = process.cwd();
const SYSTEMS_DIR = path.join(REPO_ROOT, "systems");
const CATALOG_DIR = path.join(REPO_ROOT, "catalog");
const CATALOG_PATH = path.join(CATALOG_DIR, "catalog.json");
const README_PATH = path.join(REPO_ROOT, "README.md");

const AUTO_START = "<!-- AUTO-LIST:START -->";
const AUTO_END = "<!-- AUTO-LIST:END -->";

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function exists(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function safeSlugFromFolder(folderName) {
  const ok = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(folderName);
  assert(ok, `Invalid slug/folder name "${folderName}". Use lowercase letters/numbers/hyphens only.`);
  return folderName;
}

function buildSystemsIndex() {
  assert(exists(SYSTEMS_DIR), `Missing folder: ${SYSTEMS_DIR}`);

  const entries = fs.readdirSync(SYSTEMS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .sort();

  const systems = [];

  for (const folder of entries) {
    const slug = safeSlugFromFolder(folder);
    const sysDir = path.join(SYSTEMS_DIR, folder);

    const aggregationPath = path.join(sysDir, "aggregation.json");
    const metaPath = path.join(sysDir, "meta.json");
    const thumbPath = path.join(sysDir, "screenshots", "00_thumb.png");

    // required files
    assert(exists(aggregationPath), `Missing ${path.relative(REPO_ROOT, aggregationPath)}`);
    assert(exists(metaPath), `Missing ${path.relative(REPO_ROOT, metaPath)}`);
    assert(exists(thumbPath), `Missing ${path.relative(REPO_ROOT, thumbPath)} (required thumbnail)`);

    const meta = readJson(metaPath);

    const name = meta.name ?? slug;
    const description = meta.description ?? "";
    const tags = Array.isArray(meta.tags) ? meta.tags : [];
    const license = meta.license ?? "";
    const author = meta.author ?? "";

    systems.push({
      slug,
      name,
      description,
      tags,
      license,
      author,
      thumbnail: `systems/${slug}/screenshots/00_thumb.png`,
      aggregation_url: `systems/${slug}/aggregation.json`,
      meta_url: `systems/${slug}/meta.json`
    });
  }

  return systems;
}

function writeCatalog(systems) {
  if (!exists(CATALOG_DIR)) fs.mkdirSync(CATALOG_DIR, { recursive: true });

  const catalog = {
    generated_at: new Date().toISOString(),
    count: systems.length,
    systems
  };

  fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2) + "\n", "utf8");
}

function mdEscape(text) {
  return String(text).replace(/\|/g, "\\|").trim();
}

function buildSystemReadme(system) {
  const tags = system.tags.length
    ? system.tags.map(t => `\`${t}\``).join(" ")
    : "_No tags_";

  const description = system.description
    ? system.description
    : "_No description provided._";

  const author = system.author
    ? system.author
    : "_Unknown author_";

  const license = system.license
    ? system.license
    : "_No license specified_";

  return `# ${system.name}

![${system.name}](screenshots/00_thumb.png)

## Description

${description}

## Information

| Field | Value |
|---|---|
| Slug | \`${system.slug}\` |
| Author | ${author} |
| License | ${license} |
| Tags | ${tags} |

## Files

- [aggregation.json](aggregation.json)
- [meta.json](meta.json)

---

This README was generated automatically from \`meta.json\`.
`;
}

function writeSystemReadmes(systems) {
  for (const system of systems) {
    const sysDir = path.join(SYSTEMS_DIR, system.slug);
    const readmePath = path.join(sysDir, "README.md");
    const content = buildSystemReadme(system);

    fs.writeFileSync(readmePath, content, "utf8");
  }
}


function buildReadmeSection(systems) {
  const lines = [];
  lines.push("");
  lines.push("| Preview | System | Tags | Files |");
  lines.push("|---|---|---|---|");

  for (const s of systems) {
    const tags = s.tags.length ? mdEscape(s.tags.join(", ")) : "";
    const author = s.author ? `<br/><sub>by ${mdEscape(s.author)}</sub>` : "";
    const name = `**${mdEscape(s.name)}**${author}`;
    const preview = `<img src="${s.thumbnail}" width="120" />`;
    const files = `[aggregation](${s.aggregation_url}) · [meta](${s.meta_url})`;

    lines.push(`| ${preview} | ${name} | ${tags} | ${files} |`);
  }

  lines.push("");
  return lines.join("\n");
}

function updateReadme(systems) {
  assert(exists(README_PATH), "Missing README.md");

  const readme = fs.readFileSync(README_PATH, "utf8");
  const start = readme.indexOf(AUTO_START);
  const end = readme.indexOf(AUTO_END);

  assert(start !== -1 && end !== -1 && end > start, "README markers not found or in wrong order.");

  const before = readme.slice(0, start + AUTO_START.length);
  const after = readme.slice(end);

  const section = buildReadmeSection(systems);

  const next = `${before}\n${section}\n${after}`;
  fs.writeFileSync(README_PATH, next, "utf8");
}

const systems = buildSystemsIndex();
writeCatalog(systems);
updateReadme(systems);
writeSystemReadmes(systems);

console.log(
  `Generated ${path.relative(REPO_ROOT, CATALOG_PATH)}, updated root README, and generated system READMEs for ${systems.length} systems.`
);