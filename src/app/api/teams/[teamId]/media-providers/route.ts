import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

export interface MediaProvider {
  id: string;
  name: string;
  supportedTypes: ('image' | 'video')[];
  available: boolean;
  models?: string[];
  error?: string;
  priority?: number;
}

/**
 * GET /api/teams/[teamId]/media-providers
 * 
 * Detects available media generation providers by:
 * 1. Checking for API keys (OPENAI_API_KEY, etc.)
 * 2. Scanning installed skills for media generation capabilities
 * 3. Testing local endpoints (Stable Diffusion, ComfyUI, etc.)
 * 4. Returning prioritized list of providers
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
): Promise<NextResponse<MediaProvider[] | { error: string }>> {
  try {
    await params; // Await the params (required by Next.js 15+)
    const providers: MediaProvider[] = [];

    // 1. Check OpenAI Provider
    const openaiProvider = await checkOpenAIProvider();
    if (openaiProvider) providers.push(openaiProvider);

    // 2. Check Skill-based Providers
    const skillProviders = await checkSkillProviders();
    providers.push(...skillProviders);

    // 3. Check HTTP/Local Providers
    const httpProviders = await checkHTTPProviders();
    providers.push(...httpProviders);

    // Sort by priority (available providers first, then by priority score)
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

async function checkOpenAIProvider(): Promise<MediaProvider | null> {
  try {
    // Check for OpenAI API key
    const hasApiKey = !!process.env.OPENAI_API_KEY;
    
    if (!hasApiKey) {
      return {
        id: 'openai',
        name: 'OpenAI DALL-E',
        supportedTypes: ['image'],
        available: false,
        error: 'OPENAI_API_KEY not configured',
        priority: 100
      };
    }

    // Test API availability by running a quick provider check
    try {
      await execAsync('openclaw recipes media providers openai --check', { 
        timeout: 5000,
        env: { ...process.env }
      });
      
      return {
        id: 'openai',
        name: 'OpenAI DALL-E',
        supportedTypes: ['image'],
        available: true,
        models: ['dall-e-2', 'dall-e-3'],
        priority: 100
      };
    } catch {
      return {
        id: 'openai',
        name: 'OpenAI DALL-E',
        supportedTypes: ['image'],
        available: false,
        error: 'API key invalid or quota exceeded',
        priority: 100
      };
    }
  } catch {
    return null;
  }
}

async function checkSkillProviders(): Promise<MediaProvider[]> {
  const providers: MediaProvider[] = [];
  
  try {
    // Scan skills directory for image generation capabilities
    const skillsDir = path.join(process.env.HOME || '/home/control', '.openclaw/workspace/skills');
    
    try {
      const skillDirs = await fs.readdir(skillsDir);
      
      for (const skillDir of skillDirs) {
        try {
          const skillPath = path.join(skillsDir, skillDir);
          const skillMd = await fs.readFile(path.join(skillPath, 'SKILL.md'), 'utf-8');
          
          // Check if skill mentions image/media generation capabilities
          const hasImageGen = /\b(image|picture|photo|visual|media)\b.*\b(generat|creat|make|produc)\b/i.test(skillMd) ||
                             /\b(generat|creat|make|produc)\b.*\b(image|picture|photo|visual|media)\b/i.test(skillMd);
          
          if (hasImageGen) {
            providers.push({
              id: `skill-${skillDir}`,
              name: `Skill: ${skillDir.replace(/-/g, ' ')}`,
              supportedTypes: ['image'],
              available: true,
              priority: 80
            });
          }
        } catch {
          // Skip invalid skills
        }
      }
    } catch {
      // Skills directory doesn't exist or is inaccessible
    }
    
    // Add fallback skill provider entry
    if (providers.length === 0) {
      providers.push({
        id: 'skill',
        name: 'OpenClaw Skills',
        supportedTypes: ['image'],
        available: false,
        error: 'No image generation skills found',
        priority: 80
      });
    }
  } catch {
    // Skill detection failed
  }
  
  return providers;
}

async function checkHTTPProviders(): Promise<MediaProvider[]> {
  const providers: MediaProvider[] = [];
  
  // Check common local endpoints
  const endpoints = [
    { 
      url: 'http://localhost:7860',
      name: 'Stable Diffusion WebUI',
      priority: 90
    },
    { 
      url: 'http://localhost:8188', 
      name: 'ComfyUI',
      priority: 85
    }
  ];
  
  for (const endpoint of endpoints) {
    try {
      // Quick health check with timeout
      const response = await fetch(`${endpoint.url}/`, { 
        method: 'HEAD',
        signal: AbortSignal.timeout(2000)
      });
      
      providers.push({
        id: `http-${endpoint.url.replace(/[^\w]/g, '-')}`,
        name: endpoint.name,
        supportedTypes: ['image'],
        available: response.ok,
        priority: endpoint.priority
      });
    } catch {
      providers.push({
        id: `http-${endpoint.url.replace(/[^\w]/g, '-')}`,
        name: endpoint.name,
        supportedTypes: ['image'],
        available: false,
        error: `${endpoint.name} not running`,
        priority: endpoint.priority
      });
    }
  }
  
  return providers;
}