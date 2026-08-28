import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const dynamic = "force-static";
export const revalidate = false;

export function GET() {
  const filePath = join(process.cwd(), "public", "index.html");

  if (!existsSync(filePath)) {
    return new Response("Not Found", { status: 404 });
  }

  return new Response(readFileSync(filePath, "utf8"), {
    headers: {
      "Cache-Control": "public, max-age=0, must-revalidate",
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
