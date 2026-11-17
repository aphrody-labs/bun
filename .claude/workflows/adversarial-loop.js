export const meta = {
  name: "adversarial-loop",
  description: "Per task: 1 implementer, N adversarial reviewers that see only the diff, 1 fixer",
  whenToUse:
    "A list of independent code tasks with disjoint file scopes (failing test files, compiler errors grouped by crate, files to port). args: { tasks: [{ id, prompt }], reviewers?: 2, allowBuild?: false, rules?: string }",
  phases: [
    { title: "Implement", detail: "one implementer per task" },
    { title: "Review", detail: "adversarial reviewers, split context, diff only" },
    { title: "Fix", detail: "one fixer applies the findings that hold" },
  ],
};

const input = Array.isArray(args) ? { tasks: args } : typeof args === "string" ? { tasks: [args] } : (args ?? {});
const tasks = (input.tasks ?? []).map((t, i) => (typeof t === "string" ? { id: `task-${i + 1}`, prompt: t } : t));
if (tasks.length === 0) throw new Error("adversarial-loop: pass args.tasks = [{ id, prompt }, ...]");
const reviewerCount = input.reviewers ?? 2;

const SHARED = [
  "Other agents are editing this same checkout at the same time. Touch only the files your task needs.",
  "Git is read-only for you (diff, log, show, status, blame). Never run git stash, reset, checkout, restore, clean, add, commit or push.",
  input.allowBuild
    ? ""
    : "Never run cargo, `bun bd`, `bun run build*` or a test suite: the session that launched this workflow builds and tests once after it returns.",
  input.rules ?? "",
]
  .filter(Boolean)
  .join("\n");

const IMPLEMENTED = {
  type: "object",
  properties: {
    files: { type: "array", items: { type: "string" }, description: "Repo-relative paths you created or modified" },
    summary: { type: "string" },
  },
  required: ["files", "summary"],
};

const FINDINGS = {
  type: "object",
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          file: { type: "string" },
          line: { type: "integer" },
          problem: { type: "string" },
          failure: { type: "string", description: "Concrete input or state that produces the wrong result" },
        },
        required: ["file", "problem", "failure"],
      },
    },
  },
  required: ["findings"],
};

const FIXED = {
  type: "object",
  properties: {
    applied: { type: "array", items: { type: "string" } },
    rejected: {
      type: "array",
      items: {
        type: "object",
        properties: { problem: { type: "string" }, reason: { type: "string" } },
        required: ["problem", "reason"],
      },
    },
    files: { type: "array", items: { type: "string" } },
  },
  required: ["applied", "rejected", "files"],
};

function reviewPrompt(task, files, n) {
  return `You are adversarial reviewer ${n} of ${reviewerCount}. You did not write this change and you will not fix it. Your only job is to find bugs and reasons it does not work. Assume it is wrong.

What the change was supposed to do:
${task.prompt}

Files changed: ${files.join(", ")}
Read the change with \`git diff -- <file>\` (read a new untracked file whole), then read the code around it and its callers.

Report every concrete defect: wrong behaviour, a missed case, a regression, a function stubbed out instead of implemented, a test skipped, weakened or deleted, behaviour that differs from what was asked.
Reject on sight any long comment that justifies a workaround: if it needs a paragraph-long comment to explain why the workaround is OK, the code is wrong.
Every finding needs the file, the line and the input or state that makes it fail. No style remarks. Return an empty list only if you tried to break it and could not.

${SHARED}`;
}

const results = await pipeline(
  tasks,
  task =>
    agent(
      `${task.prompt}

Implement this and nothing else. Do not stub, do not skip or delete tests, do not leave a workaround behind a comment.
Return the repo-relative paths you created or modified.

${SHARED}`,
      { label: `implement:${task.id}`, phase: "Implement", schema: IMPLEMENTED },
    ),
  async (impl, task) => {
    if (!impl || impl.files.length === 0)
      return { task: task.id, files: [], findings: [], skipped: "no change produced" };
    const reviews = await parallel(
      Array.from(
        { length: reviewerCount },
        (_, i) => () =>
          agent(reviewPrompt(task, impl.files, i + 1), {
            label: `review:${task.id}#${i + 1}`,
            phase: "Review",
            schema: FINDINGS,
          }),
      ),
    );
    const answered = reviews.filter(Boolean);
    if (answered.length < reviewerCount)
      log(`${task.id}: ${reviewerCount - answered.length} reviewer(s) returned nothing`);
    return { task: task.id, files: impl.files, findings: answered.flatMap(r => r.findings) };
  },
  async (reviewed, task) => {
    if (reviewed.findings.length === 0) return { ...reviewed, applied: [], rejected: [] };
    const fix = await agent(
      `Reviewers reported defects in a change made for this task:
${task.prompt}

Files changed: ${reviewed.files.join(", ")}

Findings:
${JSON.stringify(reviewed.findings, null, 2)}

Check each finding against the code. Fix every one that holds, in the code itself, not with a comment. For each one you do not apply, say exactly why it is wrong.

${SHARED}`,
      { label: `fix:${task.id}`, phase: "Fix", schema: FIXED },
    );
    if (!fix) return { ...reviewed, applied: [], rejected: [], skipped: "fixer returned nothing" };
    return {
      ...reviewed,
      files: [...new Set([...reviewed.files, ...fix.files])],
      applied: fix.applied,
      rejected: fix.rejected,
    };
  },
);

const dropped = results.filter(r => !r).length;
if (dropped > 0) log(`${dropped} of ${tasks.length} task(s) failed mid-pipeline and returned nothing`);
return { tasks: results.filter(Boolean), dropped };
