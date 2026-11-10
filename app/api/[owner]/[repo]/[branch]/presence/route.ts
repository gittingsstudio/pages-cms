import { and, eq, gt, lt, ne } from "drizzle-orm";
import { db } from "@/db";
import { cacheFileTable, entryPresenceTable } from "@/db/schema";
import { getToken } from "@/lib/token";
import { createHttpError, toErrorResponse } from "@/lib/api-error";
import { requireApiUserSession } from "@/lib/session-server";
import { normalizePath } from "@/lib/utils/file";

/**
 * Heartbeat for "who else is editing this entry".
 *
 * POST /api/[owner]/[repo]/[branch]/presence
 * Body: { path, dirty?, sha?, since?, leave? } (`since` is a `serverTime` from an earlier reply)
 *
 * Returns the other people seen on the same entry recently and, when the file
 * cache knows of a newer version than the caller's `sha`, that version.
 *
 * Requires authentication.
 */

const ACTIVE_WINDOW_MS = 45_000;
const STALE_ROW_MS = 24 * 60 * 60 * 1000;

export async function POST(
  request: Request,
  context: { params: Promise<{ owner: string; repo: string; branch: string }> },
) {
  try {
    const params = await context.params;
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) return sessionResult.response;
    const user = sessionResult.user;

    const { token } = await getToken(user, params.owner, params.repo);
    if (!token) throw createHttpError("Token not found", 401);

    const body: any = await request.json().catch(() => ({}));
    if (typeof body?.path !== "string" || !body.path) throw createHttpError("\"path\" is required.", 400);

    const path = normalizePath(body.path);
    const entryWhere = and(
      eq(entryPresenceTable.owner, params.owner),
      eq(entryPresenceTable.repo, params.repo),
      eq(entryPresenceTable.branch, params.branch),
      eq(entryPresenceTable.path, path),
    );

    if (body.leave === true) {
      await db.delete(entryPresenceTable).where(and(entryWhere, eq(entryPresenceTable.userId, user.id)));
      return Response.json({ status: "success", data: { others: [], latest: null } });
    }

    const now = new Date();
    const row = {
      owner: params.owner,
      repo: params.repo,
      branch: params.branch,
      path,
      userId: user.id,
      name: user.name || user.email?.split("@")[0] || null,
      image: user.image ?? null,
      isDirty: body.dirty === true,
      lastSeenAt: now,
    };

    await db.insert(entryPresenceTable).values(row).onConflictDoUpdate({
      target: [
        entryPresenceTable.owner,
        entryPresenceTable.repo,
        entryPresenceTable.branch,
        entryPresenceTable.path,
        entryPresenceTable.userId,
      ],
      set: {
        name: row.name,
        image: row.image,
        isDirty: row.isDirty,
        lastSeenAt: now,
      },
    });

    // Opportunistic cleanup of rows left behind by closed tabs.
    if (Math.random() < 0.02) {
      void db.delete(entryPresenceTable)
        .where(lt(entryPresenceTable.lastSeenAt, new Date(now.getTime() - STALE_ROW_MS)))
        .catch((error) => console.error("Failed to clean up presence rows", error));
    }

    const others = await db
      .select({
        userId: entryPresenceTable.userId,
        name: entryPresenceTable.name,
        image: entryPresenceTable.image,
        isDirty: entryPresenceTable.isDirty,
        lastSeenAt: entryPresenceTable.lastSeenAt,
      })
      .from(entryPresenceTable)
      .where(and(
        entryWhere,
        ne(entryPresenceTable.userId, user.id),
        gt(entryPresenceTable.lastSeenAt, new Date(now.getTime() - ACTIVE_WINDOW_MS)),
      ));

    // Only trust the cache when it was updated after the caller loaded their
    // copy, so a stale cache never claims an old version is "newer".
    let latest: { sha: string; commitSha: string | null; updatedAt: string } | null = null;
    const since = typeof body.since === "string" ? new Date(body.since) : null;
    if (typeof body.sha === "string" && body.sha && since && !Number.isNaN(since.getTime())) {
      const cached = await db.query.cacheFileTable.findFirst({
        where: and(
          eq(cacheFileTable.owner, params.owner),
          eq(cacheFileTable.repo, params.repo),
          eq(cacheFileTable.branch, params.branch),
          eq(cacheFileTable.path, path),
        ),
      });
      if (cached?.sha && cached.sha !== body.sha && cached.updatedAt > since) {
        latest = {
          sha: cached.sha,
          commitSha: cached.commitSha ?? null,
          updatedAt: cached.updatedAt.toISOString(),
        };
      }
    }

    return Response.json({
      status: "success",
      data: {
        others: others.map((other) => ({
          ...other,
          lastSeenAt: other.lastSeenAt.toISOString(),
        })),
        latest,
        // Clients echo this back as `since`, so comparisons use the server clock.
        serverTime: now.toISOString(),
      },
    });
  } catch (error: any) {
    console.error(error);
    return toErrorResponse(error);
  }
}
