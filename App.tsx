
import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import SceneCard from './components/SceneCard';
import VideoPreview from './components/VideoPreview';
import { generateStoryboard, generateImageForScene, generateVideoForScene, generateAudioForScene } from './services/geminiService';
import { AppState, Storyboard, Scene } from './types';

const App: React.FC = () => {
  const [topic, setTopic] = useState('');
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

  useEffect(() => {
    const checkKey = async () => {
      try {
        const hasKey = await (window as any).aistudio.hasSelectedApiKey();
        setState(s => ({ ...s, isApiKeySelected: hasKey }));
      } catch (e) {}
    };
    checkKey();
  }, []);

  const handleOpenKey = async () => {
    await (window as any).aistudio.openSelectKey();
    setState(s => ({ ...s, isApiKeySelected: true }));
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim() || state.isGeneratingStoryboard) return;

    if (state.productionMode === 'paid' && !state.isApiKeySelected) {
      const hasKey = await (window as any).aistudio.hasSelectedApiKey();
      if (!hasKey) {
        await handleOpenKey();
        return;
      }
    }

    setState(prev => ({
      ...prev,
      isGeneratingStoryboard: true,
      storyboard: null,
      error: null
    }));

    try {
      const storyboard = await generateStoryboard(topic, state.visualStyle);
      setState(prev => ({ ...prev, isGeneratingStoryboard: false, storyboard }));
      startProductionPipeline(storyboard);
    } catch (err: any) {
      setState(prev => ({ ...prev, isGeneratingStoryboard: false, error: err.message || "生成に失敗しました。" }));
    }
  };

  const startProductionPipeline = async (storyboard: Storyboard) => {
    const scenes = [...storyboard.scenes];
    setState(prev => ({ ...prev, isGeneratingVideos: true, error: null }));

    // まだ生成が完了していないシーンから開始する
    for (let i = 0; i < scenes.length; i++) {
      if (scenes[i].videoUrl) continue; // すでに生成済みのシーンはスキップ

      try {
        // 画像と音声がまだない場合は生成
        if (!scenes[i].imageUrl || !scenes[i].audioUrl) {
          const [imageUrl, audioData] = await Promise.all([
            generateImageForScene(scenes[i].image_prompt, state.visualStyle),
            generateAudioForScene(scenes[i].narration)
          ]);
          scenes[i].imageUrl = imageUrl;
          scenes[i].audioUrl = audioData.audioUrl;
          scenes[i].duration = audioData.duration;
          updateScene(i, scenes[i]);
        }

        // ビデオの生成
        if (!scenes[i].videoUrl) {
          if (state.productionMode === 'paid') {
            const videoUrl = await generateVideoForScene(scenes[i].imageUrl!, scenes[i].motion_prompt);
            scenes[i].videoUrl = videoUrl;
          } else {
            scenes[i].videoUrl = scenes[i].imageUrl; 
          }
          updateScene(i, scenes[i]);
        }
      } catch (err: any) {
        console.error(`Scene ${i} failed:`, err);
        setState(prev => ({ 
          ...prev, 
          isGeneratingVideos: false, 
          error: `シーン ${i+1} の生成中にエラーが発生しました: ${err.message}` 
        }));
        return; // エラーが発生した時点で停止し、リトライできるようにする
      }
    }

    setState(prev => ({ ...prev, isGeneratingVideos: false }));
    const isReady = storyboard.scenes.every(s => s.videoUrl);
    if (isReady) setState(prev => ({ ...prev, isPreviewOpen: true }));
  };

  const updateScene = (index: number, updatedScene: Scene) => {
    setState(prev => {
      if (!prev.storyboard) return prev;
      const newScenes = [...prev.storyboard.scenes];
      newScenes[index] = { ...updatedScene };
      return { ...prev, storyboard: { ...prev.storyboard, scenes: newScenes } };
    });
  };

  const isComplete = state.storyboard && state.storyboard.scenes.every(s => s.videoUrl);

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <Header />
      <main className="max-w-6xl mx-auto px-6 py-12">
        <section className="mb-16">
          <div className="max-w-3xl mx-auto space-y-8">
            <div className="flex flex-col items-center gap-6">
              <div className="flex bg-white/5 p-1 rounded-full border border-white/10">
                <button 
                  onClick={() => setState(s => ({ ...s, productionMode: 'free' }))}
                  className={`px-8 py-2 rounded-full text-xs font-black uppercase transition-all ${state.productionMode === 'free' ? 'bg-amber-600 text-black shadow-lg shadow-amber-600/20' : 'text-white/40'}`}
                >
                  Free (Images)
                </button>
                <button 
                  onClick={() => setState(s => ({ ...s, productionMode: 'paid' }))}
                  className={`relative px-8 py-2 rounded-full text-xs font-black uppercase transition-all ${state.productionMode === 'paid' ? 'bg-amber-600 text-black shadow-lg shadow-amber-600/20' : 'text-white/40'}`}
                >
                  Paid (Videos)
                  {state.productionMode === 'paid' && !state.isApiKeySelected && (
                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-ping"></span>
                  )}
                </button>
              </div>

              {state.productionMode === 'paid' && !state.isApiKeySelected && (
                <button 
                  onClick={handleOpenKey}
                  className="text-amber-500 text-[10px] tracking-widest flex items-center gap-2 hover:underline font-black"
                >
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/></svg>
                  APIキーを選択してビデオ生成を有効化
                </button>
              )}

              <div className="flex bg-white/5 p-1 rounded-full border border-white/10">
                <button 
                  onClick={() => setState(s => ({ ...s, visualStyle: 'realistic' }))}
                  className={`px-8 py-2 rounded-full text-xs font-black uppercase transition-all ${state.visualStyle === 'realistic' ? 'bg-blue-600 text-white shadow-lg' : 'text-white/40'}`}
                >
                  Realistic
                </button>
                <button 
                  onClick={() => setState(s => ({ ...s, visualStyle: 'illustration' }))}
                  className={`px-8 py-2 rounded-full text-xs font-black uppercase transition-all ${state.visualStyle === 'illustration' ? 'bg-blue-600 text-white shadow-lg' : 'text-white/40'}`}
                >
                  Illustration
                </button>
              </div>
            </div>

            <form onSubmit={handleGenerate} className="flex gap-4 p-2 bg-white/5 rounded-full border border-white/10 focus-within:border-amber-500 transition-all shadow-2xl">
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="偉人の衝撃的な事実、歴史の闇..."
                className="flex-1 bg-transparent px-8 py-4 focus:outline-none font-serif-jp text-lg"
                disabled={state.isGeneratingStoryboard || state.isGeneratingVideos}
              />
              <button 
                type="submit" 
                disabled={state.isGeneratingStoryboard || state.isGeneratingVideos} 
                className="bg-amber-600 text-black font-black px-12 py-4 rounded-full tracking-[0.2em] whitespace-nowrap disabled:opacity-30 hover:bg-amber-500 transition-all shadow-xl"
              >
                {state.isGeneratingStoryboard ? 'DIRECTING...' : state.isGeneratingVideos ? 'PRODUCING...' : 'START FILM'}
              </button>
            </form>
            
            {state.error && (
              <div className="bg-red-900/20 border border-red-500/50 p-6 rounded-2xl space-y-4">
                <p className="text-center text-red-400 font-bold leading-relaxed">{state.error}</p>
                {state.storyboard && !state.isGeneratingVideos && (
                  <button 
                    onClick={() => startProductionPipeline(state.storyboard!)}
                    className="block mx-auto px-6 py-2 bg-red-600 text-white text-xs font-black rounded-full hover:bg-red-500 transition-all"
                  >
                    続きから再開する
                  </button>
                )}
              </div>
            )}
          </div>
        </section>

        {state.storyboard && (
          <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-1000">
            <div className="flex flex-col md:flex-row justify-between items-center gap-6 border-b border-white/5 pb-12">
              <div className="text-center md:text-left">
                <span className="text-amber-500 text-[10px] tracking-[0.5em] uppercase font-black mb-2 block">Project Archive</span>
                <h2 className="text-5xl font-serif-jp italic tracking-tighter text-white">{state.storyboard.title}</h2>
              </div>
              {isComplete && (
                <button onClick={() => setState(s => ({ ...s, isPreviewOpen: true }))} className="bg-white text-black font-black px-16 py-5 rounded-full tracking-[0.4em] uppercase hover:bg-amber-500 transition-all shadow-2xl">
                  Watch & Export
                </button>
              )}
            </div>

            <div className="grid gap-12">
              {state.storyboard.scenes.map((scene, idx) => (
                <SceneCard key={idx} scene={scene} index={idx} isGenerating={!scene.videoUrl} isActive={!scene.videoUrl && state.isGeneratingVideos} />
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
