import { existsSync, readFileSync, readdirSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

export const dynamic = "force-static";
export const revalidate = false;

type RouteContext = {
  params: Promise<{ htmlPath?: string[] }>;
};

function collectHtmlParams(directory: string, baseDirectory = directory): Array<{ htmlPath: string[] }> {
  if (!existsSync(directory)) {
    return [];
  }

  const entries = readdirSync(directory, { withFileTypes: true });
  const params: Array<{ htmlPath: string[] }> = [];

  for (const entry of entries) {
    const entryPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      params.push(...collectHtmlParams(entryPath, baseDirectory));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".html")) {
      const rel = relative(baseDirectory, entryPath);
      const withoutExtension = rel.slice(0, -5);
      params.push({ htmlPath: withoutExtension.split(/[\\/]/) });
    }
  }

  return params;
}

export function generateStaticParams() {
  return collectHtmlParams(join(process.cwd(), "public"));
}

export async function GET(_request: Request, context: RouteContext) {
  const { htmlPath = [] } = await context.params;
  const requestedPath = htmlPath.join("/");

  if (!requestedPath) {
    return new Response("Not Found", { status: 404 });
  }

  const publicDirectory = resolve(process.cwd(), "public");
  const filePath = resolve(publicDirectory, `${requestedPath}.html`);
  const relativePath = relative(publicDirectory, filePath);

  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    return new Response("Not Found", { status: 404 });
  }

  if (!existsSync(filePath)) {
    return new Response("Not Found", { status: 404 });
  }

  const html = readFileSync(filePath, "utf8");

  return new Response(html, {
    headers: {
      "Cache-Control": "public, max-age=0, must-revalidate",
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
