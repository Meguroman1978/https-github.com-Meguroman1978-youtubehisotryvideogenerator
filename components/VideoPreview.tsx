
import React, { useState, useEffect, useRef } from 'react';
import { Storyboard, TelopStyle } from '../types';

interface VideoPreviewProps {
  storyboard: Storyboard;
  onClose: () => void;
}

const VideoPreview: React.FC<VideoPreviewProps> = ({ storyboard, onClose }) => {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const recorderRef = useRef<any>(null);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    // コンポーネント起動と同時に自動開演
    const start = async () => {
      setIsRecording(true);
      if (audioRef.current && canvasRef.current) {
        canvasRef.current.width = 1080;
        canvasRef.current.height = 1920;
        
        // 黄金律: Streamの結合
        const vStream = (canvasRef.current as any).captureStream(30);
        const aStream = (audioRef.current as any).captureStream ? (audioRef.current as any).captureStream() : (audioRef.current as any).mozCaptureStream();
        
        const combined = new (window as any).MediaStream([
          ...vStream.getVideoTracks(),
          ...aStream.getAudioTracks()
        ]);

        const recorder = new (window as any).MediaRecorder(combined, { mimeType: 'video/webm;codecs=vp9,opus' });
        const chunks: Blob[] = [];
        recorder.ondataavailable = (e: any) => chunks.push(e.data);
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: 'video/webm' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${storyboard.subject}_Cinematic.webm`;
          a.click();
          onClose();
        };

        recorderRef.current = recorder;
        recorder.start();
        
        playNext(0);
        requestAnimationFrame(renderLoop);
      }
    };
    setTimeout(start, 1000);
    return () => cancelAnimationFrame(frameRef.current);
  }, []);

  const playNext = (idx: number) => {
    if (idx >= storyboard.scenes.length) {
      recorderRef.current?.stop();
      return;
    }
    setCurrentIdx(idx);
    if (audioRef.current) {
      audioRef.current.src = storyboard.scenes[idx].audioUrl || '';
      audioRef.current.play();
    }
  };

  const renderLoop = () => {
    const canvas = canvasRef.current;
    const audio = audioRef.current;
    if (!canvas || !audio) return;
    const ctx = canvas.getContext('2d')!;
    
    const scene = storyboard.scenes[currentIdx];
    const img = document.getElementById(`scene-img-${currentIdx}`) as HTMLImageElement;
    
    // 背景描画
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 1080, 1920);

    if (img && img.complete) {
      const p = audio.currentTime / (audio.duration || 1);
      const scale = 1.0 + p * 0.1;
      ctx.save();
      ctx.translate(540, 960);
      ctx.scale(scale, scale);
      ctx.translate(-540, -960);
      
      const iw = img.naturalWidth;
      const ih = img.naturalHeight;
      const aspect = iw / ih;
      const targetAspect = 1080 / 1920;
      
      let dw, dh, dx, dy;
      if (aspect > targetAspect) {
        dh = 1920; dw = 1920 * aspect; dx = (1080 - dw) / 2; dy = 0;
      } else {
        dw = 1080; dh = 1080 / aspect; dx = 0; dy = (1920 - dh) / 2;
      }
      ctx.drawImage(img, dx, dy, dw, dh);
      ctx.restore();
    }

    // テロップ
    if (scene.telop) {
      ctx.fillStyle = scene.telop_style === TelopStyle.HIGHLIGHT ? 'rgba(180,0,0,0.9)' : 'rgba(0,0,0,0.8)';
      ctx.fillRect(80, 1400, 920, 240);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 50px "Shippori Mincho"';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(scene.telop, 540, 1520);
    }

    frameRef.current = requestAnimationFrame(renderLoop);
  };

  return (
    <div className="fixed inset-0 z-[1000] bg-black flex items-center justify-center">
      <div className="relative aspect-[9/16] h-[90vh] bg-zinc-900 shadow-2xl border border-white/10 rounded-3xl overflow-hidden">
        <canvas ref={canvasRef} className="w-full h-full object-contain" />
        <div className="absolute top-8 left-8 flex items-center gap-3">
          <div className="w-3 h-3 bg-red-600 rounded-full animate-pulse" />
          <span className="text-[10px] font-black tracking-widest text-white uppercase">Auto-Recording...</span>
        </div>
      </div>
      <audio ref={audioRef} onEnded={() => playNext(currentIdx + 1)} className="hidden" />
      <div className="hidden">
        {storyboard.scenes.map((s, i) => (
          <img key={i} id={`scene-img-${i}`} src={s.imageUrl} crossOrigin="anonymous" />
        ))}
      </div>
    </div>
  );
};

export default VideoPreview;
