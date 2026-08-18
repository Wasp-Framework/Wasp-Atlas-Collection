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

function asRepoPath(...parts) {
  return parts.join("/");
}

function validateSystemFile(sysDir, slug, value, key, fallback) {
  const declared = value ?? `${slug}/${fallback}`;
  assert(typeof declared === "string" && declared.length > 0,
    `Invalid files.${key} in systems/${slug}/meta.json`);

  const normalized = declared.replace(/\\/g, "/");
  assert(normalized === `${slug}/${path.posix.basename(normalized)}`,
    `files.${key} in systems/${slug}/meta.json must point inside the system folder`);

  const filePath = path.join(sysDir, path.posix.basename(normalized));
  assert(exists(filePath), `Missing ${path.relative(REPO_ROOT, filePath)}`);
  return {
    repoUrl: asRepoPath("systems", normalized),
    localUrl: path.posix.basename(normalized)
  };
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

    const metaPath = path.join(sysDir, "meta.json");
    assert(exists(metaPath), `Missing ${path.relative(REPO_ROOT, metaPath)}`);

    const meta = readJson(metaPath);
    assert(meta.slug === slug,
      `Slug in systems/${slug}/meta.json must match its folder name`);

    const name = meta.title ?? slug;
    const description = meta.description?.short ?? "";
    const tags = Array.isArray(meta.tags) ? meta.tags : [];
    const license = meta.license?.value ?? "";
    const authors = Array.isArray(meta.authors) ? meta.authors : [];
    const author = authors.map(item => item?.name).filter(Boolean).join(", ");
    const files = meta.files ?? {};
    const thumbnail = validateSystemFile(sysDir, slug, files.thumbnail, "thumbnail", "00_thumb.png");
    const aggregation = validateSystemFile(sysDir, slug, files.aggregation, "aggregation", "aggregation.json");
    const metaFile = validateSystemFile(sysDir, slug, files.meta, "meta", "meta.json");

    systems.push({
      meta,
      slug,
      name,
      description,
      tags,
      license,
      authors,
      author,
      software: meta.software ?? "",
      units: meta.units ?? "",
      metrics: meta.metrics ?? {},
      thumbnail: thumbnail.repoUrl,
      thumbnailLocal: thumbnail.localUrl,
      aggregation_url: aggregation.repoUrl,
      aggregationLocal: aggregation.localUrl,
      meta_url: metaFile.repoUrl,
      metaLocal: metaFile.localUrl
    });
  }

  return systems;
}

function writeCatalog(systems) {
  if (!exists(CATALOG_DIR)) fs.mkdirSync(CATALOG_DIR, { recursive: true });

  const catalog = {
    generated_at: new Date().toISOString(),
    count: systems.length,
    systems: systems.map(system => system.meta)
  };

  fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2) + "\n", "utf8");
}

function mdEscape(text) {
  return String(text).replace(/\|/g, "\\|").trim();
}

function htmlEscape(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function markdownLink(label, url) {
  return url ? `[${mdEscape(label)}](${url})` : mdEscape(label);
}

function buildSystemReadme(system) {
  const tags = system.tags.length
    ? system.tags.map(t => `\`${t}\``).join(" ")
    : "_No tags_";

  const description = system.description
    ? system.description
    : "_No description provided._";

  const author = system.authors.length
    ? system.authors.map(item => markdownLink(item.name, item.url)).join(", ")
    : "_Unknown author_";

  const license = system.license
    ? system.license
    : "_No license specified_";

  return `# ${system.name}

![${system.name}](${system.thumbnailLocal})

## Description

${description}

## Information

| Field | Value |
|---|---|
| Slug | \`${system.slug}\` |
| Author | ${author} |
| License | ${license} |
| Tags | ${tags} |
| Software | ${system.software || "_Not specified_"} |
| Units | ${system.units || "_Not specified_"} |
| Parts | ${system.metrics?.parts_total ?? "_Not specified_"} |
| Rules | ${system.metrics?.rules_total ?? "_Not specified_"} |

## Files

- [aggregation.json](${system.aggregationLocal})
- [meta.json](${system.metaLocal})

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

function buildSystemCard(s) {
  const tags = s.tags.length
    ? s.tags.map(t => `<code>${htmlEscape(t)}</code>`).join(" ")
    : "";

  const author = s.author
    ? `<sub>by ${htmlEscape(s.author)}</sub><br/>`
    : "";

  const folderUrl = `systems/${s.slug}`;

  return `
<table>
  <tr>
    <td width="90">
      <img src="${s.thumbnail}" width="72" />
    </td>
    <td>
      <strong><a href="${folderUrl}">${htmlEscape(s.name)}</a></strong><br/>
      ${author}
      ${tags ? `${tags}<br/>` : ""}
      <a href="${s.aggregation_url}">aggregation.json</a> · <a href="${s.meta_url}">meta.json</a>
    </td>
  </tr>
</table>`;
}


function buildReadmeSection(systems) {
  const lines = [];
  lines.push("");
  lines.push(`<table width="100%">`);
  lines.push(`  <tbody>`);

  for (let i = 0; i < systems.length; i += 2) {
    const left = systems[i];
    const right = systems[i + 1];

    lines.push(`    <tr>`);
    lines.push(`      <td width="50%" valign="top">`);
    lines.push(buildSystemCard(left));
    lines.push(`      </td>`);

    lines.push(`      <td width="50%" valign="top">`);
    if (right) {
      lines.push(buildSystemCard(right));
    } else {
      lines.push(`&nbsp;`);
    }
    lines.push(`      </td>`);

    lines.push(`    </tr>`);
  }

  lines.push(`  </tbody>`);
  lines.push(`</table>`);
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
