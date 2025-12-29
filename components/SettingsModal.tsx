
import React, { useEffect, useState } from 'react';
import { VisualStyle, ProductionMode } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  visualStyle: VisualStyle;
  onVisualStyleChange: (style: VisualStyle) => void;
  productionMode: ProductionMode;
  onProductionModeChange: (mode: ProductionMode) => void;
  sceneCount: number;
  onSceneCountChange: (count: number) => void;
  sceneDuration: number;
  onSceneDurationChange: (duration: number) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  visualStyle,
  onVisualStyleChange,
  productionMode,
  onProductionModeChange,
  sceneCount,
  onSceneCountChange,
  sceneDuration,
  onSceneDurationChange,
}) => {
  const [hasKey, setHasKey] = useState(false);

  useEffect(() => {
    const checkKey = async () => {
      if ((window as any).aistudio?.hasSelectedApiKey) {
        const selected = await (window as any).aistudio.hasSelectedApiKey();
        setHasKey(selected);
      }
    };
    if (isOpen) checkKey();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleOpenKeySelector = async () => {
    if ((window as any).aistudio?.openSelectKey) {
      await (window as any).aistudio.openSelectKey();
      setHasKey(true);
      onProductionModeChange('paid');
    }
  };

  const totalDuration = sceneCount * sceneDuration;

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-6">
      <div 
        className="absolute inset-0 bg-black/90 backdrop-blur-xl"
        onClick={onClose}
      />
      
      <div className="relative w-full max-w-xl bg-[#0a0a0a] border border-white/10 rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in duration-300">
        <div className="p-10 md:p-12 max-h-[90vh] overflow-y-auto custom-scrollbar">
          <div className="flex justify-between items-center mb-10">
            <div>
              <h2 className="text-3xl font-bold italic text-white tracking-tighter">Director's Settings</h2>
              <p className="text-[10px] text-amber-500 font-black uppercase tracking-[0.3em] mt-2">Production Engine v3.1</p>
            </div>
            <button 
              onClick={onClose}
              className="p-3 rounded-full hover:bg-white/5 text-white/40 hover:text-white transition-all"
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-10">
            {/* API Key Management */}
            <div className="p-6 rounded-3xl bg-amber-500/5 border border-amber-500/20 space-y-4">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-500/60">Licensing & Quota</label>
                <span className={`text-[9px] font-bold px-3 py-1 rounded-full ${hasKey ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                  {hasKey ? 'PAID KEY CONNECTED' : 'STANDARD QUOTA'}
                </span>
              </div>
              <p className="text-[11px] text-white/50 leading-relaxed">
                Pro features and higher resolution require a paid API key. 
                <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="ml-1 text-amber-500 underline hover:text-amber-400 transition-colors">
                  Learn about billing
                </a>
              </p>
              <button
                onClick={handleOpenKeySelector}
                className="w-full py-4 bg-amber-500/10 border border-amber-500/30 text-amber-500 font-black rounded-2xl text-[10px] tracking-widest hover:bg-amber-500 hover:text-black transition-all"
              >
                {hasKey ? 'CHANGE API KEY' : 'CONNECT PAID API KEY'}
              </button>
            </div>

            {/* Scene Configuration */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div className="flex justify-between items-end">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Scene Count</label>
                  <span className="text-amber-500 font-mono font-bold">{sceneCount} Scenes</span>
                </div>
                <input 
                  type="range" min="3" max="10" step="1" 
                  value={sceneCount} 
                  onChange={(e) => onSceneCountChange(parseInt(e.target.value))}
                  className="w-full accent-amber-500 bg-white/5 h-1.5 rounded-full appearance-none cursor-pointer"
                />
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-end">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Sec per Scene</label>
                  <span className="text-amber-500 font-mono font-bold">{sceneDuration}s</span>
                </div>
                <input 
                  type="range" min="5" max="15" step="1" 
                  value={sceneDuration} 
                  onChange={(e) => onSceneDurationChange(parseInt(e.target.value))}
                  className="w-full accent-amber-500 bg-white/5 h-1.5 rounded-full appearance-none cursor-pointer"
                />
              </div>
            </div>

            {/* Duration Indicator */}
            <div className={`p-4 rounded-2xl border flex items-center justify-between transition-colors ${
              totalDuration >= 45 && totalDuration <= 60 
                ? 'bg-amber-500/10 border-amber-500/30' 
                : 'bg-white/5 border-white/5'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${totalDuration >= 45 && totalDuration <= 60 ? 'bg-amber-500 animate-pulse' : 'bg-white/20'}`} />
                <span className="text-[10px] font-black uppercase tracking-widest text-white/60">Estimated Total Runtime</span>
              </div>
              <span className={`text-2xl font-black font-mono ${totalDuration >= 45 && totalDuration <= 60 ? 'text-amber-500' : 'text-white/40'}`}>
                {totalDuration}s
              </span>
            </div>

            {/* Visual Style */}
            <div className="space-y-4">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Visual Aesthetic</label>
              <div className="grid grid-cols-2 gap-4">
                {(['realistic', 'illustration'] as VisualStyle[]).map((style) => (
                  <button
                    key={style}
                    onClick={() => onVisualStyleChange(style)}
                    className={`py-5 rounded-2xl border text-[11px] font-bold uppercase tracking-widest transition-all ${
                      visualStyle === style 
                        ? 'bg-amber-600 border-amber-500 text-black shadow-[0_0_30px_rgba(245,158,11,0.2)]' 
                        : 'bg-white/5 border-white/5 text-white/40 hover:border-white/20'
                    }`}
                  >
                    {style}
                  </button>
                ))}
              </div>
            </div>

            {/* Production Mode */}
            <div className="space-y-4">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Engine Mode</label>
              <div className="grid grid-cols-2 gap-4">
                {(['free', 'paid'] as ProductionMode[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => onProductionModeChange(mode)}
                    disabled={mode === 'paid' && !hasKey}
                    className={`py-5 rounded-2xl border text-[11px] font-bold uppercase tracking-widest transition-all ${
                      productionMode === mode 
                        ? 'bg-white text-black border-white shadow-[0_0_30px_rgba(255,255,255,0.15)]' 
                        : 'bg-white/5 border-white/5 text-white/40 hover:border-white/20'
                    } disabled:opacity-20 disabled:cursor-not-allowed`}
                  >
                    {mode === 'free' ? 'Standard' : 'Pro (Veo 3.1)'}
                  </button>
                ))}
              </div>
              {productionMode === 'paid' && !hasKey && (
                <p className="text-[9px] text-red-500 font-bold uppercase tracking-tighter">Please connect a paid key for Pro mode.</p>
              )}
            </div>
          </div>

          <div className="mt-12">
            <button 
              onClick={onClose}
              className="w-full py-6 bg-amber-600 border border-amber-500 text-black font-black rounded-full text-[12px] tracking-[0.4em] hover:bg-white hover:border-white transition-all shadow-xl"
            >
              APPLY PRODUCTION VALUES
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
