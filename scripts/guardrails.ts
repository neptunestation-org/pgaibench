// Pure logic behind the repo's guardrails (scripts/check.ts and
// scripts/check-commit-msg.ts). The typecheck and the test suite are not
// clean on main, so each is compared with a committed baseline of known
// failures in scripts/baselines/: only a new failure fails the check.

/**
 * tsc errors as "file TSxxxx message", without line and column, so edits elsewhere in a file do not churn the baseline.
 * Absolute paths under root become relative, so the baseline matches on every checkout.
 */
export function parseTypeErrors(output: string, root = ""): string[] {
  const out: string[] = [];
  const text = root === "" ? output : output.split(`${root.replace(/\/$/, "")}/`).join("");
  for (const line of text.split("\n")) {
    const m = /^(.+?)\(\d+,\d+\): error (TS\d+): (.*)$/.exec(line);
    if (m) out.push(`${m[1]} ${m[2]} ${m[3]}`);
  }
  return out;
}

/**
 * bun test failures as "test-file test name", without timing. Unhandled errors count as failures of their file.
 * Outside an AI agent, bun repeats every failure after an "N tests failed:" line; parsing stops there.
 */
export function parseTestFailures(output: string): string[] {
  const out: string[] = [];
  let file = "";
  for (const line of output.split("\n")) {
    const header = /^(?:::group::)?(\S.*\.test\.tsx?):$/.exec(line);
    if (/^\d+ tests? failed:$/.test(line)) break;
    if (header) file = header[1];
    else if (line.startsWith("(fail) ")) out.push(`${file} ${line.slice(7).replace(/ \[[\d.]+m?s\]$/, "")}`);
    else if (line.includes("Unhandled error between tests")) out.push(`${file} <unhandled error>`);
  }
  return out;
}

/** Compares two lists as multisets: a second copy of a known entry is new. */
export function compareBaseline(baseline: readonly string[], current: readonly string[]): { added: string[]; removed: string[] } {
  const counts = new Map<string, number>();
  for (const e of baseline) counts.set(e, (counts.get(e) ?? 0) + 1);
  const added: string[] = [];
  for (const e of current) {
    const n = counts.get(e) ?? 0;
    if (n > 0) counts.set(e, n - 1);
    else added.push(e);
  }
  const removed = [...counts].flatMap(([e, n]) => Array<string>(n).fill(e));
  return { added: added.sort(), removed: removed.sort() };
}

export const MAX_SUBJECT = 72;

// Characters shown as emoji by default, and any character followed by the emoji variation selector.
const EMOJI = /\p{Emoji_Presentation}|\p{Extended_Pictographic}️/u;

/** CLAUDE.md's commit message rules. Returns one problem per broken rule. */
export function checkCommitMessage(message: string): string[] {
  const lines = message.split("\n").filter((l) => !l.startsWith("#"));
  const subject = lines.find((l) => l.trim() !== "") ?? "";
  const problems: string[] = [];
  if (subject.trim() === "" || subject !== lines[0]) problems.push("The subject line is empty.");
  else if ([...subject].length > MAX_SUBJECT) {
    problems.push(`The subject is ${[...subject].length} characters; the limit is ${MAX_SUBJECT}.`);
  }
  if (EMOJI.test(lines.join("\n"))) problems.push("The message contains an emoji.");
  return problems;
}
