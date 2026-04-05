# Media Generation Setup

This guide covers how to set up image and video generation providers in ClawKitchen workflows, and how to create your own media drivers.

## Quick Start

1. Get an API key from your chosen provider
2. Add the key to `~/.openclaw/openclaw.json` under `env.vars`
3. Restart the gateway: `openclaw gateway restart`
4. The provider appears automatically in the workflow editor's media node dropdown

---

## Architecture

Media generation uses a **driver architecture** in ClawRecipes. ClawKitchen gets its provider list by calling:

```
openclaw recipes workflows media-drivers
```

This returns every registered driver with availability status. **One source of truth** — add a driver in ClawRecipes, and it shows up in the Kitchen dropdown automatically.

```
┌─────────────────────────────────────────────────────┐
│  ClawKitchen (UI)                                   │
│  GET /api/teams/:id/media-providers                 │
│       │                                             │
│       ├─ CLI call → ClawRecipes driver registry     │
│       ├─ Auto-discover unknown skills (fallback)    │
│       └─ HTTP probes (Stable Diffusion, ComfyUI)    │
└─────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│  ClawRecipes (Runtime)                              │
│  media-drivers/registry.ts                          │
│       │                                             │
│       ├─ NanoBananaPro   (GEMINI_API_KEY)           │
│       ├─ OpenAIImageGen  (OPENAI_API_KEY)           │
│       ├─ RunwayVideo     (RUNWAYML_API_SECRET)      │
│       ├─ KlingVideo      (KLING_API_KEY)            │
│       ├─ LumaVideo       (LUMAAI_API_KEY)           │
│       └─ GenericDriver   (auto-discover fallback)   │
└─────────────────────────────────────────────────────┘
```

---

## Image Providers

### Nano Banana Pro (Google Gemini) — Recommended

Google's native image generation via Gemini models. Fast, high quality, competitive pricing.

