/**
 * Checks that every recipe workflow in the pack carries a recipe puddlerouter
 * can compile: a `puddlerouterRecipe` tag that is JSON, and one model-method
 * step whose inputs are the declared captures or fixed words. Then checks the
 * github-open-issue-count recipe against the phrasings it was agreed for.
 *
 * Run with: make test
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import { parse } from "jsr:@std/yaml@1";

interface Step {
  name: string;
  task: {
    type: string;
    modelIdOrName: string;
    methodName: string;
    inputs: Record<string, string>;
  };
}
interface Workflow {
  name: string;
  description?: string;
  tags: Record<string, string>;
  inputs: { properties: Record<string, unknown>; required?: string[] };
  jobs: Array<{ steps: Step[] }>;
}
interface Recipe {
  id: string;
  extension: string;
  pattern: string;
  dataName: string;
  inputs: Record<string, { capture: number; as: string }>;
  each?: { path: string; line: string };
  template: string;
  empty?: string;
  source?: { url: string; version?: number };
}

const DIR = new URL("../../workflows/", import.meta.url);

async function workflows(): Promise<Array<[string, Workflow]>> {
  const out: Array<[string, Workflow]> = [];
  for await (const e of Deno.readDir(DIR)) {
    if (!e.name.endsWith(".yaml")) continue;
    const text = await Deno.readTextFile(new URL(e.name, DIR));
    out.push([e.name, parse(text) as Workflow]);
  }
  return out;
}

async function recipe(id: string): Promise<[Workflow, Recipe]> {
  for (const [, wf] of await workflows()) {
    const r = JSON.parse(wf.tags.puddlerouterRecipe) as Recipe;
    if (r.id === id) return [wf, r];
  }
  throw new Error(`no recipe ${id}`);
}

// The next three mirror @puddleworks/recipes 2026.11.10.1 (models/_lib/
// config.ts): a pattern is held to the whole turn, case-insensitively, after
// the turn is trimmed and its spaces collapsed; `{a.b}` in a template is
// filled from a dotted path, and a missing value becomes "".
function wholeTurn(source: string): RegExp {
  return new RegExp(`^(?:${source})$`, "i");
}

function matchTurn(r: Recipe, text: string): string[] | null {
  const m = wholeTurn(r.pattern).exec(text.trim().replace(/\s+/g, " "));
  return m ? m.slice(1) : null;
}

function fill(template: string, data: unknown): string {
  return template.replace(/\{([\w.]+)\}/g, (_whole, path: string) => {
    let v: unknown = data;
    for (const key of path.split(".")) {
      if (typeof v !== "object" || v === null) return "";
      v = (v as Record<string, unknown>)[key];
    }
    return v === undefined || v === null ? "" : String(v);
  });
}

// The engine's own shapes for a capture, and the turns it refuses a pattern
// for matching (config.ts, SHAPES and ANY_TURN_PROBES).
const REPO = /^[\w.-]+\/[\w.-]+$/;
const ANY_TURN_PROBES = [
  "",
  "x",
  "please fix the bug in this file",
  "what should we do next?",
  "Refactor the login page, then run the tests.",
];

Deno.test("the pack has at least one recipe workflow", async () => {
  assert((await workflows()).length >= 1);
});

Deno.test("each workflow is named for the pack and carries a recipe tag", async () => {
  for (const [file, wf] of await workflows()) {
    assert(
      wf.name.startsWith("@puddleworks/recipes-external-"),
      `${file}: name ${wf.name}`,
    );
    const r = JSON.parse(wf.tags.puddlerouterRecipe) as Recipe;
    assert(/^[a-z0-9][a-z0-9-]*$/.test(r.id), `${file}: id`);
    new RegExp(r.pattern, "i");
    assert(r.template.length > 0, `${file}: template`);
    assert(
      /^@[\w-]+\/[\w-]+$/.test(r.extension ?? ""),
      `${file}: extension names the model type's extension`,
    );
    for (const probe of ANY_TURN_PROBES) {
      assertEquals(matchTurn(r, probe), null, `${file}: matches "${probe}"`);
    }
  }
});

Deno.test("each recipe has one model-method step fed by its captures", async () => {
  for (const [file, wf] of await workflows()) {
    const r = JSON.parse(wf.tags.puddlerouterRecipe) as Recipe;
    const steps = wf.jobs.flatMap((j) => j.steps);
    assertEquals(steps.length, 1, `${file}: one step`);
    assertEquals(steps[0].task.type, "model_method", `${file}: step type`);
    const fed = new Set<string>();
    for (const [name, value] of Object.entries(steps[0].task.inputs)) {
      const ref = /^\$\{\{ inputs\.(\w+) \}\}$/.exec(value);
      if (!ref) continue; // a fixed word
      assertEquals(ref[1], name, `${file}: ${name} is fed by inputs.${name}`);
      assert(r.inputs[name], `${file}: ${name} has no capture`);
      assert(wf.inputs.properties[name], `${file}: input ${name}`);
      fed.add(name);
    }
    for (const [name, c] of Object.entries(r.inputs)) {
      assert(fed.has(name), `${file}: capture ${name} is not a step input`);
      assert(c.capture >= 1 && c.capture <= 9, `${file}: ${name} capture`);
      assert(["int", "repo", "word"].includes(c.as), `${file}: ${name} as`);
    }
  }
});

Deno.test("each recipe links back to the request it answers", async () => {
  for (const [file, wf] of await workflows()) {
    const r = JSON.parse(wf.tags.puddlerouterRecipe) as Recipe;
    const url = new URL(r.source?.url ?? "");
    assert(
      url.protocol === "https:" ||
        (url.protocol === "http:" &&
          ["127.0.0.1", "localhost"].includes(url.hostname)),
      `${file}: source url ${url}`,
    );
    assert(Number.isInteger(r.source?.version), `${file}: source version`);
  }
});

Deno.test("github-open-issue-count answers both agreed phrasings", async () => {
  const [wf, r] = await recipe("github-open-issue-count");
  assertEquals(r.extension, "@webframp/github");
  const step = wf.jobs[0].steps[0].task;
  assertEquals(step.modelIdOrName, "github");
  assertEquals(step.methodName, "get_repo_info");
  for (
    const repo of [
      "puddle-works/puddlerouter",
      "puddle-works/puddleworks-capture",
    ]
  ) {
    const captures = matchTurn(r, `how many open issues does ${repo} have?`);
    assertEquals(captures, [repo]);
    assert(REPO.test(captures![r.inputs.repo.capture - 1]));
  }
  assertEquals(
    matchTurn(r, "  How many  open issues does cli/cli have "),
    ["cli/cli"],
  );
});

Deno.test("github-open-issue-count refuses turns that ask for more", async () => {
  const [, r] = await recipe("github-open-issue-count");
  for (
    const turn of [
      "how many open issues does puddle-works/puddlerouter have? and list them",
      "how many open issues does puddlerouter have?",
      "how many open issues and prs does puddle-works/puddlerouter have?",
      "close the open issues in puddle-works/puddlerouter",
    ]
  ) {
    assertEquals(matchTurn(r, turn), null, turn);
  }
});

Deno.test("github-open-issue-count names its data for the repo", async () => {
  const [, r] = await recipe("github-open-issue-count");
  // dataNameFor replaces anything outside [\w.-] with "-", so this is the
  // instance name get_repo_info writes: the repo with "/" as "-".
  assertEquals(r.dataName, "{repo}");
});

Deno.test("github-open-issue-count says the exact count from get_repo_info", async () => {
  const [, r] = await recipe("github-open-issue-count");
  assertEquals(r.each, undefined);
  const attrs = (name: string, issues: number, prs: number) => ({
    name,
    issues: { totalCount: issues },
    pullRequests: { totalCount: prs },
  });
  assertEquals(
    fill(r.template, attrs("puddlerouter", 6, 2)),
    "puddlerouter has 6 open issues.",
  );
  assertEquals(
    fill(r.template, attrs("puddleworks-ui", 0, 6)),
    "puddleworks-ui has 0 open issues.",
  );
  assertEquals(
    fill(r.template, attrs("cli", 1075, 300)),
    "cli has 1075 open issues.",
  );
});

Deno.test("github-open-issue-count has an answer for no open issues", async () => {
  const [, r] = await recipe("github-open-issue-count");
  // The engine shows `empty` as written, with no placeholders filled, and only
  // for a recipe with `each`. With no `each`, a repo with no open issues gets
  // the template, which names it as the agreed whenEmpty asks.
  assert(r.empty && r.empty.trim().length > 0, "empty is blank");
  assertEquals(/\{[\w.]+\}/.test(r.empty), false, "empty has a placeholder");
  assertEquals(
    fill(r.template, { name: "puddleworks-ui", issues: { totalCount: 0 } }),
    "puddleworks-ui has 0 open issues.",
  );
});
