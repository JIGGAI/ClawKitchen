import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

import { getTeamWorkspaceDir } from "@/lib/paths";
import { listAllWorkflowRuns } from "@/lib/workflows/runs-storage";

export type WorkflowDeliverable = {
  runId: string;
  workflowId: string;
  fileName: string;
  relativePath: string;
  absolutePath: string;
  size: number;
  mtime: string;
  isText: boolean;
  contentPreview?: string; // For text files only
};

export type WorkflowDeliverablesResponse = {
  ok: true;
  teamId: string;
  deliverables: WorkflowDeliverable[];
};

async function getFileContentPreview(filePath: string, maxBytes = 1024): Promise<string | undefined> {
  try {
    const buffer = Buffer.alloc(maxBytes);
    const fd = await fs.open(filePath, "r");
    const { bytesRead } = await fd.read(buffer, 0, maxBytes, 0);
    await fd.close();
    
    // Check if it's likely text
    const content = buffer.subarray(0, bytesRead).toString("utf8");
    // Basic heuristic: if it contains null bytes or has too many non-printable chars, it's binary
    if (content.includes("\0") || content.split("").filter(c => c.charCodeAt(0) < 32 && c !== "\n" && c !== "\r" && c !== "\t").length > bytesRead * 0.1) {
      return undefined;
    }
    
    return content;
  } catch {
    return undefined;
  }
}

function isTextFile(fileName: string): boolean {
  const textExtensions = [
    ".md", ".txt", ".json", ".xml", ".html", ".css", ".js", ".ts", 
    ".tsx", ".jsx", ".py", ".yml", ".yaml", ".toml", ".ini", ".cfg"
  ];
  const ext = path.extname(fileName.toLowerCase());
  return textExtensions.includes(ext);
}

async function scanRunDeliverables(
  teamId: string, 
  runId: string, 
  workflowId: string
): Promise<WorkflowDeliverable[]> {
  const teamDir = await getTeamWorkspaceDir(teamId);
  const runDir = path.join(teamDir, "shared-context", "workflow-runs", runId);
  
  const deliverables: WorkflowDeliverable[] = [];
  
  try {
    // Check if run directory exists
    const stat = await fs.stat(runDir);
    if (!stat.isDirectory()) return [];

    // Recursively scan for files (excluding run.json and node-outputs/)
    async function scanDirectory(dir: string, relativeBase = ""): Promise<void> {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.join(relativeBase, entry.name);
        
        if (entry.isDirectory()) {
          // Skip node-outputs directory as it contains internal node results
          if (entry.name === "node-outputs") continue;
          await scanDirectory(fullPath, relativePath);
        } else if (entry.isFile()) {
          // Skip the main run.json file as it's internal
          if (entry.name === "run.json" && relativeBase === "") continue;
          
          try {
            const fileStat = await fs.stat(fullPath);
            const isText = isTextFile(entry.name);
            const contentPreview = isText ? await getFileContentPreview(fullPath) : undefined;
            
            deliverables.push({
              runId,
              workflowId,
              fileName: entry.name,
              relativePath,
              absolutePath: fullPath,
              size: fileStat.size,
              mtime: fileStat.mtime.toISOString(),
              isText,
              contentPreview,
            });
          } catch {
            // Skip files we can't read
          }
        }
      }
    }
    
    await scanDirectory(runDir);
  } catch {
    // Run directory doesn't exist or can't be read
  }
  
  return deliverables;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const teamId = url.searchParams.get("teamId")?.trim();
  
  if (!teamId) {
    return NextResponse.json({ ok: false, error: "teamId is required" }, { status: 400 });
  }
  
  try {
    // Get all workflow runs for the team
    const { runs } = await listAllWorkflowRuns(teamId);
    
    // Scan each run for deliverables
    const deliverablesNested = await Promise.all(
      runs.map(run => scanRunDeliverables(teamId, run.runId, run.workflowId))
    );
    
    const deliverables = deliverablesNested.flat();
    
    // Sort by modification time (newest first)
    deliverables.sort((a, b) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime());
    
    return NextResponse.json({
      ok: true,
      teamId,
      deliverables,
    } satisfies WorkflowDeliverablesResponse);
    
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}