import { type NextRequest } from "next/server";
import { getAuth } from "@/lib/auth";
import { getToken } from "@/lib/token";
import { getEntry } from "@/lib/utils/entry";
import { normalizePath } from "@/lib/utils/file";

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ owner: string, repo: string, branch: string, path: string }> }
) {
  const params = await props.params;
  try {
    const { user, session } = await getAuth();
    if (!session) return new Response(null, { status: 401 });

    const searchParams = request.nextUrl.searchParams;
    const name = searchParams.get("name") || undefined; // Change null to undefined
    const normalizedPath = normalizePath(params.path);

    if (!name && normalizedPath !== ".pages.yml") throw new Error("If no content entry name is provided, the path must be \".pages.yml\".");

    const response = await getEntry(user, params.owner, params.repo, params.branch, params.path, name);

    return Response.json({
      status: "success",
      data: {
        sha: response.sha,
        name: response.name,
        path: response.path,
        contentObject: response.contentObject
      }
    });
  } catch (error: any) {
    console.error(error);
    return Response.json({
      status: "error",
      message: error.status === 404 ? "Not found" : error.message,
    });
  }
}