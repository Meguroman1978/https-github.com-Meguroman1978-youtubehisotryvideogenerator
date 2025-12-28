
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
      className={`group relative flex flex-col md:flex-row gap-6 p-6 rounded-lg transition-all duration-700 bg-gray-900/40 border ${
        isActive ? 'border-amber-500/50 shadow-lg shadow-amber-500/10' : 'border-gray-800 hover:border-gray-700'
      }`}
    >
      <div className="flex-none md:w-80 h-48 md:h-52 bg-black rounded-md overflow-hidden relative border border-gray-800">
        {scene.imageUrl ? (
          <img 
            src={scene.imageUrl} 
            alt={`Scene ${index + 1}`} 
            className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-4 text-gray-600">
            {isGenerating ? (
              <>
                <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent animate-spin rounded-full"></div>
                <span className="text-xs uppercase tracking-widest animate-pulse">Generating Visual...</span>
              </>
            ) : (
              <span className="text-xs uppercase tracking-widest">Image Pending</span>
            )}
          </div>
        )}
        
        {/* Overlay for Time Range */}
        <div className="absolute top-2 left-2 px-2 py-1 bg-black/70 text-[10px] text-gray-300 font-mono tracking-tighter rounded">
          {scene.time_range}
        </div>

        {/* Telop Preview in Image */}
        <div className="absolute bottom-4 left-0 right-0 px-4 text-center">
          <p className={`text-sm font-bold drop-shadow-lg inline-block px-2 py-0.5 rounded ${
            scene.telop_style === TelopStyle.HIGHLIGHT ? 'bg-red-600 text-white' : 'bg-black/60 text-white'
          }`}>
            {scene.telop}
          </p>
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-3 mb-4">
            <span className="text-3xl font-serif-jp text-amber-500/30 font-bold">#{index + 1}</span>
            <div className="h-[1px] flex-1 bg-gradient-to-r from-amber-500/20 to-transparent"></div>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="text-[10px] uppercase tracking-[0.2em] text-amber-500 mb-1 block opacity-60">Narration</label>
              <p className="text-lg leading-relaxed font-serif-jp text-gray-200">
                {scene.narration}
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] uppercase tracking-[0.2em] text-blue-400 mb-1 block opacity-60">Caption</label>
                <span className={`text-sm px-2 py-0.5 rounded ${
                  scene.telop_style === TelopStyle.HIGHLIGHT ? 'bg-red-900/30 text-red-300 border border-red-500/30' : 'bg-gray-800 text-gray-300'
                }`}>
                  {scene.telop}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6">
          <label className="text-[10px] uppercase tracking-[0.2em] text-gray-500 mb-1 block opacity-60 italic">Prompt Instruction</label>
          <p className="text-[11px] text-gray-500 font-mono bg-black/40 p-2 rounded line-clamp-2 hover:line-clamp-none transition-all cursor-default">
            {scene.image_prompt}
          </p>
        </div>
      </div>
    </div>
  );
};

export default SceneCard;
