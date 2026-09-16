#!/usr/bin/env node
// Syncs blog posts from the Obsidian vault's benmswanson.me/ folder into src/content/blog/.
//
// Usage:
//   node scripts/sync-from-obsidian.mjs              # sync every post in the vault
//   node scripts/sync-from-obsidian.mjs "Some Title"  # sync just one post (vault filename, .md optional)
//
// The vault is the source of truth for post *content*. Frontmatter (title/pubDate/
// description) is preserved for posts that already exist on the site; new posts get
// a generated title + today's date and a TODO placeholder description you should fill in.

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const VAULT_DIR =
  process.env.OBSIDIAN_VAULT_DIR ||
  "/Users/benswanson/Library/Mobile Documents/com~apple~CloudDocs/Obsidian/Personal/Personal";
const VAULT_POSTS_DIR = path.join(VAULT_DIR, process.env.OBSIDIAN_VAULT_SUBDIR || "benmswanson.me");
const BLOG_DIR = path.join(import.meta.dirname, "..", "src", "content", "blog");

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/** Convert Obsidian/vault markdown conventions to this site's house style. */
function transformBody(raw) {
  let text = raw
    // Smart quotes/apostrophes -> straight
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    // Non-breaking spaces -> normal spaces
    .replace(/ /g, " ")
    // Markdown links -> anchor tags that open in a new tab
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener">$1</a>',
    )
    // A line of 3+ underscores as a thematic break -> "---"
    .replace(/^_{3,}$/gm, "---")
    // Trim trailing whitespace on each line
    .replace(/[ \t]+$/gm, "");

  // Collapse leading/trailing blank lines, ensure single trailing newline
  text = text.replace(/^\n+/, "").replace(/\n+$/, "");
  return text + "\n";
}

function splitFrontmatter(fileText) {
  const match = fileText.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return { frontmatter: null, body: fileText };
  return { frontmatter: match[1], body: fileText.slice(match[0].length) };
}

function buildFrontmatter({ title, pubDate, description }) {
  return `---\ntitle: "${title}"\npubDate: ${pubDate}\ndescription: "${description}"\n---\n\n`;
}

async function syncOne(vaultFilename) {
  const title = vaultFilename.replace(/\.md$/, "");
  const slug = slugify(title);
  const vaultPath = path.join(VAULT_POSTS_DIR, `${title}.md`);
  const destPath = path.join(BLOG_DIR, `${slug}.md`);

  const rawVaultText = await readFile(vaultPath, "utf-8");
  const newBody = transformBody(rawVaultText);

  let frontmatter;
  if (existsSync(destPath)) {
    const existing = await readFile(destPath, "utf-8");
    const { frontmatter: existingFrontmatter } = splitFrontmatter(existing);
    frontmatter = existingFrontmatter
      ? `---\n${existingFrontmatter}\n---\n\n`
      : buildFrontmatter({ title, pubDate: todayISO(), description: "TODO" });
  } else {
    frontmatter = buildFrontmatter({
      title,
      pubDate: todayISO(),
      description: "TODO",
    });
    console.log(`New post: ${destPath} — fill in the description in frontmatter.`);
  }

  await mkdir(BLOG_DIR, { recursive: true });
  await writeFile(destPath, frontmatter + newBody, "utf-8");
  console.log(`Synced: ${vaultFilename} -> ${path.relative(process.cwd(), destPath)}`);
}

async function main() {
  const arg = process.argv[2];

  if (!existsSync(VAULT_POSTS_DIR)) {
    console.error(`Vault Posts folder not found: ${VAULT_POSTS_DIR}`);
    console.error("Set OBSIDIAN_VAULT_DIR to override the vault location.");
    process.exit(1);
  }

  if (arg) {
    await syncOne(arg.endsWith(".md") ? arg.slice(0, -3) : arg);
    return;
  }

  const entries = await readdir(VAULT_POSTS_DIR);
  const mdFiles = entries.filter((f) => f.endsWith(".md"));
  for (const file of mdFiles) {
    await syncOne(file);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
