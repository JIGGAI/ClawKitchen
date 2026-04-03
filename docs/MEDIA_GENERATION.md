# Media Generation Setup

This guide covers how to set up image and video generation providers in ClawKitchen workflows.

## Quick Start

1. Get an API key from your chosen provider
2. Add the key to your OpenClaw config (`~/.openclaw/openclaw.json`)
3. Restart the gateway
4. The provider appears automatically in the workflow editor's media node dropdown

## Image Generation Providers

### Nano Banana (Google Gemini) — Recommended

Google's native image generation via Gemini models. Fast, high quality, competitive pricing.

**Step 1: Get a Google API Key**
1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Click "Create API Key"
3. Copy the key (starts with `AIza...`)

**Step 2: Add to OpenClaw config**

Open `~/.openclaw/openclaw.json` and add the key under `env.vars`:

```json
{
  "env": {
    "vars": {
      "GOOGLE_API_KEY": "AIza..."
    }
  }
}
```

**Step 3: Restart the gateway**

```bash
openclaw gateway restart
```

**Step 4: Select in workflow editor**

In the media-image node config, select `nano-banana-image` as the provider.

**Models available:**
- `gemini-2.5-flash-image` — Fast, efficient (default)
- `gemini-3.1-flash-image-preview` — Newer preview model
- `gemini-3-pro-image-preview` — Premium quality, better text rendering

**Optional env vars** (add to `env.vars` if needed):
- `NANO_BANANA_MODEL` — Override the default model
- `NANO_BANANA_ASPECT` — Set aspect ratio (default: `16:9`)

**Pricing:** ~$0.04 per image (Nano Banana 2), ~$0.08 per image (Nano Banana Pro)

---

### OpenAI DALL-E

OpenAI's image generation. Good quality, well-known API.

