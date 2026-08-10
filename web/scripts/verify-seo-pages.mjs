import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, "../dist");
const contentPath = path.resolve(__dirname, "../src/seo-content.json");
const siteUrl = "https://sharedmoney.app";
const pages = JSON.parse(await readFile(contentPath, "utf8"));
const failures = [];

function report(condition, message) {
  if (!condition) {
    failures.push(message);
  }
}

function outputPath(page) {
  return page.path === "/" ? path.join(distDir, "index.html") : path.join(distDir, page.path, "index.html");
}

function pageUrl(page) {
  return `${siteUrl}${page.path === "/" ? "" : page.path}`;
}

function escapeAttribute(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}

report(pages.length > 0, "Expected at least one indexable route.");
report(new Set(pages.map((page) => page.path)).size === pages.length, "SEO paths must be unique.");

for (const page of pages) {
  const filePath = outputPath(page);
  try {
    await access(filePath);
  } catch {
    failures.push(`Missing generated page: ${filePath}`);
    continue;
  }

  const html = await readFile(filePath, "utf8");
  const h1s = html.match(/<h1(?:\s[^>]*)?>/gi) ?? [];
  const canonical = `<link rel="canonical" href="${pageUrl(page)}" />`;

  report(html.includes(`<title>${page.title}</title>`), `${page.path}: incorrect title.`);
  report(html.includes(`<meta name="description" content="${page.description}" />`), `${page.path}: incorrect description.`);
  report(html.includes(canonical), `${page.path}: incorrect canonical.`);
  report(!html.includes('name="keywords"'), `${page.path}: deprecated meta keywords tag remains.`);
  report(h1s.length === 1, `${page.path}: expected one H1, found ${h1s.length}.`);
  report(html.includes(`<h1>${page.heading}</h1>`), `${page.path}: static H1 does not match route content.`);
  report(html.includes('type="application/ld+json"'), `${page.path}: missing structured data.`);

  if (page.cta) {
    report(html.includes(`href="${escapeAttribute(page.cta.href)}"`), `${page.path}: missing migration CTA in static HTML.`);
  }

  for (const relatedId of page.related) {
    const related = pages.find((candidate) => candidate.id === relatedId);
    report(Boolean(related), `${page.path}: unknown related route ${relatedId}.`);
    if (related) {
      report(html.includes(`href="${related.path}"`), `${page.path}: missing internal link to ${related.path}.`);
    }
  }
}

const sitemap = await readFile(path.join(distDir, "sitemap.xml"), "utf8");
for (const page of pages) {
  report(sitemap.includes(`<loc>${pageUrl(page)}</loc><lastmod>${page.updated}</lastmod>`), `${page.path}: missing sitemap entry or lastmod.`);
}

const notFound = await readFile(path.join(distDir, "404.html"), "utf8");
report(notFound.includes('name="robots" content="noindex,follow"'), "404 page must be noindex.");

if (failures.length > 0) {
  throw new Error(`SEO verification failed:\n- ${failures.join("\n- ")}`);
}

console.log(`SEO verification passed for ${pages.length} indexable routes.`);
