
import React from 'react';
import { Scene, TelopStyle } from '../types';

interface SceneCardProps {
  scene: Scene;
  index: number;
  isGenerating: boolean;
  isActive: boolean;
}

const SceneCard: React.FC<SceneCardProps> = ({ scene, index, isGenerating, isActive }) => {
  return (
    <div 
      className={`group relative flex flex-col md:flex-row gap-8 p-8 rounded-[2.5rem] transition-all duration-700 bg-[#0a0a0a] border ${
        scene.error 
          ? 'border-red-600/50 bg-red-950/10 shadow-[0_0_30px_rgba(239,68,68,0.15)]' 
          : isActive 
            ? 'border-amber-500 shadow-[0_0_40px_rgba(245,158,11,0.15)]' 
            : 'border-white/5 hover:border-white/20'
      }`}
    >
      {/* Cost Badge */}
      {scene.estimatedCost !== undefined && !scene.error && (
        <div className="absolute -top-3 -right-3 z-20 bg-black border border-amber-500/50 px-5 py-2 rounded-2xl shadow-2xl animate-in zoom-in duration-300">
          <div className="flex flex-col items-center">
            <span className="text-[8px] text-amber-500/60 font-black uppercase tracking-tighter">Est. Asset Cost</span>
            <span className="text-sm font-mono text-amber-500 font-bold">${scene.estimatedCost.toFixed(3)}</span>
          </div>
        </div>
      )}

      {/* Error Badge */}
      {scene.error && (
        <div className="absolute -top-4 -right-4 z-20 bg-red-600 px-5 py-3 rounded-2xl shadow-2xl border border-red-400 animate-in bounce-in duration-500">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12"/></svg>
            <span className="text-[10px] text-white font-black uppercase tracking-widest">Production Error</span>
          </div>
        </div>
      )}

      <div className={`flex-none md:w-96 h-56 md:h-64 bg-black rounded-3xl overflow-hidden relative border-2 ${scene.error ? 'border-red-500/40' : 'border-white/10'}`}>
        {scene.imageUrl ? (
          <img 
            src={scene.imageUrl} 
            alt={`Scene ${index + 1}`} 
            className={`w-full h-full object-cover transition-transform duration-[3000ms] group-hover:scale-110 ${scene.error ? 'opacity-30 grayscale saturate-50' : ''}`}
            style={{ imageRendering: 'auto' }}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-4 text-gray-700 bg-gray-900/20">
            {isGenerating ? (
              <>
                <div className="w-10 h-10 border-3 border-amber-500 border-t-transparent animate-spin rounded-full"></div>
                <span className="text-[10px] uppercase tracking-widest font-black animate-pulse text-amber-500/60">Crafting Vision...</span>
              </>
            ) : scene.error ? (
              <div className="flex flex-col items-center gap-3 p-6 text-center">
                <svg className="w-10 h-10 text-red-500/30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                <span className="text-[9px] uppercase tracking-widest font-black text-red-500/40 leading-relaxed">Resource Unavailable</span>
              </div>
            ) : (
              <span className="text-[10px] uppercase tracking-widest font-black opacity-20">Asset Pending</span>
            )}
          </div>
        )}
        
        {/* Time Stamp */}
        <div className="absolute top-4 left-4 px-4 py-1.5 bg-black/80 backdrop-blur-sm text-[11px] text-amber-500 font-mono tracking-tighter rounded-xl border border-amber-500/20">
          {scene.time_range}
        </div>

        {/* Telop Snippet */}
        {!scene.error && scene.telop && (
          <div className="absolute bottom-5 left-0 right-0 px-6 text-center">
            <p className={`text-xs font-bold inline-block px-5 py-2.5 rounded-xl shadow-2xl border ${
              scene.telop_style === TelopStyle.HIGHLIGHT ? 'bg-red-800 border-red-500 text-white' : 'bg-black/90 border-white/20 text-white'
            }`}>
              {scene.telop}
            </p>
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col justify-between py-2">
        <div className="space-y-6">
          <div className="flex items-center gap-5">
            <span className={`text-5xl font-serif-jp ${scene.error ? 'text-red-500/20' : 'text-amber-500/20'} font-black italic`}>{String(index + 1).padStart(2, '0')}</span>
            <div className={`h-[1px] flex-1 ${scene.error ? 'bg-gradient-to-r from-red-500/20 to-transparent' : 'bg-gradient-to-r from-amber-500/20 to-transparent'}`}></div>
          </div>
          
          <div className="space-y-5">
            <div>
              <label className={`text-[10px] uppercase tracking-widest ${scene.error ? 'text-red-500/50' : 'text-amber-500/50'} mb-2 block font-black`}>Narration Script</label>
              <p className={`text-xl leading-relaxed font-serif-jp ${scene.error ? 'text-white/40' : 'text-white opacity-90'}`}>
                {scene.narration}
              </p>
            </div>
            
            {scene.error && (
              <div className="bg-red-950/40 border-l-4 border-red-500 p-5 rounded-r-2xl">
                <label className="text-[9px] uppercase tracking-widest text-red-400 font-black block mb-2">Issue Detected</label>
                <p className="text-sm text-red-200 font-serif-jp leading-relaxed italic">
                  {scene.error}
                </p>
              </div>
            )}
          </div>
        </div>

        {!scene.error && (
          <div className="mt-8 bg-white/[0.02] p-5 rounded-2xl border border-white/5">
            <label className="text-[9px] uppercase tracking-widest text-gray-600 mb-2 block font-black">Directing Prompt</label>
            <p className="text-[11px] text-gray-400 font-mono leading-relaxed line-clamp-2 italic opacity-60">
              {scene.image_prompt}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SceneCard;
