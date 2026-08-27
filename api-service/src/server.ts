import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { isAuthorized } from "./auth.js";
import {
  buildHadithResponse,
  buildMetadata,
  buildQuranResponse,
} from "./contracts.js";
import { sql } from "./database.js";
import { searchHadiths, searchQuran } from "./search.js";
import {
  hadithSearchSchema,
  parseQuery,
  quranSearchSchema,
} from "./validation.js";

function positiveInteger(value: string | undefined, fallback: number, name: string) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

const port = positiveInteger(process.env.PORT, 3000, "PORT");
const configuredApiKey = process.env.CRITERION_API_KEY;

if (!configuredApiKey) {
  throw new Error("CRITERION_API_KEY is required");
}
const apiKey: string = configuredApiKey;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(
  response: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
) {
  response.writeHead(status, {
    ...corsHeaders,
    "Content-Type": "application/json; charset=utf-8",
    ...headers,
  });
  response.end(JSON.stringify(body));
}

async function handleRequest(request: IncomingMessage, response: ServerResponse) {
  const startedAt = performance.now();
  let path = request.url ?? "/";

  try {
    const url = new URL(path, `http://${request.headers.host ?? "localhost"}`);
    path = url.pathname;

    if (request.method === "OPTIONS" && url.pathname.startsWith("/api/v1")) {
      response.writeHead(200, corsHeaders);
      response.end();
      return;
    }

    if (request.method === "GET" && url.pathname === "/health") {
      await sql`SELECT 1`;
      json(response, 200, { status: "ok" });
      return;
    }

    if (
      url.pathname.startsWith("/api/v1") &&
      !isAuthorized(request.headers.authorization, apiKey)
    ) {
      json(
        response,
        401,
        {
          error: "Unauthorized",
          message: "Missing or invalid bearer token",
        },
        { "WWW-Authenticate": "Bearer" }
      );
      return;
    }

    if (request.method !== "GET") {
      json(response, 405, { error: "Method not allowed" });
      return;
    }

    if (url.pathname === "/api/v1") {
      json(response, 200, buildMetadata());
      return;
    }

    if (url.pathname !== "/api/v1/quran/search" && url.pathname !== "/api/v1/hadith/search") {
      json(response, 404, { error: "Not found" });
      return;
    }

    if (url.pathname === "/api/v1/quran/search") {
      const parsed = parseQuery(url, quranSearchSchema);
      if (!parsed.success) {
        json(response, 400, parsed.error);
        return;
      }

      const search = await searchQuran(parsed.data.q, parsed.data.limit);
      json(response, 200, buildQuranResponse(search.results, parsed.data.q));
      return;
    }

    const parsed = parseQuery(url, hadithSearchSchema);
    if (!parsed.success) {
      json(response, 400, parsed.error);
      return;
    }

    const search = await searchHadiths(parsed.data.q, parsed.data);
    json(
      response,
      200,
      buildHadithResponse(
        search.results,
        parsed.data.q,
        parsed.data.collections,
        parsed.data.grade
      )
    );
  } catch (error) {
    console.error("Request failed", {
      method: request.method,
      path,
      durationMs: Math.round(performance.now() - startedAt),
      error,
    });
    if (!response.headersSent) {
      json(response, 500, {
        error: "Internal server error",
        message: "An error occurred while processing your request",
      });
    } else {
      response.end();
    }
  }
}

const server = createServer((request, response) => {
  void handleRequest(request, response);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Criterion API listening on port ${port}`);
});

async function shutdown() {
  server.close();
  await sql.end({ timeout: 5 });
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
