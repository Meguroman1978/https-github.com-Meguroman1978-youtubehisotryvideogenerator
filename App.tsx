
import React, { useState, useEffect, useRef } from 'react';
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
  const [customBgm, setCustomBgm] = useState<{ url: string, name: string } | null>(null);
  const [productionStatus, setProductionStatus] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  
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

  const authorizedOrigin = typeof window !== 'undefined' ? (window as any).location.origin : '';

  useEffect(() => {
    const savedConfig = (window as any).localStorage.getItem('historian_yt_config');
    if (savedConfig) {
      setYtConfig(JSON.parse(savedConfig));
    }
    checkApiKeyStatus();
  }, []);

  const checkApiKeyStatus = async () => {
    try {
      if ((window as any).aistudio?.hasSelectedApiKey) {
        const hasKey = await (window as any).aistudio.hasSelectedApiKey();
        setState(prev => ({ ...prev, isApiKeySelected: hasKey }));
      }
    } catch (e) {
      console.error("API Key check failed", e);
    }
  };

  const handleOpenKeySelector = async () => {
    try {
      if ((window as any).aistudio?.openSelectKey) {
        await (window as any).aistudio.openSelectKey();
        setState(prev => ({ ...prev, isApiKeySelected: true }));
      }
    } catch (e) {
      console.error("Failed to open key selector", e);
    }
  };

  const handleBgmUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = (e.target as any).files?.[0];
    if (file) {
      if (customBgm) URL.revokeObjectURL(customBgm.url);
      const url = URL.createObjectURL(file);
      setCustomBgm({ url, name: file.name });
    }
  };

  const saveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    (window as any).localStorage.setItem('historian_yt_config', JSON.stringify(ytConfig));
    setIsSettingsOpen(false);
  };

  const exportProjectZip = async () => {
    setIsExportingZip(true);
    try {
      const zip = new JSZip();
      const files = {
        "index.html": (window as any).document.documentElement.outerHTML,
        "types.ts": `export enum TelopStyle { DEFAULT = 'default', HIGHLIGHT = 'highlight' }
export type ProductionMode = 'free' | 'paid';
export type VisualStyle = 'realistic' | 'illustration';
export interface Scene { time_range: string; narration: string; image_prompt: string; motion_prompt: string; telop: string; telop_style: TelopStyle; imageUrl?: string; videoUrl?: string; audioUrl?: string; duration?: number; }
export interface Storyboard { title: string; subject: string; bgm_style: 'epic' | 'sad' | 'peaceful' | 'suspense'; visual_style: VisualStyle; scenes: Scene[]; customBgmUrl?: string; }
export interface YouTubeMetadata { title: string; description: string; tags: string; privacyStatus: 'private' | 'unlisted' | 'public'; }
export interface YouTubeConfig { clientId: string; }
export interface AppState { isGeneratingStoryboard: boolean; isGeneratingImages: boolean; isGeneratingVideos: boolean; isGeneratingAudio: boolean; storyboard: Storyboard | null; currentImageGenerationIndex: number; currentVideoGenerationIndex: number; currentAudioGenerationIndex: number; error: string | null; isPreviewOpen: boolean; isApiKeySelected: boolean; productionMode: ProductionMode; visualStyle: VisualStyle; }`,
        "metadata.json": `{"name": "Historian: Cinematic Movie Director", "description": "Historical short-film production studio powered by Gemini 3 and Veo 3.1.", "requestFramePermissions": ["camera", "microphone"]}`
      };
      Object.entries(files).forEach(([name, content]) => zip.file(name, content));
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
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
    
    if (state.productionMode === 'paid' && !state.isApiKeySelected) {
      handleOpenKeySelector();
      return;
    }

    setState(prev => ({ ...prev, isGeneratingStoryboard: true, storyboard: null, error: null }));
    setProductionStatus("ストーリーボードを構成中...");
    try {
      const storyboard = await generateStoryboard(topic, state.visualStyle);
      if (customBgm) {
        storyboard.customBgmUrl = customBgm.url;
      }
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
      try {
        setProductionStatus(`シーン ${i + 1} のアセットを準備中...`);
        
        // 画像生成（失敗時は自動フォールバックがgeminiService内で動く）
        if (!scenes[i].imageUrl) {
          scenes[i].imageUrl = await generateImageForScene(scenes[i].image_prompt, state.visualStyle);
          updateScene(i, scenes[i]);
        }
        
        // 音声生成
        if (!scenes[i].audioUrl) {
          const audioData = await generateAudioForScene(scenes[i].narration);
          scenes[i].audioUrl = audioData.audioUrl;
          scenes[i].duration = audioData.duration;
          updateScene(i, scenes[i]);
        }

        // 動画生成
        if (!scenes[i].videoUrl) {
          if (state.productionMode === 'paid') {
            try {
              scenes[i].videoUrl = await generateVideoForScene(scenes[i].imageUrl!, scenes[i].motion_prompt);
            } catch (vErr: any) {
              // クォータ制限やエラー時は画像を動画代わりにする
              console.warn("Video quota reached, using image fallback for scene", i + 1);
              scenes[i].videoUrl = scenes[i].imageUrl; 
            }
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

    setProductionStatus("全アセットの生成完了！");
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

              <div className="bg-black/40 p-5 rounded-2xl border border-white/5 space-y-3">
                <label className="text-[9px] text-amber-500/60 uppercase tracking-widest font-black">Google Cloud設定用（JavaScript生成元）</label>
                <code className="block bg-black p-3 rounded-lg text-amber-500 text-xs font-mono break-all border border-amber-500/20">
                  {authorizedOrigin}
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
            <div className="flex flex-col items-center gap-6">
              <div className="flex bg-white/5 p-1 rounded-full border border-white/10 w-fit">
                <button onClick={() => setState(s => ({ ...s, productionMode: 'free' }))} className={`px-10 py-3 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${state.productionMode === 'free' ? 'bg-amber-600 text-black' : 'text-white/40'}`}>Free (Images)</button>
                <button onClick={() => setState(s => ({ ...s, productionMode: 'paid' }))} className={`px-10 py-3 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${state.productionMode === 'paid' ? 'bg-amber-600 text-black' : 'text-white/40'}`}>Paid (Full Video)</button>
              </div>
              
              <div className="w-full flex justify-center gap-4">
                 <div className="relative">
                    <input type="file" ref={fileInputRef} onChange={handleBgmUpload} accept="audio/*" className="hidden" />
                    <button 
                      onClick={() => (fileInputRef.current as any)?.click()}
                      className={`flex items-center gap-3 px-6 py-3 rounded-2xl border transition-all text-[10px] font-black uppercase tracking-widest ${customBgm ? 'bg-blue-600/20 border-blue-500 text-blue-400' : 'bg-white/5 border-white/10 text-white/40 hover:border-white/30'}`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"/></svg>
                      {customBgm ? `BGM: ${customBgm.name}` : '音源ファイルをアップロード'}
                    </button>
                    {customBgm && (
                      <button onClick={() => setCustomBgm(null)} className="absolute -top-2 -right-2 bg-red-600 text-white p-1 rounded-full hover:bg-red-500">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                      </button>
                    )}
                 </div>

                {state.productionMode === 'paid' && !state.isApiKeySelected && (
                  <button 
                    onClick={handleOpenKeySelector}
                    className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-amber-600/10 border border-amber-500 text-amber-500 text-[10px] font-black uppercase tracking-widest animate-pulse"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/></svg>
                    APIキーを選択
                  </button>
                )}
              </div>
            </div>

            <form onSubmit={handleGenerate} className="relative flex gap-4 p-2.5 bg-white/5 rounded-full border border-white/10 focus-within:border-amber-500 transition-all shadow-2xl">
              <input 
                type="text" 
                value={topic} 
                onChange={(e) => setTopic((e.target as any).value)} 
                placeholder="歴史上のテーマ、あるいは人物名を入力..." 
                className="flex-1 bg-transparent px-8 py-4 focus:outline-none font-serif-jp text-xl"
                disabled={state.isGeneratingStoryboard} 
              />
              <button type="submit" disabled={state.isGeneratingStoryboard} className="bg-amber-600 text-black font-black px-14 py-4 rounded-full tracking-widest hover:bg-amber-500 transition-all uppercase text-xs">
                {state.isGeneratingStoryboard ? 'DIRECTING...' : 'START FILM'}
              </button>
            </form>
            
            {productionStatus && (
              <p className="text-amber-500/60 text-[10px] font-black uppercase tracking-[0.2em] animate-pulse">
                Current Status: {productionStatus}
              </p>
            )}

            {state.error && (
              <div className="bg-red-900/20 border border-red-500/50 p-6 rounded-3xl animate-in shake duration-500">
                <p className="text-red-400 font-bold font-serif-jp text-sm leading-relaxed">{state.error}</p>
                {state.error.includes("APIキー") && (
                  <button onClick={handleOpenKeySelector} className="mt-3 text-white text-[10px] font-black uppercase tracking-widest underline">キーを選択し直す</button>
                )}
              </div>
            )}
          </div>
        </section>

        {state.storyboard && (
          <div className="space-y-12 animate-in fade-in slide-in-from-bottom-8 duration-700">
            <div className="flex flex-col md:flex-row justify-between items-center border-b border-white/5 pb-8 gap-6">
              <h2 className="text-4xl md:text-5xl font-serif-jp text-white italic leading-tight">{state.storyboard.title}</h2>
              {state.storyboard.scenes.every(s => s.videoUrl) && (
                <button onClick={() => setState(s => ({ ...s, isPreviewOpen: true }))} className="bg-white text-black font-black px-16 py-5 rounded-full hover:bg-amber-500 transition-all text-xs tracking-[0.3em]">WATCH FILM</button>
              )}
            </div>
            <div className="grid gap-10">
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
