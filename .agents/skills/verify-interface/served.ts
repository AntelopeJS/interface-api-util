import { equal } from "@antelopejs/tooling-configs/verify";
import type { Journey, JourneyContext } from "@antelopejs/tooling-configs/verify";

/** Every window the served routes use, in milliseconds: long enough that no window resets during a journey. */
const WINDOW_MS = 600_000;

/**
 * The project a module author writes: the module below as a local source, served by the `@antelopejs/api` the repository
 * installs, whose `@antelopejs/interface-api-util` the `pnpm-workspace.yaml` override links to this repository. Core binds
 * the package to the provider's copy, so an `@antelopejs/api` installed from npm would serve the published release instead.
 */
function projectConfig(repo: string): string {
  return `export default {
  name: "verify-api-util-served",
  cacheFolder: ".antelope/cache",
  modules: {
    api: {
      source: { type: "local", path: ${JSON.stringify(`${repo}/node_modules/@antelopejs/api`)} },
      config: { servers: [{ protocol: "http", host: "127.0.0.1", port: Number(process.env.PORT) }] },
    },
    routes: { source: { type: "local", path: "./routes" } },
  },
};
`;
}

/** A module author's controller: every route uses the helpers the way the docs show, imported by package name. */
const CONTROLLER = `import { Context, Controller, Get, JSONBody, Parameter, Post, type RequestContext } from "@antelopejs/interface-api";
import { assert, assertValidation, RateLimit } from "@antelopejs/interface-api-util";

function parseName(body: unknown): { name: string } {
  if (typeof body === "object" && body !== null && "name" in body && typeof body.name === "string") return { name: body.name };
  throw new Error("name is required");
}

class Routes extends Controller("/") {
  @Get("") health() { return "ok"; }

  @Get("items/:id") item(@Parameter("id") id: string) {
    assert(id === "1", 404, "Item not found");
    return { id };
  }

  @Post("plain") plain(@JSONBody() body: unknown) { return assertValidation(body, parseName); }
  @Post("mapped") mapped(@JSONBody() body: unknown) {
    return assertValidation(body, parseName, (error) => ({ error: error instanceof Error ? error.message : "unknown" }), 422);
  }
  @Post("text") text(@JSONBody() body: unknown) { return assertValidation(body, parseName, () => "bad input"); }
  @Post("empty") empty(@JSONBody() body: unknown) { return assertValidation(body, parseName, () => undefined); }

  @Get("limited") @RateLimit(2, ${WINDOW_MS}) limited(@Context() context: RequestContext) {
    context.response.setBody({ route: "limited" });
    return context.response;
  }
  @Get("other") @RateLimit(2, ${WINDOW_MS}) other() { return { route: "other" }; }
  @Get("tenants/:tenant") @RateLimit(1, ${WINDOW_MS}, { key: (context) => context.routeParameters.tenant, message: "slow down" })
  tenant(@Parameter("tenant") tenant: string) { return { tenant }; }
  @Get("fallback/:tenant") @RateLimit(1, ${WINDOW_MS}, { key: () => "" }) fallback(@Parameter("tenant") tenant: string) { return { tenant }; }
}

void Routes;

export function construct(): void {}
export function start(): void {}
export function stop(): void {}
export function destroy(): void {}
`;

/** Sends the requests in order and prints, for each, what a client reads: status, content type, body and the rate-limit headers, the reset as a bound check because it is a wall-clock time. */
const REQUESTS = `const [base, list] = process.argv.slice(2);
const windowMs = ${WINDOW_MS};
async function main() {
  const out = [];
  for (const [method, path, body] of JSON.parse(list)) {
    const sent = Date.now();
    const res = await fetch(base + path, { method, headers: body === undefined ? {} : { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const header = (name) => res.headers.get(name);
    const reset = header("x-ratelimit-reset");
    const retry = header("retry-after");
    const resetIn = reset === null ? null : Number(reset) * 1000 - sent;
    out.push({
      request: method + " " + path,
      status: res.status,
      type: (header("content-type") ?? "").split(";")[0],
      body: await res.text(),
      limit: header("x-ratelimit-limit"),
      remaining: header("x-ratelimit-remaining"),
      resetWithinWindow: resetIn === null ? null : resetIn > 0 && resetIn <= windowMs + 1000,
      retryAfterWithinWindow: retry === null ? null : Number(retry) > 0 && Number(retry) <= windowMs / 1000,
    });
  }
  return out;
}
main().then((out) => { console.log(JSON.stringify(out)); process.exit(0); }, (error) => { console.error(error); process.exit(1); });
`;

