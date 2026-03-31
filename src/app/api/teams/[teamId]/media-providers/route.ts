import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export interface MediaProvider {
  id: string;
  name: string;
  description: string;
  supportedTypes: ('image' | 'video' | 'audio')[];
  available: boolean;
  skillPath?: string;
  error?: string;
}

interface SkillMeta {
  name: string;
  description: string;
  supportedTypes: ('image' | 'video' | 'audio')[];
  requiresEnv: string[];
  skillPath: string;
}

/**
 * GET /api/teams/[teamId]/media-providers
 *
 * Detects available media generation providers by scanning installed skills.
 * Only skills with media generation capabilities are returned.
 * No hardcoded providers — everything comes from installed skills.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
): Promise<NextResponse<MediaProvider[] | { error: string }>> {
  try {
    await params;
    const providers: MediaProvider[] = [];

    const skillsDirs = [
      path.join(process.env.HOME || '/home/control', '.openclaw', 'skills'),
      path.join(process.env.HOME || '/home/control', '.openclaw', 'workspace', 'skills'),
    ];

    for (const skillsDir of skillsDirs) {
      let entries: string[];
      try {
        entries = await fs.readdir(skillsDir);
      } catch {
        continue;
      }

      for (const entry of entries) {
        const skillPath = path.join(skillsDir, entry);
        const meta = await parseSkillMedia(skillPath);
        if (!meta) continue;

        // Check if required env vars are present
        const missingEnv = meta.requiresEnv.filter((e) => !process.env[e]);
        const available = missingEnv.length === 0;

        // Dedupe by skill name (first found wins)
        if (providers.some((p) => p.id === `skill-${entry}`)) continue;

        providers.push({
          id: `skill-${entry}`,
          name: meta.name,
          description: meta.description,
          supportedTypes: meta.supportedTypes,
          available,
          skillPath: meta.skillPath,
          error: available ? undefined : `Missing: ${missingEnv.join(', ')}`,
        });
      }
    }

    // Sort: available first, then alphabetical
    providers.sort((a, b) => {
      if (a.available && !b.available) return -1;
      if (!a.available && b.available) return 1;
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json(providers);
  } catch (error) {
    console.error('Failed to detect media providers:', error);
    return NextResponse.json({ error: 'Failed to detect media providers' }, { status: 500 });
  }
}

/**
 * Parse a skill directory to detect media generation capabilities.
 * Returns null if the skill doesn't support media generation.
 */
async function parseSkillMedia(skillPath: string): Promise<SkillMeta | null> {
  let skillMd: string;
  try {
    skillMd = await fs.readFile(path.join(skillPath, 'SKILL.md'), 'utf-8');
  } catch {
    return null;
  }

  // Must have media generation keywords
  const hasMediaGen =
    /\b(image|picture|photo|visual)\b.*\b(generat|creat|produc)\b/i.test(skillMd) ||
    /\b(generat|creat|produc)\b.*\b(image|picture|photo|visual)\b/i.test(skillMd) ||
    /\bvideo\b.*\b(generat|creat|produc)\b/i.test(skillMd) ||
    /\b(generat|creat|produc)\b.*\bvideo\b/i.test(skillMd) ||
    /\baudio\b.*\b(generat|creat|produc)\b/i.test(skillMd) ||
    /dall.?e|stable.?diffusion|text.?to.?image|image.?gen/i.test(skillMd) ||
    /cellcog.*any.?to.?any|any.?to.?any.*cellcog/i.test(skillMd);

  if (!hasMediaGen) return null;

  // Detect supported types
  const supportedTypes: ('image' | 'video' | 'audio')[] = [];
  if (/\b(image|picture|photo|visual|dall.?e)\b/i.test(skillMd)) supportedTypes.push('image');
  if (/\bvideo\b/i.test(skillMd)) supportedTypes.push('video');
  if (/\baudio\b/i.test(skillMd)) supportedTypes.push('audio');
  if (supportedTypes.length === 0) supportedTypes.push('image');

  // Parse name from frontmatter or directory name
  const nameMatch = skillMd.match(/^name:\s*(.+)$/m);
  const name = nameMatch ? nameMatch[1].replace(/^["']|["']$/g, '') : path.basename(skillPath);

  // Parse description
  const descMatch = skillMd.match(/^description:\s*"?(.+?)"?\s*$/m);
  const description = descMatch ? descMatch[1] : `${name} skill`;

  // Parse required env vars from frontmatter
  const requiresEnv: string[] = [];
  const envMatch = skillMd.match(/env:\s*\[([^\]]+)\]/);
  if (envMatch) {
    envMatch[1].split(',').forEach((e) => {
      const trimmed = e.trim().replace(/^["']|["']$/g, '');
      if (trimmed) requiresEnv.push(trimmed);
    });
  }
  // Also check body for explicit env var mentions
  const bodyEnvMatches = skillMd.match(/\b([A-Z][A-Z0-9_]+_(?:API_KEY|KEY|TOKEN|SECRET))\b/g);
  if (bodyEnvMatches) {
    for (const envVar of bodyEnvMatches) {
      if (!requiresEnv.includes(envVar)) requiresEnv.push(envVar);
    }
  }

  return {
    name,
    description,
    supportedTypes,
    requiresEnv,
    skillPath,
  };
}