**Step 1: Get an OpenAI API Key**
1. Go to [OpenAI Platform](https://platform.openai.com/api-keys)
2. Create a new API key
3. Copy the key (starts with `sk-...`)

**Step 2: Add to OpenClaw config**

```json
{
  "env": {
    "vars": {
      "OPENAI_API_KEY": "sk-..."
    }
  }
}
```

**Step 3: Restart gateway and select `openai-image-gen` in the workflow editor**

**Model:** DALL-E 3
**Pricing:** ~$0.04 per image (standard), ~$0.08 per image (HD)

---

### CellCog

Multi-modal AI platform supporting images, video, and audio.

**Step 1: Get a CellCog API Key**
1. Go to [CellCog](https://cellcog.com) and create an account
2. Navigate to API settings
3. Copy your API key

**Step 2: Add to OpenClaw config**

```json
{
  "env": {
    "vars": {
      "CELLCOG_API_KEY": "your-key-here"
    }
  }
}
```

**Step 3: Restart gateway and select `cellcog` in the workflow editor**

**Note:** CellCog's Agent Team mode requires 500+ credits. Check your balance before using.

---

## Video Generation Providers

### Runway (Gen-4 Turbo)

High-quality AI video generation. Currently the top-ranked video model.

**Step 1: Get a Runway API Key**
1. Go to [Runway API](https://app.runwayml.com/settings/api-keys)
2. Create an API secret
3. Copy the key

**Step 2: Add to OpenClaw config**

```json
{
  "env": {
    "vars": {
      "RUNWAYML_API_SECRET": "your-secret-here"
    }
  }
}
```

**Step 3: Restart gateway and select `skill-runway-video` in the workflow editor**

**Output:** 10s clips at 1280x768 (16:9)
**How it works:** Generates a seed image via DALL-E, then animates it with Runway
**Requires:** Both `RUNWAYML_API_SECRET` and `OPENAI_API_KEY` in config
**Pricing:** ~$0.60 per 10s clip

---

### Kling (v2)

Budget-friendly AI video generation with good quality.

**Step 1: Get a Kling API Key**
1. Go to [Kling AI](https://app.klingai.com)
2. Navigate to API settings
3. Copy your API key

**Step 2: Add to OpenClaw config**

```json
{
  "env": {
    "vars": {
      "KLING_API_KEY": "your-key-here"
    }
  }
}
```

**Step 3: Restart gateway and select `skill-kling-video` in the workflow editor**

**Output:** 5s clips at 16:9
**Pricing:** ~$0.07 per 5s clip

---

### Luma (Ray 2)

High-quality video generation from Luma AI.

**Step 1: Get a Luma API Key**
1. Go to [Luma AI](https://lumalabs.ai/)
2. Create an account and navigate to API settings
3. Copy your API key

**Step 2: Add to OpenClaw config**

```json
{
  "env": {
    "vars": {
      "LUMAAI_API_KEY": "your-key-here"
    }
  }
}
```

**Step 3: Restart gateway and select `skill-luma-video` in the workflow editor**

**Output:** 5s clips at 720p
**Pricing:** ~$0.32 per 5s clip

---

### CellCog Video

CellCog also supports video generation via its Agent Team mode.

Same setup as CellCog image generation above. Select `cellcog` as provider in a `media-video` node.

**Requires:** 500+ CellCog credits per generation.

---

## Adding API Keys — Full Example

Here's what a complete `env.vars` section looks like with multiple providers configured:

```json
{
  "env": {
    "vars": {
      "GOOGLE_API_KEY": "AIza...",
      "OPENAI_API_KEY": "sk-...",
      "RUNWAYML_API_SECRET": "runway-secret-here",
      "KLING_API_KEY": "kling-key-here",
      "LUMAAI_API_KEY": "luma-key-here",
      "CELLCOG_API_KEY": "cellcog-key-here"
    }
  }
}
```

You only need keys for the providers you plan to use. After adding keys:

1. **Restart the gateway:** `openclaw gateway restart`
2. **Refresh ClawKitchen** in your browser (Ctrl+Shift+R)
3. Providers with valid keys will appear in the media node dropdown

## How Provider Auto-Discovery Works

ClawKitchen scans skill directories for generation scripts:

- `generate_image.py` / `generate_image.sh` → appears in media-image nodes
- `generate_video.py` / `generate_video.sh` → appears in media-video nodes
- `generate_audio.py` / `generate_audio.sh` → appears in media-audio nodes

It also reads each skill's `SKILL.md` for required env vars (like `GOOGLE_API_KEY`, `OPENAI_API_KEY`, etc.) and checks if they're configured. Only providers with valid API keys show up in the dropdown.

**Skill directories scanned:**
- `~/.openclaw/skills/` — system skills
- `~/.openclaw/workspace/skills/` — workspace skills

## Using Media Nodes in Workflows

### Adding a media-image node

1. Open the workflow editor
2. Add a new node → select **media-image**
3. Choose your provider from the dropdown
4. Write your prompt (or use `{{variables}}` from upstream nodes)
5. Connect it to upstream/downstream nodes

### Template variables

Use `{{}}` to pull data from upstream nodes into your prompt:

```
Create a marketing image for: {{draft_assets.image_brief}}
```

The `{{}}` button in the prompt field shows available variables from connected upstream nodes.

### skipRefinement

By default, media nodes pass your prompt through an LLM refinement step before sending to the provider. If your prompt is already well-crafted (e.g., from a dedicated LLM node), add `"skipRefinement": true` to the node config to send it directly.

## Troubleshooting

**Provider not showing in dropdown:**
- Verify the API key is in `~/.openclaw/openclaw.json` under `env.vars`
- Restart the gateway after adding keys
- Hard-refresh ClawKitchen (Ctrl+Shift+R)
- Check that the skill directory exists and contains a `generate_image.py` or `generate_video.py`

**Generation fails with authentication error:**
- Double-check the API key value — no extra spaces or `=` characters
- Verify the key is active and has billing enabled on the provider's dashboard

**Generation times out:**
- Video generation can take 1-5 minutes depending on provider
- Increase the node timeout in config (default is 300s for images, 600s for video)

**Poor quality output:**
- Use the `outputFields` system to have an LLM craft a detailed brief first
- Connect a dedicated prompt-writing LLM node upstream of the media node
- Add a creative brief to your team's memory files (auto-injected into LLM prompts)

## Adding Custom Providers

To add your own media generation provider:

1. Create a skill directory: `~/.openclaw/workspace/skills/my-provider/`
2. Add a `_meta.json`: `{"name": "my-provider", "version": "1.0.0"}`
3. Add a `SKILL.md` documenting required env vars
4. Add `generate_image.py` (or `generate_video.py` / `generate_audio.py`)

Your script must:
- Accept a prompt via stdin or command-line args
- Output `MEDIA:/path/to/generated/file` to stdout
- Use `MEDIA_OUTPUT_DIR` env var for output location (if set)
- Exit 0 on success, non-zero on failure
