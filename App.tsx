
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
        // API制限を避けるため、画像と音声を並列ではなくあえて順番に生成
        if (!scenes[i].imageUrl) {
          scenes[i].imageUrl = await generateImageForScene(scenes[i].image_prompt, state.visualStyle);
          updateScene(i, scenes[i]);
          await new Promise(r => setTimeout(r, 1000)); // インターバル
        }
        
        if (!scenes[i].audioUrl) {
          const audioData = await generateAudioForScene(scenes[i].narration);
          scenes[i].audioUrl = audioData.audioUrl;
          scenes[i].duration = audioData.duration;
          updateScene(i, scenes[i]);
          await new Promise(r => setTimeout(r, 1000));
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
        setState(prev => ({ ...prev, isGeneratingVideos: false, error: `シーン ${i+1}: ${err.message}` }));
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
    <div className="min-h-screen bg-[#050505] text-white">
      <Header />
      <main className="max-w-6xl mx-auto px-6 py-12">
        <section className="mb-16">
          <div className="max-w-3xl mx-auto space-y-8">
            <div className="flex flex-col items-center gap-6">
              <div className="flex bg-white/5 p-1 rounded-full border border-white/10">
                <button onClick={() => setState(s => ({ ...s, productionMode: 'free' }))} className={`px-8 py-2 rounded-full text-xs font-black uppercase transition-all ${state.productionMode === 'free' ? 'bg-amber-600 text-black shadow-lg' : 'text-white/40'}`}>Free (Images)</button>
                <button onClick={() => setState(s => ({ ...s, productionMode: 'paid' }))} className={`px-8 py-2 rounded-full text-xs font-black uppercase transition-all ${state.productionMode === 'paid' ? 'bg-amber-600 text-black shadow-lg' : 'text-white/40'}`}>Paid (Videos)</button>
              </div>
              <div className="flex bg-white/5 p-1 rounded-full border border-white/10">
                <button onClick={() => setState(s => ({ ...s, visualStyle: 'realistic' }))} className={`px-8 py-2 rounded-full text-xs font-black uppercase transition-all ${state.visualStyle === 'realistic' ? 'bg-blue-600 text-white' : 'text-white/40'}`}>Realistic</button>
                <button onClick={() => setState(s => ({ ...s, visualStyle: 'illustration' }))} className={`px-8 py-2 rounded-full text-xs font-black uppercase transition-all ${state.visualStyle === 'illustration' ? 'bg-blue-600 text-white' : 'text-white/40'}`}>Illustration</button>
              </div>
            </div>

            <form onSubmit={handleGenerate} className="flex gap-4 p-2 bg-white/5 rounded-full border border-white/10 focus-within:border-amber-500 transition-all shadow-2xl">
              <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="偉人の名前や歴史的事件..." className="flex-1 bg-transparent px-8 py-4 focus:outline-none font-serif-jp text-lg" disabled={state.isGeneratingStoryboard || state.isGeneratingVideos} />
              <button type="submit" disabled={state.isGeneratingStoryboard || state.isGeneratingVideos} className="bg-amber-600 text-black font-black px-12 py-4 rounded-full tracking-[0.2em] hover:bg-amber-500 transition-all">
                {state.isGeneratingStoryboard ? 'DIRECTING...' : 'START FILM'}
              </button>
            </form>
            
            {state.error && (
              <div className="bg-red-900/20 border border-red-500/50 p-6 rounded-2xl flex flex-col items-center gap-4 animate-in fade-in zoom-in-95">
                <p className="text-center text-red-400 font-bold leading-relaxed">{state.error}</p>
                {state.storyboard && !state.isGeneratingVideos && (
                  <button onClick={() => startProductionPipeline(state.storyboard!)} className="px-6 py-2 bg-red-600 text-white text-xs font-black rounded-full hover:bg-red-500">制作を再開する</button>
                )}
              </div>
            )}
          </div>
        </section>

        {state.storyboard && (
          <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-1000">
            <div className="flex justify-between items-center border-b border-white/5 pb-12">
              <h2 className="text-5xl font-serif-jp italic text-white">{state.storyboard.title}</h2>
              {state.storyboard.scenes.every(s => s.videoUrl) && (
                <button onClick={() => setState(s => ({ ...s, isPreviewOpen: true }))} className="bg-white text-black font-black px-16 py-5 rounded-full tracking-[0.4em] uppercase hover:bg-amber-500 transition-all shadow-2xl">WATCH FILM</button>
              )}
            </div>
            <div className="grid gap-12">
              {state.storyboard.scenes.map((scene, idx) => (
                <SceneCard key={idx} scene={scene} index={idx} isGenerating={!scene.videoUrl} isActive={!scene.videoUrl && state.isGeneratingVideos} />
              ))}
            </div>
          </div>
        )}

        {state.isPreviewOpen && state.storyboard && <VideoPreview storyboard={state.storyboard} onClose={() => setState(s => ({ ...s, isPreviewOpen: false }))} />}
      </main>
    </div>
  );
};

export default App;