**Setup:**
1. Get a key at [Google AI Studio](https://aistudio.google.com/apikey)
2. Install the skill: `clawhub install nano-banana-pro`
3. Add to config:
   ```json
   { "env": { "vars": { "GEMINI_API_KEY": "AIza..." } } }
   ```
4. `openclaw gateway restart`

**Models:** `gemini-2.5-flash-image` (default), `gemini-3.1-flash-image-preview`, `gemini-3-pro-image-preview`
**Pricing:** ~$0.04–$0.08 per image

### OpenAI DALL-E

**Setup:**
1. Get a key at [OpenAI Platform](https://platform.openai.com/api-keys)
2. Add to config:
   ```json
   { "env": { "vars": { "OPENAI_API_KEY": "sk-..." } } }
   ```
3. `openclaw gateway restart`

**Model:** DALL-E 3
**Pricing:** ~$0.04 (standard), ~$0.08 (HD)

### CellCog

Multi-modal AI platform. Requires 500+ credits for Agent Team mode.

**Setup:**
1. Get a key at [CellCog](https://cellcog.com)
2. Add: `"CELLCOG_API_KEY": "your-key"`
3. `openclaw gateway restart`

---

## Video Providers

### Runway (Gen-4 Turbo) — Top Quality

**Setup:**
1. Get a key at [Runway API](https://app.runwayml.com/settings/api-keys)
2. Add:
   ```json
   { "env": { "vars": { "RUNWAYML_API_SECRET": "your-secret" } } }
   ```
3. `openclaw gateway restart`

**How it works:** Generates a seed image via DALL-E, then animates with Runway. Requires both `RUNWAYML_API_SECRET` and `OPENAI_API_KEY`.
**Output:** 10s clips at 1280x768
**Pricing:** ~$0.60 per 10s clip

### Kling (v2) — Budget-Friendly

**Setup:**
1. Get a key at [Kling AI](https://app.klingai.com)
2. Add: `"KLING_API_KEY": "your-key"`
3. `openclaw gateway restart`

**Output:** 5s clips at 16:9
**Pricing:** ~$0.07 per 5s clip

### Luma (Ray 2)

**Setup:**
1. Get a key at [Luma AI](https://lumalabs.ai/)
2. Add: `"LUMAAI_API_KEY": "your-key"`
3. `openclaw gateway restart`

**Output:** 5s clips at 720p
**Pricing:** ~$0.32 per 5s clip

---

## Full Config Example

```json
{
  "env": {
    "vars": {
      "GEMINI_API_KEY": "AIza...",
      "OPENAI_API_KEY": "sk-...",
      "RUNWAYML_API_SECRET": "runway-secret",
      "KLING_API_KEY": "kling-key",
      "LUMAAI_API_KEY": "luma-key"
    }
  }
}
```

Only add keys for providers you use. After adding: restart gateway, hard-refresh ClawKitchen.

---

## Using Media Nodes in Workflows

### Adding a media node

1. Open the workflow editor
2. Add a node → select **media-image** or **media-video**
3. Pick a provider from the dropdown
4. Write a prompt or use `{{variables}}` from upstream nodes
5. Connect to upstream/downstream nodes

### Template variables

Use the `{{}}` button to insert variables from upstream nodes:

```
Create a marketing image for: {{draft_assets.image_brief}}
```

### skipRefinement

By default, media nodes pass prompts through an LLM refinement step. If your prompt is already detailed (e.g., from a dedicated brief-writing node), add `"skipRefinement": true` to the node config to skip this and send directly to the provider.

---

## Creating Custom Media Drivers

There are two ways to add media generation providers:

### Option 1: Quick — Skill Script (no code changes)

Create a skill with a generation script. ClawKitchen auto-discovers it.

```
~/.openclaw/workspace/skills/my-provider/
├── _meta.json
├── SKILL.md
├── generate_image.py      # or generate_video.py / generate_audio.py
└── .venv/                  # Python venv with dependencies
```

**`_meta.json`:**
```json
{
  "name": "my-provider",
  "version": "1.0.0",
  "description": "My custom image generator"
}
```

**`SKILL.md`** — document required env vars:
```markdown
# My Provider

## Requirements
- `MY_PROVIDER_API_KEY` — API key from my-provider.com
```

**`generate_image.py`** — the generation script:
```python
#!/usr/bin/env python3
"""Media generation script for my-provider."""
import os
import sys

def main():
    # Read prompt from stdin
    prompt = sys.stdin.read().strip()
    if not prompt:
        print("No prompt provided", file=sys.stderr)
        sys.exit(1)

    # Get API key from environment
    api_key = os.environ.get("MY_PROVIDER_API_KEY")
    if not api_key:
        print("MY_PROVIDER_API_KEY not set", file=sys.stderr)
        sys.exit(1)

    # Get output directory (set by workflow worker)
    output_dir = os.environ.get("MEDIA_OUTPUT_DIR", os.getcwd())
    output_path = os.path.join(output_dir, "output.png")

    # --- Your generation logic here ---
    # Call your API, download the image, save to output_path
    # ...

    # Print the MEDIA: path — this is how the worker finds the file
    print(f"MEDIA:{output_path}")

if __name__ == "__main__":
    main()
```

**Script contract:**
| Aspect | Requirement |
|--------|-------------|
| **Input** | Prompt via stdin (default) or `--prompt` arg |
| **Output** | Print `MEDIA:/path/to/file` to stdout |
| **Env vars** | `MEDIA_OUTPUT_DIR` for output location |
| **Exit code** | 0 = success, non-zero = failure |
| **Errors** | Print diagnostics to stderr |

**Set up the venv:**
```bash
cd ~/.openclaw/workspace/skills/my-provider
uv venv
uv pip install your-sdk-package
chmod +x generate_image.py
```

**Update the shebang** to use the venv Python:
```python
#!/path/to/skill/.venv/bin/python
```

Or keep `#!/usr/bin/env python3` — the worker auto-detects `.venv/bin/python` next to the script.

After creating, restart the gateway and refresh ClawKitchen — the provider appears in the dropdown automatically via auto-discovery.

---

### Option 2: Full — Registered Driver (best UX)

For tighter integration — custom display names, explicit env-var validation, argparse support — register a driver in ClawRecipes.

**Step 1: Create the driver file**

```
ClawRecipes/src/lib/workflows/media-drivers/my-provider.driver.ts
```

```typescript
import * as path from 'path';
import { MediaDriver, MediaDriverInvokeOpts, MediaDriverResult } from './types';
import { findSkillDir, findVenvPython, runScript, parseMediaOutput } from './utils';

export class MyProvider implements MediaDriver {
  slug = 'my-provider';
  mediaType = 'image' as const;                // 'image' | 'video' | 'audio'
  displayName = 'My Provider (Custom)';
  requiredEnvVars = ['MY_PROVIDER_API_KEY'];    // checked for dropdown availability

  async invoke(opts: MediaDriverInvokeOpts): Promise<MediaDriverResult> {
    const { prompt, outputDir, env, timeout } = opts;

    const skillDir = await findSkillDir(this.slug);
    if (!skillDir) throw new Error(`Skill dir not found for ${this.slug}`);

    const scriptPath = path.join(skillDir, 'generate_image.py');
    const runner = await findVenvPython(skillDir);

    const scriptOutput = runScript({
      runner,
      script: scriptPath,
      stdin: prompt,          // or use args: ['--prompt', prompt]
      env: { ...env, HOME: process.env.HOME || '/home/control' },
      cwd: outputDir,
      timeout,
    });

    const filePath = parseMediaOutput(scriptOutput);
    if (!filePath) throw new Error(`No MEDIA: path in output: ${scriptOutput}`);

    return { filePath, metadata: { skill: this.slug, prompt } };
  }
}
```

**Step 2: Register in `registry.ts`**

```typescript
import { MyProvider } from './my-provider.driver';

const knownDrivers: MediaDriver[] = [
  new NanoBananaPro(),
  new OpenAIImageGen(),
  // ...existing drivers...
  new MyProvider(),   // ← add here
];
```

That's it. The `workflows media-drivers` CLI command and ClawKitchen's provider dropdown will include your driver automatically.

**Step 3 (optional): Add the env key**

```json
{ "env": { "vars": { "MY_PROVIDER_API_KEY": "..." } } }
```

Restart gateway → provider shows as "available" in the dropdown.

---

### MediaDriver Interface Reference

```typescript
interface MediaDriver {
  slug: string;                        // Skill folder name
  mediaType: 'image' | 'video' | 'audio';
  displayName: string;                 // Shown in UI dropdown
  requiredEnvVars: string[];           // Checked for availability

  invoke(opts: MediaDriverInvokeOpts): Promise<MediaDriverResult>;
}

interface MediaDriverInvokeOpts {
  prompt: string;                      // The generation prompt
  outputDir: string;                   // Where to write output files
  env: Record<string, string>;         // Merged env vars
  timeout: number;                     // Max execution time (ms)
  config?: Record<string, unknown>;    // Node-level config overrides
}

interface MediaDriverResult {
  filePath: string;                    // Path to generated file
  metadata?: Record<string, unknown>;  // Optional debug/tracking info
}
```

### Utility Functions (from `media-drivers/utils.ts`)

| Function | Purpose |
|----------|---------|
| `findSkillDir(slug)` | Searches `~/.openclaw/skills/`, `~/.openclaw/workspace/skills/`, `~/.openclaw/workspace/` |
| `findVenvPython(skillDir)` | Returns `.venv/bin/python` path, throws if not found |
| `runScript({ runner, script, stdin?, args?, env, cwd, timeout })` | `execSync` wrapper, returns stdout |
| `parseMediaOutput(stdout)` | Extracts path after `MEDIA:` prefix |
| `loadConfigEnv()` | Reads `env.vars` from `~/.openclaw/openclaw.json` |
| `findScriptInSkill(skillDir, scriptName)` | Searches skill root + `scripts/` subdirectory |

---

## Troubleshooting

**Provider not in dropdown:**
- Verify the API key is in `~/.openclaw/openclaw.json` under `env.vars`
- Restart gateway + hard-refresh browser
- Check skill dir exists and contains `generate_image.py` or `generate_video.py`
- Run `openclaw recipes workflows media-drivers` to see what's detected

**Authentication errors:**
- Double-check key value — no extra spaces or `=` prefix
- Verify billing is enabled on the provider's dashboard

**Timeouts:**
- Video generation can take 1–5 minutes
- Increase node timeout in config (default: 300s images, 600s video)

**Poor quality:**
- Use `outputFields` to have an LLM craft a detailed brief upstream
- Add a creative brief to `shared-context/memory/` (auto-injected into LLM prompts)
- Set `"skipRefinement": true` when your brief is already detailed
