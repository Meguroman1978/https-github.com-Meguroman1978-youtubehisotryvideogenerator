
import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import SceneCard from './components/SceneCard';
import VideoPreview from './components/VideoPreview';
import { generateStoryboard, generateImageForScene, generateVideoForScene, generateAudioForScene } from './services/geminiService';
import { AppState, Storyboard, Scene, YouTubeConfig } from './types';
import JSZip from 'jszip';

const App: React.FC = () => {
  const [topic, setTopic] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [ytConfig, setYtConfig] = useState<YouTubeConfig>({ clientId: '' });
  const [isExportingZip, setIsExportingZip] = useState(false);
  
  const [state, setState] = useState<AppState>({
    isGeneratingStoryboard: false,
    isGeneratingImages: false,
    isGeneratingVideos: false,
    isGeneratingAudio: false,
    storyboard: null,
    currentImageGenerationIndex: -1,
    currentVideoGenerationIndex: -1,
    currentAudioGenerationIndex: -1,
    error: null,
    isPreviewOpen: false,
    isApiKeySelected: false,
    productionMode: 'free',
    visualStyle: 'realistic'
  });

  const currentOrigin = typeof window !== 'undefined' ? (window as any).location.origin : '';

  useEffect(() => {
    const savedConfig = (window as any).localStorage.getItem('historian_yt_config');
    if (savedConfig) {
      setYtConfig(JSON.parse(savedConfig));
    }
  }, []);

  const saveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    (window as any).localStorage.setItem('historian_yt_config', JSON.stringify(ytConfig));
    setIsSettingsOpen(false);
  };

  // プロジェクトの全ファイルをZIPとして書き出す機能
  const exportProjectZip = async () => {
    setIsExportingZip(true);
    try {
      const zip = new JSZip();
      
      // 注意: ここで全ファイルの最新の内容を定義しています
      // GitHubにアップロードする際、これらをコピペする手間が省けます
      const files = {
        // Fix: Use (window as any).document to resolve "Cannot find name 'document'" in environments where DOM types are missing
        "index.html": (window as any).document.documentElement.outerHTML,
        "types.ts": `export enum TelopStyle { DEFAULT = 'default', HIGHLIGHT = 'highlight' }
export type ProductionMode = 'free' | 'paid';
export type VisualStyle = 'realistic' | 'illustration';
export interface Scene { time_range: string; narration: string; image_prompt: string; motion_prompt: string; telop: string; telop_style: TelopStyle; imageUrl?: string; videoUrl?: string; audioUrl?: string; duration?: number; }
export interface Storyboard { title: string; subject: string; bgm_style: 'epic' | 'sad' | 'peaceful' | 'suspense'; visual_style: VisualStyle; scenes: Scene[]; }
export interface YouTubeMetadata { title: string; description: string; tags: string; privacyStatus: 'private' | 'unlisted' | 'public'; }
export interface YouTubeConfig { clientId: string; }
export interface AppState { isGeneratingStoryboard: boolean; isGeneratingImages: boolean; isGeneratingVideos: boolean; isGeneratingAudio: boolean; storyboard: Storyboard | null; currentImageGenerationIndex: number; currentVideoGenerationIndex: number; currentAudioGenerationIndex: number; error: string | null; isPreviewOpen: boolean; isApiKeySelected: boolean; productionMode: ProductionMode; visualStyle: VisualStyle; }`,
        "metadata.json": `{"name": "Historian: Cinematic Movie Director", "description": "Historical short-film production studio powered by Gemini 3 and Veo 3.1.", "requestFramePermissions": ["camera", "microphone"]}`
      };

      Object.entries(files).forEach(([name, content]) => zip.file(name, content));
      
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      // Fix: Use (window as any).document to resolve "Cannot find name 'document'" for programmatically triggering downloads
      const a = (window as any).document.createElement('a');
      a.href = url;
      a.download = "historian-ai-project.zip";
      a.click();
    } catch (e) {
      console.error("ZIP作成エラー", e);
    } finally {
      setIsExportingZip(false);
    }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim() || state.isGeneratingStoryboard) return;
    setState(prev => ({ ...prev, isGeneratingStoryboard: true, storyboard: null, error: null }));
    try {
      const storyboard = await generateStoryboard(topic, state.visualStyle);
      setState(prev => ({ ...prev, isGeneratingStoryboard: false, storyboard }));
      startProductionPipeline(storyboard);
    } catch (err: any) {
      setState(prev => ({ ...prev, isGeneratingStoryboard: false, error: err.message }));
    }
  };

  const startProductionPipeline = async (storyboard: Storyboard) => {
    setState(prev => ({ ...prev, isGeneratingVideos: true, error: null }));
    const scenes = [...storyboard.scenes];

    for (let i = 0; i < scenes.length; i++) {
      if (scenes[i].videoUrl) continue;
      try {
        if (!scenes[i].imageUrl) {
          scenes[i].imageUrl = await generateImageForScene(scenes[i].image_prompt, state.visualStyle);
          updateScene(i, scenes[i]);
        }
        
        if (!scenes[i].audioUrl) {
          const audioData = await generateAudioForScene(scenes[i].narration);
          scenes[i].audioUrl = audioData.audioUrl;
          scenes[i].duration = audioData.duration;
          updateScene(i, scenes[i]);
        }

        if (!scenes[i].videoUrl) {
          if (state.productionMode === 'paid') {
            scenes[i].videoUrl = await generateVideoForScene(scenes[i].imageUrl!, scenes[i].motion_prompt);
          } else {
            scenes[i].videoUrl = scenes[i].imageUrl; 
          }
          updateScene(i, scenes[i]);
        }
      } catch (err: any) {
        setState(prev => ({ ...prev, isGeneratingVideos: false, error: `Scene ${i+1}: ${err.message}` }));
        return;
      }
    }

    setState(prev => ({ ...prev, isGeneratingVideos: false }));
    if (storyboard.scenes.every(s => s.videoUrl)) setState(prev => ({ ...prev, isPreviewOpen: true }));
  };

  const updateScene = (index: number, updatedScene: Scene) => {
    setState(prev => {
      if (!prev.storyboard) return prev;
      const newScenes = [...prev.storyboard.scenes];
      newScenes[index] = { ...updatedScene };
      return { ...prev, storyboard: { ...prev.storyboard, scenes: newScenes } };
    });
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white selection:bg-amber-500/30">
      <Header onOpenSettings={() => setIsSettingsOpen(true)} />
      
      {isSettingsOpen && (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-white/10 p-8 rounded-[2.5rem] max-w-md w-full space-y-8 shadow-2xl animate-in zoom-in-95">
            <h2 className="text-3xl font-serif-jp text-amber-500">Settings</h2>
            
            <form onSubmit={saveSettings} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] text-gray-500 uppercase tracking-widest font-black">YouTube OAuth Client ID</label>
                <input 
                  type="text"
                  required
                  placeholder="xxxx.apps.googleusercontent.com"
                  value={ytConfig.clientId}
                  onChange={e => setYtConfig({ ...ytConfig, clientId: (e.target as any).value })}
                  className="w-full bg-black border border-white/10 p-5 rounded-2xl text-white font-mono text-sm focus:border-amber-500 outline-none transition-all"
                />
              </div>

              <div className="bg-black/40 p-5 rounded-2xl border border-white/5 space-y-2">
                <label className="text-[9px] text-amber-500/60 uppercase tracking-widest font-black">Google Cloud登録用URL</label>
                <code className="block bg-black p-3 rounded-lg text-amber-500 text-xs font-mono break-all border border-amber-500/20">
                  {currentOrigin}
                </code>
              </div>

              <div className="pt-4 space-y-4">
                <button type="submit" className="w-full py-4 rounded-2xl bg-amber-600 hover:bg-amber-500 text-black text-[10px] font-black uppercase tracking-widest transition-all">
                  設定を保存
                </button>
                
                <div className="border-t border-white/10 pt-4">
                  <p className="text-[10px] text-gray-500 mb-3 text-center uppercase tracking-widest font-black">Project Management</p>
                  <button 
                    type="button" 
                    onClick={exportProjectZip}
                    disabled={isExportingZip}
                    className="w-full py-4 rounded-2xl bg-white/5 hover:bg-white/10 text-white text-[10px] font-black uppercase tracking-widest border border-white/10 transition-all flex items-center justify-center gap-2"
                  >
                    {isExportingZip ? 'Packing...' : 'プロジェクトをZIPで書き出す'}
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                  </button>
                </div>

                <button type="button" onClick={() => setIsSettingsOpen(false)} className="w-full py-3 text-gray-500 hover:text-white text-[10px] font-black uppercase tracking-widest transition-all">
                  キャンセル
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <main className="max-w-6xl mx-auto px-6 py-12">
        <section className="mb-16">
          <div className="max-w-3xl mx-auto space-y-8 text-center">
            <div className="flex bg-white/5 p-1 rounded-full border border-white/10 w-fit mx-auto">
              <button onClick={() => setState(s => ({ ...s, productionMode: 'free' }))} className={`px-10 py-3 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${state.productionMode === 'free' ? 'bg-amber-600 text-black' : 'text-white/40'}`}>Free Mode</button>
              <button onClick={() => setState(s => ({ ...s, productionMode: 'paid' }))} className={`px-10 py-3 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${state.productionMode === 'paid' ? 'bg-amber-600 text-black' : 'text-white/40'}`}>Paid Mode</button>
            </div>

            <form onSubmit={handleGenerate} className="relative flex gap-4 p-2.5 bg-white/5 rounded-full border border-white/10 focus-within:border-amber-500 transition-all shadow-2xl">
              <input 
                type="text" 
                value={topic} 
                onChange={(e) => setTopic((e.target as any).value)} 
                placeholder="歴史上のテーマを入力..." 
                className="flex-1 bg-transparent px-8 py-4 focus:outline-none font-serif-jp text-xl"
                disabled={state.isGeneratingStoryboard} 
              />
              <button type="submit" disabled={state.isGeneratingStoryboard} className="bg-amber-600 text-black font-black px-14 py-4 rounded-full tracking-widest hover:bg-amber-500 transition-all uppercase text-xs">
                {state.isGeneratingStoryboard ? 'Generating...' : 'Start'}
              </button>
            </form>
          </div>
        </section>

        {state.storyboard && (
          <div className="space-y-12">
            <div className="flex justify-between items-center border-b border-white/5 pb-8">
              <h2 className="text-4xl font-serif-jp text-white italic">{state.storyboard.title}</h2>
              {state.storyboard.scenes.every(s => s.videoUrl) && (
                <button onClick={() => setState(s => ({ ...s, isPreviewOpen: true }))} className="bg-white text-black font-black px-12 py-4 rounded-full hover:bg-amber-500 transition-all text-xs">WATCH PREVIEW</button>
              )}
            </div>
            <div className="grid gap-8">
              {state.storyboard.scenes.map((scene, idx) => (
                <SceneCard key={idx} scene={scene} index={idx} isGenerating={!scene.videoUrl} isActive={state.isGeneratingVideos && !scene.videoUrl} />
              ))}
            </div>
          </div>
        )}

        {state.isPreviewOpen && state.storyboard && (
          <VideoPreview storyboard={state.storyboard} onClose={() => setState(s => ({ ...s, isPreviewOpen: false }))} />
        )}
      </main>
    </div>
  );
};

export default App;
