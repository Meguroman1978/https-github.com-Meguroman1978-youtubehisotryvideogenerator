
export enum TelopStyle {
  DEFAULT = 'default',
  HIGHLIGHT = 'highlight'
}

export type ProductionMode = 'free' | 'paid';
export type VisualStyle = 'realistic' | 'illustration';

export interface Scene {
  time_range: string;
  narration: string;
  image_prompt: string;
  motion_prompt: string;
  telop: string;
  telop_style: TelopStyle;
  imageUrl?: string;
  videoUrl?: string; 
  audioUrl?: string; 
  duration?: number;
}

export interface Storyboard {
  title: string;
  subject: string;
  bgm_style: 'epic' | 'sad' | 'peaceful' | 'suspense';
  visual_style: VisualStyle;
  scenes: Scene[];
  customBgmUrl?: string; // ユーザーがアップロードしたBGM
}

export interface YouTubeMetadata {
  title: string;
  description: string;
  tags: string;
  privacyStatus: 'private' | 'unlisted' | 'public';
}

export interface YouTubeConfig {
  clientId: string;
}

export interface AppState {
  isGeneratingStoryboard: boolean;
  isGeneratingImages: boolean;
  isGeneratingVideos: boolean;
  isGeneratingAudio: boolean;
  storyboard: Storyboard | null;
  currentImageGenerationIndex: number;
  currentVideoGenerationIndex: number;
  currentAudioGenerationIndex: number;
  error: string | null;
  isPreviewOpen: boolean;
  isApiKeySelected: boolean;
  productionMode: ProductionMode;
  visualStyle: VisualStyle;
}
