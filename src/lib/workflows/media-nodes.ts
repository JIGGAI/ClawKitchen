/**
 * Media Generation Node Types for ClawKitchen Workflows
 *
 * Providers are skill-driven — only installed skills with media generation
 * capabilities appear in the dropdown. No hardcoded provider list.
 */

export interface MediaGenerationConfig {
  mediaType: 'image' | 'video';
  provider: string;        // skill ID from media-providers API (e.g. "skill-openai-image-gen")
  prompt: string;          // prompt template, supports {{nodeId.output}} vars
  size?: string;
  quality?: 'standard' | 'hd';
  style?: 'natural' | 'vivid';
  outputPath?: string;
  duration?: string;       // For video (e.g. "5s")
}

export interface MediaProvider {
  id: string;
  name: string;
  description: string;
  supportedTypes: ('image' | 'video' | 'audio')[];
  available: boolean;
  skillPath?: string;
  error?: string;
}

export const MEDIA_NODE_TYPES = {
  'media-image': {
    type: 'tool',
    tool: 'media.generate',
    label: 'Generate Image',
    description: 'Generate images using installed skills',
    icon: '🎨',
    color: '#9333EA',
    category: 'media',
    defaultConfig: {
      mediaType: 'image',
      provider: '',
      prompt: '',
      size: '1024x1024',
      quality: 'standard',
      style: 'natural',
      outputPath: 'shared-context/media/{{run.id}}_{{node.id}}.png'
    } as MediaGenerationConfig
  },
  'media-video': {
    type: 'tool',
    tool: 'media.generate',
    label: 'Generate Video',
    description: 'Generate videos using installed skills',
    icon: '🎬',
    color: '#DC2626',
    category: 'media',
    defaultConfig: {
      mediaType: 'video',
      provider: '',
      prompt: '',
      duration: '5s',
      outputPath: 'shared-context/media/{{run.id}}_{{node.id}}.mp4'
    } as MediaGenerationConfig
  }
} as const;

export type MediaNodeType = keyof typeof MEDIA_NODE_TYPES;

export function isMediaNode(nodeType: string): nodeType is MediaNodeType {
  return nodeType in MEDIA_NODE_TYPES;
}

export function getMediaNodeConfig(nodeType: MediaNodeType): MediaGenerationConfig {
  return { ...MEDIA_NODE_TYPES[nodeType].defaultConfig };
}

export function validateMediaConfig(config: Partial<MediaGenerationConfig>): string[] {
  const errors: string[] = [];

  if (!config.prompt?.trim()) {
    errors.push('Prompt is required');
  }

  if (!config.provider?.trim()) {
    errors.push('Select a provider skill');
  }

  if (config.mediaType === 'image') {
    if (config.size && !['256x256', '512x512', '1024x1024', '1792x1024', '1024x1792'].includes(config.size)) {
      errors.push('Invalid image size');
    }
  }

  if (config.mediaType === 'video') {
    if (config.duration && !config.duration.match(/^\d+s?$/)) {
      errors.push('Invalid video duration format (e.g., "5s")');
    }
  }

  return errors;
}

/**
 * Built-in template variable suggestions for media generation prompts.
 * Prior node outputs (e.g. {{research.output}}) are added dynamically
 * by the UI component based on the current workflow.
 */
export const TEMPLATE_VARIABLES = [
  '{{run.id}}',
  '{{workflow.name}}',
  '{{workflow.id}}',
  '{{date}}',
];

/**
 * Build dynamic template variable list including only upstream node outputs.
 * Walks the edge graph backwards from currentNodeId to find all ancestors.
 */
export function buildTemplateVariables(
  allNodeIds: string[],
  edges: { from: string; to: string }[],
  currentNodeId: string
): string[] {
  const upstream = new Set<string>();
  const queue = [currentNodeId];
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    for (const edge of edges) {
      if (edge.to === nodeId && !upstream.has(edge.from)) {
        upstream.add(edge.from);
        queue.push(edge.from);
      }
    }
  }

  const nodeVars = allNodeIds
    .filter((id) => upstream.has(id) && id !== 'start' && id !== 'end')
    .map((id) => `{{${id}.output}}`);
  return [...nodeVars, ...TEMPLATE_VARIABLES];
}

/**
 * Common prompt templates for different media types
 */
export const PROMPT_TEMPLATES = {
  'social-media': 'Create a professional social media image for: {{content}}',
  'blog-header': 'Create a blog header image representing: {{title}}',
  'marketing': 'Create a marketing image for: {{campaign}}',
} as const;
