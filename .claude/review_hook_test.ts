/**
 * Tests for the hook in settings.json that asks before an adversarial review
 * round starts: a round costs a fresh agent, a build has two at most, and
 * none may start without the user saying yes.
 *
 * Run with:
 *   deno test --allow-read --allow-run .claude/
 *
 * @module
 */
import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1.0.19";

const settings = JSON.parse(
  await Deno.readTextFile(new URL("./settings.json", import.meta.url)),
);

/** What the settings run before an Agent call, given that call's prompt. */
async function runHook(prompt: unknown): Promise<string> {
  const [entry] = settings.hooks.PreToolUse.filter(
    (e: { matcher: string }) => e.matcher === "Agent",
  );
  const child = new Deno.Command("sh", {
    args: ["-c", entry.hooks[0].command],
    stdin: "piped",
    stdout: "piped",
  }).spawn();
  const writer = child.stdin.getWriter();
  await writer.write(
    new TextEncoder().encode(
      JSON.stringify({ tool_name: "Agent", tool_input: { prompt } }),
    ),
  );
  await writer.close();
  const { code, stdout } = await child.output();
  assertEquals(code, 0);
  return new TextDecoder().decode(stdout).trim();
}

Deno.test("review hook: each of Factory's reviewer prompts asks first", async () => {
  for (
    const prompt of [
      // factory-build's step 10, from the release after 2026.11.11.1.
      "You are the adversarial reviewer of a swamp extension before it is published.",
      // factory-build's step 10 in 2026.11.11.1 and older.
      "Review a swamp extension before it is published. You did not build it;",
      "ADVERSARIAL REVIEWER: check the fixes",
      "an adversarial\n  reviewer, wrapped across two lines",
    ]
  ) {
    const output = JSON.parse(await runHook(prompt)).hookSpecificOutput;
    assertEquals(output.hookEventName, "PreToolUse", prompt);
    assertEquals(output.permissionDecision, "ask", prompt);
    assertStringIncludes(output.permissionDecisionReason, "review round");
  }
});

Deno.test("review hook: any other agent call is left alone", async () => {
  for (
    const prompt of [
      "Review a build plan before anything is built.",
      "Review the wording of the README.",
      "",
      undefined,
    ]
  ) {
    assertEquals(await runHook(prompt), "", String(prompt));
  }
});
