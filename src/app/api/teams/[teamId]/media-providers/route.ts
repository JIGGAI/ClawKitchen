import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { runOpenClaw } from '@/lib/openclaw';

type MediaType = 'image' | 'video' | 'audio';

export interface DurationConstraints {
  minSeconds: number;
  maxSeconds: number;
  defaultSeconds: number;
  stepSeconds?: number;
}

export interface MediaProvider {
  id: string;
  name: string;
  supportedTypes: MediaType[];
  available: boolean;
  error?: string;
  priority?: number;
  durationConstraints?: DurationConstraints | null;
}

interface DriverInfo {
  slug: string;
  displayName: string;
  mediaType: MediaType;
  available: boolean;
  missingEnvVars: string[];
  durationConstraints?: DurationConstraints | null;
}

/**
 * GET /api/teams/[teamId]/media-providers
 *
 * Returns available media generation providers by:
 * 1. Calling ClawRecipes driver registry via CLI (single source of truth)
 * 2. Auto-discovering additional skills with generate_* scripts
 * 3. Checking HTTP/local endpoints (Stable Diffusion, ComfyUI)
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
): Promise<NextResponse<MediaProvider[] | { error: string }>> {
  try {
    await params;
    const providers: MediaProvider[] = [];

    // 1. Known drivers from ClawRecipes registry
    const driverProviders = await fetchDriverProviders();
    providers.push(...driverProviders);

    // 2. Auto-discover unknown skills with generate_* scripts
    const knownSlugs = new Set(driverProviders.map((p) => p.id.replace(/^skill-/, '')));
    const discovered = await discoverUnknownSkills(knownSlugs);
    providers.push(...discovered);

    // 3. HTTP/local providers (only if running)
    const httpProviders = await checkHTTPProviders();
    providers.push(...httpProviders);

    // Sort: available first, then by priority descending
    providers.sort((a, b) => {
      if (a.available && !b.available) return -1;
      if (!a.available && b.available) return 1;
      return (b.priority || 0) - (a.priority || 0);
    });

    return NextResponse.json(providers);
  } catch (error) {
    console.error('Failed to detect media providers:', error);
    return NextResponse.json(
      { error: 'Failed to detect media providers' },
      { status: 500 }
    );
  }
}

/** Call ClawRecipes to get the driver registry with availability info */
async function fetchDriverProviders(): Promise<MediaProvider[]> {
  try {
    const res = await runOpenClaw(['recipes', 'workflows', 'media-drivers']);
    if (res.exitCode !== 0) {
      console.warn('media-drivers command failed:', res.stderr);
      return [];
    }

    const drivers: DriverInfo[] = JSON.parse(res.stdout);
    const priorityBase: Record<string, number> = {
      image: 90,
      video: 80,
      audio: 70,
    };

    return drivers.map((d, i) => ({
      id: `skill-${d.slug}`,
      name: d.displayName,
      supportedTypes: [d.mediaType],
      available: d.available,
      error: d.available
        ? undefined
        : `Missing: ${d.missingEnvVars.join(', ')}`,
      priority: (priorityBase[d.mediaType] ?? 60) - i,
      durationConstraints: d.durationConstraints ?? null,
    }));
  } catch (err) {
    console.warn('Failed to fetch media drivers from ClawRecipes:', err);
    return [];
  }
}

/** Scan skill dirs for generate_* scripts not covered by known drivers */
async function discoverUnknownSkills(
  knownSlugs: Set<string>
): Promise<MediaProvider[]> {
  const homedir = process.env.HOME || '/home/control';
  const roots = [
    path.join(homedir, '.openclaw', 'skills'),
    path.join(homedir, '.openclaw', 'workspace', 'skills'),
    path.join(homedir, '.openclaw', 'workspace'),
  ];
  return collectSkillCandidates(roots, knownSlugs);
}

async function collectSkillCandidates(
  roots: string[],
  knownSlugs: Set<string>
): Promise<MediaProvider[]> {
  const providers: MediaProvider[] = [];
  const IMAGE_SCRIPTS = ['generate_image.py', 'generate_image.sh'];
  const VIDEO_SCRIPTS = ['generate_video.py', 'generate_video.sh'];
  const AUDIO_SCRIPTS = ['generate_audio.py', 'generate_audio.sh'];

  for (const root of roots) {
    const entries = await safeReaddir(root);
    for (const name of entries) {
      if (knownSlugs.has(name)) continue;
      const skillDir = path.join(root, name);
      const provider = await probeSkillDir(skillDir, name, IMAGE_SCRIPTS, VIDEO_SCRIPTS, AUDIO_SCRIPTS);
      if (provider) {
        knownSlugs.add(name);
        providers.push(provider);
      }
    }
  }
  return providers;
}

async function safeReaddir(dir: string): Promise<string[]> {
  try { return await fs.readdir(dir); } catch { return []; }
}

async function probeSkillDir(
  skillDir: string,
  name: string,
  imageScripts: string[],
  videoScripts: string[],
  audioScripts: string[]
): Promise<MediaProvider | null> {
  try {
    const stat = await fs.stat(skillDir);
    if (!stat.isDirectory()) return null;
  } catch { return null; }

  const types: MediaType[] = [];
  if (await hasAnyScript(skillDir, imageScripts)) types.push('image');
  if (await hasAnyScript(skillDir, videoScripts)) types.push('video');
  if (await hasAnyScript(skillDir, audioScripts)) types.push('audio');

  if (types.length === 0) return null;
  return {
    id: `skill-${name}`,
    name: formatSkillName(name),
    supportedTypes: types,
    available: true,
    priority: 50,
  };
}

async function hasAnyScript(skillDir: string, candidates: string[]): Promise<boolean> {
  const searchDirs = [skillDir, path.join(skillDir, 'scripts')];
  for (const dir of searchDirs) {
    for (const c of candidates) {
      try {
        await fs.access(path.join(dir, c));
        return true;
      } catch { /* not found */ }
    }
  }
  return false;
}

function formatSkillName(slug: string): string {
  return slug
    .replace(/^skill-/, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

async function checkHTTPProviders(): Promise<MediaProvider[]> {
  const providers: MediaProvider[] = [];
  const endpoints = [
    { url: 'http://localhost:7860', name: 'Stable Diffusion WebUI', priority: 40 },
    { url: 'http://localhost:8188', name: 'ComfyUI', priority: 35 },
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetch(`${ep.url}/`, {
        method: 'HEAD',
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) {
        providers.push({
          id: `http-${ep.url.replace(/[^\w]/g, '-')}`,
          name: ep.name,
          supportedTypes: ['image'],
          available: true,
          priority: ep.priority,
        });
      }
    } catch {
      // Don't add unavailable HTTP endpoints
    }
  }

  return providers;
}
