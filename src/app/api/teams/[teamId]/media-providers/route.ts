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
    const openaiProviders = await checkOpenAIProvider();
    providers.push(...openaiProviders);

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

async function checkOpenAIProvider(): Promise<MediaProvider[]> {
  const providers: MediaProvider[] = [];
  
  try {
    // Read OpenClaw config to get models
    const configPath = path.join(process.env.HOME || '/home/control', '.openclaw', 'openclaw.json');
    const configData = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(configData);
    
    // Extract models from config
    const fallbackModels = config.agents?.defaults?.model?.fallbacks || [];
    const primaryModel = config.agents?.defaults?.model?.primary;
    const allModels = [primaryModel, ...fallbackModels].filter(Boolean);
    
    // Group models by provider
    const modelsByProvider: Record<string, string[]> = {};
    allModels.forEach((model: string) => {
      if (typeof model === 'string' && model.includes('/')) {
        const [provider, modelName] = model.split('/');
        if (!modelsByProvider[provider]) {
          modelsByProvider[provider] = [];
        }
        modelsByProvider[provider].push(modelName);
      }
    });
    
    // Check OpenAI models (supports image generation)
    if (modelsByProvider['openai'] || modelsByProvider['openai-codex']) {
      const openaiModels = [...(modelsByProvider['openai'] || []), ...(modelsByProvider['openai-codex'] || [])];
      const hasApiKey = !!process.env.OPENAI_API_KEY;
      
      providers.push({
        id: 'openai-models',
        name: 'OpenAI Models (Image Generation)',
        supportedTypes: ['image'],
        available: hasApiKey,
        models: openaiModels,
        error: hasApiKey ? undefined : 'OPENAI_API_KEY not configured',
        priority: 100
      });
    }
    
    // Check for DALL-E specifically
    const hasApiKey = !!process.env.OPENAI_API_KEY;
    providers.push({
      id: 'dalle',
      name: 'OpenAI DALL-E',
      supportedTypes: ['image'],
      available: hasApiKey,
      models: ['dall-e-2', 'dall-e-3'],
      error: hasApiKey ? undefined : 'OPENAI_API_KEY not configured',
      priority: 90
    });
    
  } catch (error) {
    console.warn('Failed to read OpenClaw config:', error);
    
    // Fallback OpenAI provider
    const hasApiKey = !!process.env.OPENAI_API_KEY;
    providers.push({
      id: 'openai-fallback',
      name: 'OpenAI DALL-E (fallback)',
      supportedTypes: ['image'],
      available: hasApiKey,
      models: ['dall-e-3'],
      error: hasApiKey ? undefined : 'OPENAI_API_KEY not configured',
      priority: 80
    });
  }
  
  return providers;
}

async function checkSkillProviders(): Promise<MediaProvider[]> {
  const providers: MediaProvider[] = [];
  
  try {
    // Scan multiple skills directories
    const skillsDirs = [
      path.join(process.env.HOME || '/home/control', '.openclaw/workspace/skills'),
      path.join(process.env.HOME || '/home/control', '.openclaw/skills')
    ];
    
    const allSkills: { name: string; description: string; hasMedia: boolean; supportedTypes: string[]; available: boolean; error?: string }[] = [];
    
    for (const skillsDir of skillsDirs) {
      try {
        const skillDirs = await fs.readdir(skillsDir);
        
        for (const skillDir of skillDirs) {
          try {
            const skillPath = path.join(skillsDir, skillDir);
            const skillMd = await fs.readFile(path.join(skillPath, 'SKILL.md'), 'utf-8');
            
            // Extract skill name and description
            let skillName = skillDir.replace(/-/g, ' ');
            let description = '';
            
            // Parse frontmatter or description
            const nameMatch = skillMd.match(/^name:\s*(.+)$/m);
            if (nameMatch) skillName = nameMatch[1];
            
            const descMatch = skillMd.match(/^description:\s*(.+)$/m);
            if (descMatch) description = descMatch[1].replace(/"/g, '');
            
            // Check for media generation capabilities
            // Also check if skill has generate_video.py or generate_image.py scripts
            let hasMediaScript = false;
            try {
              const scriptFiles = await fs.readdir(path.join(skillPath, 'scripts'));
              hasMediaScript = scriptFiles.some(f => /^generate_(video|image|audio)\./i.test(f));
            } catch { /* no scripts dir */ }
            if (!hasMediaScript) {
              try {
                const topFiles = await fs.readdir(skillPath);
                hasMediaScript = topFiles.some(f => /^generate_(video|image|audio)\./i.test(f));
              } catch { /* ignore */ }
            }
            
            const hasImageGen = hasMediaScript ||
                               /\b(image|picture|photo|visual|media|video|audio)s?\b.*\b(generat|creat|make|produc)/i.test(skillMd) ||
                               /\b(generat|creat|make|produc)\w*.*\b(image|picture|photo|visual|media|video|audio)/i.test(skillMd) ||
                               /dall.?e|stable.?diffusion|midjourney|cellcog|any.?to.?any|runway|kling|luma/i.test(skillMd);
            
            if (hasImageGen) {
              const supportedTypes: string[] = [];
              if (/\b(image|picture|photo|visual)\b/i.test(skillMd)) supportedTypes.push('image');
              if (/\bvideo\b/i.test(skillMd)) supportedTypes.push('video');
              if (/\baudio\b/i.test(skillMd)) supportedTypes.push('audio');
              if (supportedTypes.length === 0) supportedTypes.push('image'); // default
              
              // Check for API key requirements (auto-detect any *_API_KEY or *_API_SECRET mentions)
              let available = true;
              let error: string | undefined;
              
              const envVarPattern = /\b([A-Z][A-Z0-9_]*(?:_API_KEY|_API_SECRET|_SECRET))\b/g;
              let envMatch;
              while ((envMatch = envVarPattern.exec(skillMd)) !== null) {
                const envVar = envMatch[1];
                if (!process.env[envVar]) {
                  available = false;
                  error = `${envVar} required`;
                  break;
                }
              }
              
              allSkills.push({
                name: skillName,
                description: description || `${skillName} skill`,
                hasMedia: true,
                supportedTypes,
                available,
                error
              });
            }
          } catch {
            // Skip invalid skills
          }
        }
      } catch {
        // Skills directory doesn't exist or is inaccessible
      }
    }
    
    // Create providers from detected skills
    allSkills.forEach((skill, index) => {
      providers.push({
        id: `skill-${skill.name.toLowerCase().replace(/\s+/g, '-')}`,
        name: skill.name,
        supportedTypes: skill.supportedTypes as ('image' | 'video')[],
        available: skill.available,
        error: skill.error,
        priority: 70 + index // Give different priorities to different skills
      });
    });
    
    // Add fallback skill provider entry if no skills found
    if (providers.length === 0) {
      providers.push({
        id: 'skills-empty',
        name: 'OpenClaw Skills',
        supportedTypes: ['image'],
        available: false,
        error: 'No media generation skills installed',
        priority: 60
      });
    }
    
  } catch (error) {
    console.warn('Skill detection failed:', error);
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