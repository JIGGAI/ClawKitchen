import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { NextResponse } from "next/server";
import { getWorkspaceRecipesDir } from "@/lib/paths";
import { runOpenClaw } from "@/lib/openclaw";

function splitFrontmatter(md: string) {
  if (!md.startsWith("---\n")) throw new Error("Recipe markdown must start with YAML frontmatter (---)");
  const end = md.indexOf("\n---\n", 4);
  if (end === -1) throw new Error("Recipe frontmatter not terminated (---)");
  const yamlText = md.slice(4, end + 1);
  const rest = md.slice(end + 5);
  return { yamlText, rest };
}

function normalizeRole(role: string) {
  const r = role.trim();
  if (!r) throw new Error("role is required");
  if (!/^[a-z][a-z0-9-]{0,62}$/i.test(r)) throw new Error("role must be alphanumeric/dash");
  return r;
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    recipeId?: string;
    op?: "add" | "remove" | "addLike";
    role?: string;
    baseRole?: string;
    teamId?: string;
    name?: string;
  };

  const recipeId = String(body.recipeId ?? "").trim();
  const op = body.op;
  if (!recipeId) return NextResponse.json({ ok: false, error: "recipeId is required" }, { status: 400 });
  if (op !== "add" && op !== "remove" && op !== "addLike") {
    return NextResponse.json({ ok: false, error: "op must be add|remove|addLike" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";

  const dir = await getWorkspaceRecipesDir();
  const filePath = path.join(dir, `${recipeId}.md`);

  const md = await fs.readFile(filePath, "utf8");
  const { yamlText, rest } = splitFrontmatter(md);
  const fm = (YAML.parse(yamlText) ?? {}) as Record<string, unknown>;

  const kind = String(fm.kind ?? "");
  if (kind && kind !== "team") {
    return NextResponse.json({ ok: false, error: `recipe kind must be team (got ${kind})` }, { status: 400 });
  }

  const agentsRaw = fm.agents;
  const agents: Array<Record<string, unknown>> = Array.isArray(agentsRaw)
    ? (agentsRaw as Array<Record<string, unknown>>)
    : [];

  let nextAgents = agents.slice();

  if (op === "remove") {
    const role = normalizeRole(String(body.role ?? ""));
    nextAgents = nextAgents.filter((a) => String(a.role ?? "") !== role);
  } else if (op === "add") {
    const role = normalizeRole(String(body.role ?? ""));
    // add or update by role
    const next = {
      ...agents.find((a) => String(a.role ?? "") === role),
      role,
      ...(name ? { name } : {}),
    };
    const idx = nextAgents.findIndex((a) => String(a.role ?? "") === role);
    if (idx === -1) nextAgents.push(next);
    else nextAgents[idx] = next;
  } else {
    // addLike: create a *new* role entry based on an existing role's capabilities.
    const baseRole = normalizeRole(String(body.baseRole ?? ""));
    const base = agents.find((a) => String(a.role ?? "") === baseRole);
    if (!base) {
      return NextResponse.json({ ok: false, error: `baseRole not found in recipe: ${baseRole}` }, { status: 400 });
    }

    const usedRoles = new Set(nextAgents.map((a) => String(a.role ?? "").trim()).filter(Boolean));

    // Find next suffix: baseRole, baseRole-2, baseRole-3, ...
    let n = 1;
    for (const r of usedRoles) {
      if (r === baseRole) n = Math.max(n, 1);
      const m = r.match(new RegExp(`^${baseRole.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}-([0-9]+)$`));
      if (m) {
        const k = Number(m[1]);
        if (Number.isFinite(k)) n = Math.max(n, k);
      }
    }

    const teamId = String(body.teamId ?? "").trim();
    let existingAgentIds = new Set<string>();
    if (teamId) {
      try {
        const res = await runOpenClaw(["agents", "list", "--json"]);
        if (res.ok) {
          const items = JSON.parse(res.stdout) as Array<{ id?: unknown }>;
          existingAgentIds = new Set(items.map((a) => String(a.id ?? "").trim()).filter(Boolean));
        }
      } catch {
        // ignore
      }
    }

    function isTaken(role: string) {
      if (usedRoles.has(role)) return true;
      if (teamId) {
        const agentId = `${teamId}-${role}`;
        if (existingAgentIds.has(agentId)) return true;
      }
      return false;
    }

    let nextRole = baseRole;
    if (isTaken(nextRole)) {
      let i = Math.max(2, n + 1);
      while (isTaken(`${baseRole}-${i}`)) i++;
      nextRole = `${baseRole}-${i}`;
    }

    const baseName = typeof (base as { name?: unknown }).name === "string" ? String((base as { name?: unknown }).name) : "";
    const autoSuffix = nextRole === baseRole ? "" : String(nextRole.slice(baseRole.length + 1));
    const nextName = name || (baseName ? `${baseName}${autoSuffix ? ` ${autoSuffix}` : ""}` : "");

    const clone = { ...base, role: nextRole, ...(nextName ? { name: nextName } : {}) };
    nextAgents.push(clone);
  }

  // Keep stable order by role.
  nextAgents.sort((a, b) => String(a.role ?? "").localeCompare(String(b.role ?? "")));

  const nextFm = { ...fm, agents: nextAgents };
  const nextYaml = YAML.stringify(nextFm).trimEnd();
  const nextMd = `---\n${nextYaml}\n---\n${rest}`;

  await fs.writeFile(filePath, nextMd, "utf8");

  return NextResponse.json({ ok: true, recipeId, filePath, agents: nextAgents, content: nextMd });
}
