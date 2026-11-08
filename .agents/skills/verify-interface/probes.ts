import { equal } from "@antelopejs/tooling-configs/verify";
import type { Journey } from "@antelopejs/tooling-configs/verify";

/** The setup every scenario shares: the built package and the `interface-api` copy it resolves. */
const SCENARIO_PRELUDE = `
const [dist, repo] = process.argv.slice(2);
const { createRequire } = require("node:module");
const util = require(dist);
const api = createRequire(repo + "/")("@antelopejs/interface-api");
const thrown = (action) => { try { action(); return null; } catch (error) { return error; } };
const result = (error) => error instanceof api.HTTPResult ? { status: error.getStatus(), body: error.getBody(), type: error.getContentType() } : { other: String(error) };
`;

const SCENARIO_TAIL = `
main().then((out) => { console.log(JSON.stringify(out, (key, value) => (value === undefined ? null : value))); process.exit(0); }, (error) => { console.error(error); process.exit(1); });
`;

/** `Assert<Identical<A, B>>` fails to compile unless A and B are the same type, so an added optional field or a widening to `any` is caught. */
const PROBE_HEADER = `
type Identical<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;
`;

/** Runs a scenario against the built package in a Node process, then checks what it printed against the documented behaviour. */
export function scenario(title: string, body: string, printed: string): Journey {
  return {
    title,
    entryPoint: "the built package driven from a Node process with the interface-api copy it resolves",
    async run(context) {
      const file = `${context.work}/scenario.cjs`;
      context.edit("write the scenario", file, `${SCENARIO_PRELUDE}\nasync function main() {\n${body}\n}\n${SCENARIO_TAIL}`);
      const ran = await context.command("run the scenario", "node", [file, `${context.repo}/dist/index.js`, context.repo], { timeoutMs: 60_000 });
      context.expect(ran.folder, [
        { name: "the scenario ended cleanly", pass: ran.exitCode === 0, detail: ran.stderr.slice(-300) },
        equal("the answers are what the docs promise", ran.stdout.trim().split("\n").at(-1) ?? "", printed),
      ]);
    },
  };
}

/** Compiles a probe against the built declarations in a consumer's strict mode. */
export function declared(title: string, probe: string): Journey {
  return {
    title,
    entryPoint: "a TypeScript consumer compiling against the built declarations",
    async run(context) {
      const file = `${context.work}/probe.ts`;
      const imports = `import * as Util from "${context.repo}/dist/index";\nimport type { HTTPBody, RequestContext } from "@antelopejs/interface-api";\nimport type { MethodDecorator } from "@antelopejs/interface-core/decorators";`;
      await context.command("link the repository's dependencies", "ln", ["-s", `${context.repo}/node_modules`, `${context.work}/node_modules`]);
      context.edit("write the shape probe", file, `${imports}\n${PROBE_HEADER}\n${probe}`);
      const compiled = await context.command("compile the shape probe", "node", [
        `${context.repo}/node_modules/typescript/bin/tsc`,
        "--noEmit",
        "--strict",
        "--skipLibCheck",
        "--target",
        "es2022",
        "--module",
        "commonjs",
        "--moduleResolution",
        "node",
        "--types",
        "node",
        file,
      ]);
      context.expect(compiled.folder, [{ name: "every export has the documented shape", pass: compiled.exitCode === 0, detail: compiled.stdout.slice(0, 600) }]);
    },
  };
}
