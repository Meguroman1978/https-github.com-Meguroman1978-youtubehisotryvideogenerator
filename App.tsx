
import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import SceneCard from './components/SceneCard';
import VideoPreview from './components/VideoPreview';
import SettingsModal from './components/SettingsModal';
import { generateStoryboard, generateImageForScene, generateAudioForScene } from './services/geminiService';
import { AppState, VisualStyle, ProductionMode } from './types';

const App: React.FC = () => {
  const [topic, setTopic] = useState('');
  const [status, setStatus] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
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
    visualStyle: 'realistic',
    sceneCount: 5,
    sceneDuration: 10
  });

  useEffect(() => {
    const checkKey = async () => {
      if ((window as any).aistudio?.hasSelectedApiKey) {
        const hasKey = await (window as any).aistudio.hasSelectedApiKey();
        setState(s => ({ ...s, isApiKeySelected: hasKey }));
      }
    };
    checkKey();
  }, []);

  const runChainReaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim() || state.isGeneratingStoryboard) return;

    // Check key requirements for Pro mode
    if (state.productionMode === 'paid' && !state.isApiKeySelected) {
      if ((window as any).aistudio?.openSelectKey) {
        await (window as any).aistudio.openSelectKey();
        setState(s => ({ ...s, isApiKeySelected: true }));
      } else {
        setState(s => ({ ...s, error: "Paid engine requires a connected API key." }));
        return;
      }
    }

    try {
      setState(s => ({ ...s, isGeneratingStoryboard: true, error: null, storyboard: null }));
      
      setStatus("🎬 監督が脚本を執筆中...");
      const storyboard = await generateStoryboard(
        topic, 
        state.visualStyle, 
        state.sceneCount, 
        state.sceneDuration,
        state.productionMode
      );
      setState(s => ({ ...s, storyboard }));

      const scenes = [...storyboard.scenes];
      for (let i = 0; i < scenes.length; i++) {
        setStatus(`🎨 ビジュアル制作中: シーン ${i + 1}/${scenes.length}`);
        
        // 画像と音声を並列で生成
        const [imgUrl, audioUrl] = await Promise.all([
          generateImageForScene(scenes[i].image_prompt, state.visualStyle),
          generateAudioForScene(scenes[i].narration)
        ]);
        
        scenes[i].imageUrl = imgUrl;
        scenes[i].audioUrl = audioUrl;

        setState(s => ({
          ...s,
          storyboard: { ...s.storyboard!, scenes: [...scenes] }
        }));
      }

      setStatus("✨ クランクアップ！プレビューを開始します...");
      setState(s => ({ ...s, isGeneratingStoryboard: false, isPreviewOpen: true }));
    } catch (err: any) {
      console.error(err);
      let errorMessage = err.message;
      
      if (errorMessage.includes('QUOTA_EXHAUSTED')) {
        errorMessage = "Quota exceeded for Pro engine. Please connect a paid API key in settings or use Standard mode.";
        setIsSettingsOpen(true); // Guide user to settings
      }

      setState(s => ({ ...s, isGeneratingStoryboard: false, error: errorMessage }));
      setStatus("❌ 制作エラーが発生しました。");
    }
  };

  const updateState = (updates: Partial<AppState>) => {
    setState(s => ({ ...s, ...updates }));
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white font-serif-jp">
      <Header onOpenSettings={() => setIsSettingsOpen(true)} />
      
      <main className="max-w-4xl mx-auto px-6 py-24 text-center">
        <div className="mb-20 space-y-6">
          <h2 className="text-6xl md:text-8xl font-bold italic tracking-tighter bg-gradient-to-b from-white to-white/30 bg-clip-text text-transparent">
            Cinematic Studio
          </h2>
          <p className="text-amber-500/60 text-[10px] font-black uppercase tracking-[0.6em]">Professional Auto-Director v3.1</p>
        </div>

        {state.error && (
          <div className="max-w-2xl mx-auto mb-10 p-6 bg-red-950/40 border border-red-500/30 rounded-3xl animate-in fade-in zoom-in">
            <p className="text-red-400 text-xs font-bold uppercase tracking-widest">{state.error}</p>
          </div>
        )}

        <form onSubmit={runChainReaction} className="max-w-2xl mx-auto mb-16 relative">
          <div className="flex gap-3 p-3 bg-white/5 border border-white/10 rounded-full backdrop-blur-3xl shadow-2xl">
            <input 
              type="text" 
              value={topic} 
              onChange={(e) => setTopic(e.target.value)} 
              placeholder="歴史上の人物や事件を入力（例：織田信長）" 
              className="flex-1 bg-transparent px-8 py-4 text-xl outline-none placeholder:text-white/20" 
              disabled={state.isGeneratingStoryboard}
            />
            <button 
              type="submit" 
              disabled={state.isGeneratingStoryboard}
              className="bg-amber-600 text-black font-black px-12 py-4 rounded-full text-[11px] tracking-widest hover:bg-white transition-all disabled:opacity-20 shadow-lg"
            >
              {state.isGeneratingStoryboard ? 'DIRECTING...' : 'START FILM'}
            </button>
          </div>
          {status && (
            <p className="mt-10 text-amber-500 text-[11px] font-black tracking-[0.2em] animate-pulse uppercase">
              {status}
            </p>
          )}
        </form>

        {state.storyboard && (
          <div className="grid gap-8 text-left animate-in fade-in slide-in-from-bottom-10 duration-1000">
            {state.storyboard.scenes.map((s, i) => (
              <SceneCard 
                key={i} 
                scene={s} 
                index={i} 
                isGenerating={!s.imageUrl} 
                isActive={!s.imageUrl && state.isGeneratingStoryboard} 
              />
            ))}
          </div>
        )}
      </main>

      {state.isPreviewOpen && state.storyboard && (
        <VideoPreview storyboard={state.storyboard} onClose={() => setState(s => ({ ...s, isPreviewOpen: false }))} />
      )}

      <SettingsModal 
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        visualStyle={state.visualStyle}
        onVisualStyleChange={(style) => updateState({ visualStyle: style })}
        productionMode={state.productionMode}
        onProductionModeChange={(mode) => updateState({ productionMode: mode })}
        sceneCount={state.sceneCount}
        onSceneCountChange={(count) => updateState({ sceneCount: count })}
        sceneDuration={state.sceneDuration}
        onSceneDurationChange={(duration) => updateState({ sceneDuration: duration })}
      />
    </div>
  );
};

export default App;
