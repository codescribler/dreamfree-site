import fs from "fs";
import path from "path";
import matter from "gray-matter";

const contentDir = path.join(process.cwd(), "content");
const sections = ["learning-centre"];
const requiredFields = [
  "title",
  "description",
  "tag",
  "date",
  "readTime",
  "featured",
  "author",
  "takeaway",
  "relatedSlugs",
];

const errors: string[] = [];
const allSlugs: Set<string> = new Set();

// Collect all slugs first
for (const section of sections) {
  const dir = path.join(contentDir, section);
  if (!fs.existsSync(dir)) continue;
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".mdx"))) {
    allSlugs.add(file.replace(/\.mdx$/, ""));
  }
}

// Validate each file
for (const section of sections) {
  const dir = path.join(contentDir, section);
  if (!fs.existsSync(dir)) continue;

  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".mdx"))) {
    const filePath = path.join(dir, file);
    const raw = fs.readFileSync(filePath, "utf-8");
    const { data } = matter(raw);

    // Check required fields
    for (const field of requiredFields) {
      if (
        data[field] === undefined ||
        data[field] === null ||
        data[field] === ""
      ) {
        errors.push(`${section}/${file}: missing required field "${field}"`);
      }
    }

    // Check relatedSlugs reference real articles
    if (Array.isArray(data.relatedSlugs)) {
      for (const related of data.relatedSlugs) {
        if (!allSlugs.has(related)) {
          errors.push(
            `${section}/${file}: relatedSlug "${related}" does not match any article`
          );
        }
      }
    }
  }
}

if (errors.length > 0) {
  console.error("\nContent validation failed:\n");
  errors.forEach((e) => console.error(`  - ${e}`));
  console.error(`\n${errors.length} error(s) found.\n`);
  process.exit(1);
} else {
  console.log("All content files valid.");
}