/** One request a journey sends: method, path and an optional JSON body. */
export type ServedRequest = [method: "GET" | "POST", path: string, body?: { [key: string]: string | number }];

/** What the request script prints for one request. */
export interface ServedAnswer {
  request: string;
  status: number;
  type: string;
  body: string;
  limit: string | null;
  remaining: string | null;
  resetWithinWindow: boolean | null;
  retryAfterWithinWindow: boolean | null;
}

async function linkPackage(context: JourneyContext, modules: string, name: string, target: string): Promise<void> {
  await context.command(`link ${name}`, "ln", ["-s", target, `${modules}/${name}`]);
}

/** Writes the module, links the packages a module author installs, and compiles it with the repository's TypeScript. */
async function writeModule(context: JourneyContext, project: string): Promise<void> {
  const folder = `${project}/routes`;
  const modules = `${folder}/node_modules`;
  context.edit("write the module manifest", `${folder}/package.json`, `${JSON.stringify({ name: "verify-routes", version: "1.0.0", main: "index.js" })}\n`);
  context.edit("write the controller", `${folder}/src/index.ts`, CONTROLLER);
  await context.command("create the module's node_modules", "mkdir", ["-p", `${modules}/@antelopejs`, `${modules}/@types`]);
  await linkPackage(context, modules, "@antelopejs/interface-api-util", context.repo);
  for (const name of ["@antelopejs/interface-api", "@antelopejs/interface-core", "@types/node"])
    await linkPackage(context, modules, name, `${context.repo}/node_modules/${name}`);
  const compiled = await context.command("compile the module", "node", [
    `${context.repo}/node_modules/typescript/bin/tsc`,
    "--strict",
    "--skipLibCheck",
    "--experimentalDecorators",
    "--target",
    "es2022",
    "--module",
    "commonjs",
    "--moduleResolution",
    "node",
    "--typeRoots",
    `${modules}/@types`,
    "--types",
    "node",
    "--rootDir",
    `${folder}/src`,
    "--outDir",
    folder,
    `${folder}/src/index.ts`,
  ]);
  context.expect(compiled.folder, [{ name: "the controller compiles against the built declarations", pass: compiled.exitCode === 0, detail: compiled.stdout.slice(0, 600) }], { critical: true });
}

/**
 * A journey that serves the module author's controller through `ajs project dev` and `@antelopejs/api`, sends
 * `requests` in order over HTTP, and checks every answer against `expected`.
 */
export function served(title: string, requests: ServedRequest[], expected: ServedAnswer[]): Journey {
  return {
    title,
    entryPoint: "HTTP requests to a module whose controller uses the helpers, served by ajs project dev with the repository's @antelopejs/api",
    async run(context) {
      const project = `${context.work}/project`;
      context.edit("write the project", `${project}/antelope.config.ts`, projectConfig(context.repo));
      await writeModule(context, project);
      const app = await context.dev("ajs project dev", project);
      const script = `${context.work}/requests.cjs`;
      context.edit("write the request script", script, REQUESTS);
      const sent = await context.command("send the requests", "node", [script, `http://127.0.0.1:${app.port}`, JSON.stringify(requests)], { timeoutMs: 60_000 });
      if (sent.exitCode !== 0) {
        const health = await context.http("probe the server", `http://127.0.0.1:${app.port}/`);
        if (health.status === null) context.notVerified(`the served app stopped answering: ${health.error ?? "no answer"}`);
      }
      context.expect(sent.folder, [
        { name: "every request got an answer", pass: sent.exitCode === 0, detail: sent.stderr.slice(-300) },
        equal("each answer is what the docs promise", sent.stdout.trim().split("\n").at(-1) ?? "", JSON.stringify(expected)),
      ]);
      await context.stop("stop ajs project dev", app);
    },
  };
}
