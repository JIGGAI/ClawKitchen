/**
 * Media Generation Node Types for ClawKitchen Workflows
 * Integrates with the vendor-agnostic media generation backend system
 */

export interface MediaGenerationConfig {
  mediaType: 'image' | 'video';
  provider: 'auto' | 'openai' | 'skill' | 'http' | string;
  prompt: string;
  size?: string;
  quality?: 'standard' | 'hd';
  style?: 'natural' | 'vivid';
  model?: string;
  outputPath?: string;
  duration?: string; // For video
  // Provider-specific configs
  skillId?: string;
  httpEndpoint?: string;
  httpHeaders?: Record<string, string>;
}

export interface MediaProvider {
  id: string;
  name: string;
  supportedTypes: ('image' | 'video')[];
  available: boolean;
  models?: string[];
  error?: string;
}

export const MEDIA_NODE_TYPES = {
  'media-image': {
    type: 'tool',
    tool: 'media.generate',
    label: 'Generate Image',
    description: 'Generate images using AI providers (DALL-E, Skills, etc.)',
    icon: '🎨',
    color: '#9333EA',
    category: 'media',
    defaultConfig: {
      mediaType: 'image',
      provider: 'auto',
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
    description: 'Generate videos using AI providers',
    icon: '🎬',
    color: '#DC2626',
    category: 'media',
    defaultConfig: {
      mediaType: 'video',
      provider: 'auto',
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
 * Build dynamic template variable list including prior node outputs.
 * @param allNodeIds - all node IDs in the workflow
 * @param currentNodeId - the node being edited (excluded from suggestions)
 */
export function buildTemplateVariables(allNodeIds: string[], currentNodeId: string): string[] {
  const nodeVars = allNodeIds
    .filter((id) => id !== currentNodeId && id !== 'start' && id !== 'end')
    .map((id) => `{{${id}.output}}`);
  return [...nodeVars, ...TEMPLATE_VARIABLES];
}

/**
 * Common prompt templates for different media types
 */
export const PROMPT_TEMPLATES = {
  'social-media': 'Professional social media image for: {{content}}',
  'blog-header': 'Blog header image representing: {{title}}',
  'product-shot': 'Product photography style image of: {{product}}',
  'illustration': 'Clean vector illustration of: {{concept}}',
  'marketing': 'Marketing banner image for: {{campaign}}'
} as const;