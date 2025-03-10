import { type NextRequest } from "next/server";
import { getAuth } from "@/lib/auth";
import { getToken } from "@/lib/token";
import { fetchDeployments } from "@/platforms/netlify";

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ owner: string, repo: string, branch: string, path: string }> }
) {
  const params = await props.params;
  try {
    const { user, session } = await getAuth();
    if (!session) return new Response(null, { status: 401 });

    const token = await getToken(user, params.owner, params.repo);
    if (!token) throw new Error("Token not found");

    let deployment;

    if (process.env.DEPLOYMENT_PLATFORM === "netlify") {
      deployment = await fetchDeployments(params.owner, params.repo, params.branch);
    }

    return Response.json({
      status: "success",
      data: deployment
    });
  } catch (error: any) {
    console.error(error);
    return Response.json({
      status: "error",
      message: error.message,
    });
  }
}