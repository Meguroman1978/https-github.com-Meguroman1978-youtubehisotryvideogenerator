
import React, { useState, useEffect, useRef } from 'react';
import { Storyboard, Scene, TelopStyle, YouTubeMetadata } from '../types';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

// ==========================================
// YouTube API 設定 (必要に応じて書き換えてください)
// ==========================================
const YOUTUBE_CLIENT_ID = '675845579841-u90i60e5r18k3onq4r5f9r51q77a7b8h.apps.googleusercontent.com';
const YOUTUBE_SCOPES = 'https://www.googleapis.com/auth/youtube.upload';
// ==========================================

const BGM_URLS = {
  epic: "https://cdn.pixabay.com/audio/2023/12/04/audio_92425f3898.mp3",
  sad: "https://cdn.pixabay.com/audio/2023/11/24/audio_349d970e7e.mp3",
  peaceful: "https://cdn.pixabay.com/audio/2024/01/16/audio_034a74797a.mp3",
  suspense: "https://cdn.pixabay.com/audio/2024/02/06/audio_40914619d0.mp3"
};

interface VideoPreviewProps {
  storyboard: Storyboard;
  onClose: () => void;
}

const VideoPreview: React.FC<VideoPreviewProps> = ({ storyboard, onClose }) => {
  const [currentSceneIndex, setCurrentSceneIndex] = useState(-2); // -2: Ready, -1: Intro, 0+: Scenes
  const [isPlaying, setIsPlaying] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportStep, setExportStep] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [finalVideoBlob, setFinalVideoBlob] = useState<Blob | null>(null);
  const [ffmpegReady, setFfmpegReady] = useState(false);

  const ffmpegRef = useRef(new FFmpeg());
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const bgmBufferRef = useRef<AudioBuffer | null>(null);
  const bgmSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const narrationSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const mediaRefs = useRef<(HTMLVideoElement | HTMLImageElement | null)[]>([]);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const animationFrameRef = useRef<number | null>(null);

  const [ytMeta, setYtMeta] = useState<YouTubeMetadata>({
    title: `${storyboard.subject}の驚きの真実`,
    description: `歴史の教科書には載らない${storyboard.subject}の物語。#${storyboard.subject.replace(/\s+/g, '')} #歴史 #AI #ショート動画`,
    tags: `${storyboard.subject}, 歴史, 雑学`,
    privacyStatus: 'private'
  });

  useEffect(() => {
    let isMounted = true;
    const init = async () => {
      try {
        const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
        const ffmpeg = ffmpegRef.current;
        await ffmpeg.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        });
        if (isMounted) setFfmpegReady(true);
      } catch (e) {
        console.error("FFmpeg load failed:", e);
        if (isMounted) setFfmpegReady(false);
      }
    };
    init();

    return () => {
      isMounted = false;
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      stopAllAudio();
    };
  }, []);

  const stopAllAudio = () => {
    if (bgmSourceRef.current) { 
      try { bgmSourceRef.current.stop(); } catch(e){} 
      bgmSourceRef.current = null;
    }
    if (narrationSourceRef.current) { 
      try { narrationSourceRef.current.stop(); } catch(e){} 
      narrationSourceRef.current = null;
    }
  };

  const decodePCM = (base64: string, ctx: AudioContext) => {
    try {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const dataInt16 = new Int16Array(bytes.buffer);
      const buffer = ctx.createBuffer(1, dataInt16.length, 24000);
      const channelData = buffer.getChannelData(0);
      for (let i = 0; i < dataInt16.length; i++) channelData[i] = dataInt16[i] / 32768.0;
      return buffer;
    } catch (e) {
      console.error("PCM Decode Error", e);
      return ctx.createBuffer(1, 1, 24000);
    }
  };

  const initAudioEngine = async () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 44100 });
      audioDestinationRef.current = audioContextRef.current.createMediaStreamDestination();
    }
    if (audioContextRef.current.state === 'suspended') await audioContextRef.current.resume();

    if (!bgmBufferRef.current) {
      try {
        const resp = await fetch(BGM_URLS[storyboard.bgm_style as keyof typeof BGM_URLS] || BGM_URLS.epic);
        const arrayBuffer = await resp.arrayBuffer();
        bgmBufferRef.current = await audioContextRef.current.decodeAudioData(arrayBuffer);
      } catch (e) { 
        console.warn("BGM load fail", e); 
      }
    }
  };

  const playBGM = () => {
    if (!audioContextRef.current || !bgmBufferRef.current || !audioDestinationRef.current) return;
    const source = audioContextRef.current.createBufferSource();
    source.buffer = bgmBufferRef.current;
    source.loop = true;
    const gain = audioContextRef.current.createGain();
    gain.gain.value = 0.15;
    source.connect(gain);
    gain.connect(audioContextRef.current.destination);
    gain.connect(audioDestinationRef.current);
    source.start();
    bgmSourceRef.current = source;
  };

  const playSceneAudio = async (index: number) => {
    if (narrationSourceRef.current) {
      try { narrationSourceRef.current.stop(); } catch(e){}
    }
    if (!isPlaying) return;

    if (index === -1) {
      setTimeout(() => { if(isPlaying) setCurrentSceneIndex(0); }, 3500);
      return;
    }

    // Fix: Using storyboard.scenes instead of undefined scenes
    const scene = storyboard.scenes[index];
    if (!scene?.audioUrl || !audioContextRef.current || !audioDestinationRef.current) {
      setTimeout(() => { if(isPlaying) nextScene(index); }, 3000);
      return;
    }

    const buffer = decodePCM(scene.audioUrl, audioContextRef.current);
    const source = audioContextRef.current.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContextRef.current.destination);
    source.connect(audioDestinationRef.current);
    
    source.onended = () => {
      setTimeout(() => { if(isPlaying) nextScene(index); }, 800);
    };
    source.start();
    narrationSourceRef.current = source;
    
    const media = mediaRefs.current[index];
    if (media instanceof HTMLVideoElement) {
      media.currentTime = 0;
      media.play().catch(() => {});
    }
  };

  const nextScene = (index: number) => {
    // Fix: Using storyboard.scenes instead of undefined scenes
    if (index < storyboard.scenes.length - 1) {
      setCurrentSceneIndex(index + 1);
    } else {
      finishProduction();
    }
  };

  const finishProduction = () => {
    setIsPlaying(false);
    setTimeout(() => {
      if (recorderRef.current && recorderRef.current.state === 'recording') {
        recorderRef.current.stop();
      }
      stopAllAudio();
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    }, 1000);
  };

  const startFullProduction = async () => {
    if (isPlaying || isExporting) return;
    setIsExporting(true);
    setExportStep("リソース準備中...");
    setFinalVideoBlob(null);
    recordedChunksRef.current = [];
    
    try {
      await initAudioEngine();
      const canvas = canvasRef.current;
      if (!canvas || !audioDestinationRef.current) throw new Error("Canvas/Audio Engine not ready");
      
      canvas.width = 1080;
      canvas.height = 1920;

      const videoStream = canvas.captureStream(30);
      const audioStream = audioDestinationRef.current.stream;
      const combinedStream = new MediaStream([
        ...videoStream.getVideoTracks(),
        ...audioStream.getAudioTracks()
      ]);

      const recorder = new MediaRecorder(combinedStream, { 
        mimeType: 'video/webm;codecs=vp9,opus',
        videoBitsPerSecond: 8000000 
      });

      recorder.ondataavailable = (e) => { 
        if (e.data.size > 0) recordedChunksRef.current.push(e.data); 
      };

      recorder.onstop = async () => {
        setExportStep("MP4変換中 (FFmpeg)...");
        const webmBlob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        
        if (ffmpegReady) {
          try {
            const ffmpeg = ffmpegRef.current;
            await ffmpeg.writeFile('input.webm', await fetchFile(webmBlob));
            await ffmpeg.exec([
              '-i', 'input.webm',
              '-c:v', 'libx264',
              '-preset', 'ultrafast',
              '-crf', '22',
              '-c:a', 'aac',
              '-b:a', '128k',
              '-movflags', '+faststart',
              'output.mp4'
            ]);
            const data = await ffmpeg.readFile('output.mp4');
            const mp4Blob = new Blob([data], { type: 'video/mp4' });
            setFinalVideoBlob(mp4Blob);
            downloadBlob(mp4Blob, 'mp4');
          } catch (e) {
            console.error("FFmpeg failed", e);
            setFinalVideoBlob(webmBlob);
            downloadBlob(webmBlob, 'webm');
          }
        } else {
          setFinalVideoBlob(webmBlob);
          downloadBlob(webmBlob, 'webm');
        }
        
        setIsExporting(false);
        setExportStep("");
        setUploadStatus("書き出し完了！");
      };

      recorder.start();
      recorderRef.current = recorder;
      setIsPlaying(true);
      playBGM();
      setCurrentSceneIndex(-1);
      setExportStep("録画中...");
      renderLoop();
    } catch (e) {
      console.error("Production failure:", e);
      setIsExporting(false);
      setExportStep("");
    }
  };

  const downloadBlob = (blob: Blob, ext: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${storyboard.subject}_Cinematic.${ext}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  const renderLoop = () => {
    const canvas = canvasRef.current;
    if (!canvas || !isPlaying) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (currentSceneIndex === -1) {
      const firstMedia = mediaRefs.current[0];
      if (firstMedia) {
        ctx.save();
        ctx.filter = 'brightness(0.25) blur(20px)';
        ctx.drawImage(firstMedia, -100, -100, canvas.width + 200, canvas.height + 200);
        ctx.restore();
      }
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'black';
      ctx.shadowBlur = 50;
      ctx.fillStyle = '#f59e0b';
      ctx.font = 'bold 130px "Noto Serif JP"';
      ctx.fillText(storyboard.subject, canvas.width / 2, canvas.height / 2 - 120);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 70px "Noto Serif JP"';
      ctx.fillText(`の実は。。。`, canvas.width / 2, canvas.height / 2 + 100);
      ctx.restore();
    } else if (currentSceneIndex >= 0) {
      const media = mediaRefs.current[currentSceneIndex];
      if (media) {
        if (media instanceof HTMLVideoElement) {
          const vR = media.videoWidth / media.videoHeight;
          const cR = canvas.width / canvas.height;
          let dw, dh, dx, dy;
          if (vR > cR) { dh = canvas.height; dw = dh * vR; dx = (canvas.width - dw) / 2; dy = 0; }
          else { dw = canvas.width; dh = dw / vR; dx = 0; dy = (canvas.height - dh) / 2; }
          ctx.drawImage(media, dx, dy, dw, dh);
        } else {
          const time = Date.now() / 20000;
          const scale = 1.05 + (Math.sin(time) * 0.05);
          const dw = canvas.width * scale, dh = canvas.height * scale;
          ctx.drawImage(media, (canvas.width-dw)/2, (canvas.height-dh)/2, dw, dh);
        }
        // Fix: Using storyboard.scenes instead of undefined scenes
        const scene = storyboard.scenes[currentSceneIndex];
        ctx.save();
        ctx.font = 'bold 64px "Noto Serif JP"';
        ctx.textAlign = 'center';
        const lines = scene.telop.length > 15 ? [scene.telop.slice(0, 15), scene.telop.slice(15)] : [scene.telop];
        lines.forEach((line, i) => {
          const tw = ctx.measureText(line).width;
          ctx.fillStyle = scene.telop_style === TelopStyle.HIGHLIGHT ? 'rgba(220, 0, 0, 0.95)' : 'rgba(0, 0, 0, 0.85)';
          ctx.fillRect((canvas.width-tw-80)/2, canvas.height*0.8 - 60 + (i * 105), tw+80, 110);
          ctx.fillStyle = 'white';
          ctx.fillText(line, canvas.width/2, canvas.height*0.8 + 20 + (i * 105));
        });
        ctx.restore();
      }
    }
    animationFrameRef.current = requestAnimationFrame(renderLoop);
  };

  /**
   * Resumable Upload 方式による YouTube アップロード
   */
  const handleYouTubeUpload = async () => {
    if (!finalVideoBlob) {
      setUploadStatus("動画生成を先に完了させてください。");
      return;
    }

    setIsUploading(true);
    setUploadStatus("Google認証リクエスト中...");

    try {
      const client = (window as any).google.accounts.oauth2.initTokenClient({
        client_id: YOUTUBE_CLIENT_ID,
        scope: YOUTUBE_SCOPES,
        callback: async (tokenResp: any) => {
          if (tokenResp.error) {
            setUploadStatus("認証エラー: " + (tokenResp.error_description || tokenResp.error));
            setIsUploading(false);
            return;
          }

          const accessToken = tokenResp.access_token;
          
          try {
            // Step 1: Resumable アップロードのセッション開始
            setUploadStatus("アップロード準備中 (Session Start)...");
            const metadata = {
              snippet: {
                title: ytMeta.title,
                description: ytMeta.description,
                tags: ytMeta.tags.split(',').map(t => t.trim()),
                categoryId: '22'
              },
              status: {
                privacyStatus: ytMeta.privacyStatus,
                selfDeclaredMadeForKids: false
              }
            };

            const initResp = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json; charset=UTF-8',
                'X-Upload-Content-Length': finalVideoBlob.size.toString(),
                'X-Upload-Content-Type': 'video/mp4'
              },
              body: JSON.stringify(metadata)
            });

            if (!initResp.ok) {
              const errData = await initResp.json();
              throw new Error(`Session Error: ${errData.error?.message || initResp.statusText}`);
            }

            const uploadUrl = initResp.headers.get('Location');
            if (!uploadUrl) throw new Error("Upload URL not provided by Google API.");

            // Step 2: 実際のバイナリデータを送信
            setUploadStatus("ビデオデータを送信中...");
            const uploadResp = await fetch(uploadUrl, {
              method: 'PUT',
              headers: {
                'Content-Type': 'video/mp4',
                'Content-Length': finalVideoBlob.size.toString()
              },
              body: finalVideoBlob
            });

            if (uploadResp.ok) {
              setUploadStatus("アップロード成功！数分後にYouTubeで視聴可能になります。");
            } else {
              const errData = await uploadResp.json();
              throw new Error(`Upload Error: ${errData.error?.message || uploadResp.statusText}`);
            }
          } catch (e: any) {
            console.error("YouTube API Error:", e);
            setUploadStatus("APIエラー: " + e.message);
          } finally {
            setIsUploading(false);
          }
        }
      });
      client.requestAccessToken();
    } catch (e: any) {
      setUploadStatus("認証クライアント初期化エラー: " + e.message);
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/98 flex items-center justify-center p-4 backdrop-blur-3xl overflow-y-auto">
      <canvas ref={canvasRef} className="hidden" />
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-12 items-center py-10">
        <div className="relative w-full max-w-[320px] mx-auto aspect-[9/16] bg-[#020202] rounded-[3rem] overflow-hidden shadow-[0_0_100px_rgba(245,158,11,0.2)] border border-white/10">
          <div className="absolute inset-0">
            {currentSceneIndex === -1 ? (
              <div className="w-full h-full relative flex flex-col items-center justify-center text-center p-8 bg-black">
                {/* Fix: Using storyboard.scenes instead of undefined scenes */}
                {storyboard.scenes[0]?.imageUrl && (
                   <img src={storyboard.scenes[0].imageUrl} className="absolute inset-0 w-full h-full object-cover opacity-30 blur-[10px]" alt="bg" />
                )}
                <div className="relative z-10 flex flex-col items-center gap-2">
                  <span className="text-amber-500 font-bold text-5xl leading-tight drop-shadow-xl">{storyboard.subject}</span>
                  <span className="text-white font-bold text-2xl mt-10 opacity-90 drop-shadow-lg">の実は。。。</span>
                </div>
              </div>
            ) : currentSceneIndex >= 0 ? (
              // Fix: Using storyboard.scenes instead of undefined scenes
              storyboard.scenes.map((scene, idx) => (
                <div key={idx} className={`absolute inset-0 transition-opacity duration-1000 ${idx === currentSceneIndex ? 'opacity-100' : 'opacity-0'}`}>
                  {scene.videoUrl && !scene.videoUrl.includes('data:image') ? (
                    <video ref={el => mediaRefs.current[idx] = el} src={scene.videoUrl} className="w-full h-full object-cover" muted playsInline />
                  ) : (
                    <img ref={el => mediaRefs.current[idx] = el} src={scene.imageUrl} className="w-full h-full object-cover" alt={`scene-${idx}`} />
                  )}
                </div>
              ))
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center bg-black/50 text-center px-6">
                <span className="text-amber-500 font-black text-2xl mb-4 tracking-tighter">STUDIO READY</span>
                <p className="text-gray-500 text-[10px] uppercase tracking-widest leading-relaxed">
                  統合プロセスを開始します。<br/>下のボタンをクリックしてください。
                </p>
              </div>
            )}
          </div>
          {!isPlaying && !isExporting && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-md">
               <button onClick={startFullProduction} className="w-24 h-24 bg-amber-500 rounded-full flex items-center justify-center shadow-2xl hover:scale-110 transition-all group">
                 <svg className="w-12 h-12 ml-1 text-black group-hover:scale-110 transition-transform" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
               </button>
            </div>
          )}
        </div>

        <div className="space-y-10">
           <div>
              <span className="text-amber-500 font-black text-[10px] tracking-widest uppercase mb-4 block opacity-80">Professional Archive Studio</span>
              <h3 className="text-5xl font-serif-jp text-white italic tracking-tighter mb-4">{storyboard.title}</h3>
              <p className="text-gray-400 text-lg font-serif-jp italic leading-relaxed">
                映像・音声・BGMを標準MP4(H.264)へ統合。YouTube公開に最適化された解像度で書き出します。
              </p>
           </div>

           {!showUploadForm ? (
             <div className="flex flex-col gap-4">
                <button onClick={startFullProduction} disabled={isExporting} className="w-full bg-white text-black font-black py-6 rounded-full flex items-center justify-center gap-4 hover:bg-amber-500 transition-all shadow-xl disabled:opacity-50">
                   {isExporting ? <div className="w-5 h-5 border-2 border-black border-t-transparent animate-spin rounded-full"></div> : <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>}
                   {isExporting ? exportStep : '制作開始（MP4保存）'}
                </button>
                <button onClick={() => setShowUploadForm(true)} className="w-full bg-red-600 text-white font-black py-6 rounded-full flex items-center justify-center gap-4 hover:bg-red-500 transition-all shadow-xl">
                   <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z"/></svg>
                   YouTubeに公開する
                </button>
                <button onClick={onClose} className="text-white/30 text-[10px] uppercase font-black tracking-widest block mx-auto py-6 hover:text-white transition-all">Studioを閉じる</button>
             </div>
           ) : (
             <div className="bg-white/5 p-10 rounded-[3rem] border border-white/10 space-y-6 animate-in zoom-in-95">
                <h4 className="text-3xl font-serif-jp text-amber-500">YouTubeアップロード</h4>
                {isUploading ? (
                  <div className="py-10 text-center space-y-6">
                     <div className="w-12 h-12 border-4 border-red-600 border-t-transparent animate-spin rounded-full mx-auto"></div>
                     <p className="text-white font-bold">{uploadStatus}</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                     <div className="space-y-1">
                        <label className="text-[10px] text-gray-500 uppercase tracking-widest ml-2">タイトル</label>
                        <input value={ytMeta.title} onChange={e => setYtMeta({...ytMeta, title: e.target.value})} className="w-full bg-black/50 border border-white/10 p-4 rounded-xl outline-none focus:border-red-600" />
                     </div>
                     <div className="space-y-1">
                        <label className="text-[10px] text-gray-500 uppercase tracking-widest ml-2">説明</label>
                        <textarea rows={3} value={ytMeta.description} onChange={e => setYtMeta({...ytMeta, description: e.target.value})} className="w-full bg-black/50 border border-white/10 p-4 rounded-xl outline-none focus:border-red-600" />
                     </div>
                     <div className="grid grid-cols-2 gap-4">
                        <select value={ytMeta.privacyStatus} onChange={e => setYtMeta({...ytMeta, privacyStatus: e.target.value as any})} className="bg-black border border-white/10 p-4 rounded-xl text-white">
                           <option value="private">Private</option>
                           <option value="unlisted">Unlisted</option>
                           <option value="public">Public</option>
                        </select>
                        <button onClick={handleYouTubeUpload} className="bg-red-600 text-white font-black rounded-xl py-4 hover:bg-red-500 transition-all shadow-lg active:scale-95">UPLOAD</button>
                     </div>
                     {uploadStatus && <p className="text-[10px] text-amber-500 text-center mt-4">{uploadStatus}</p>}
                     <button onClick={() => setShowUploadForm(false)} className="text-gray-500 text-xs block mx-auto uppercase tracking-widest mt-6">キャンセル</button>
                  </div>
                )}
             </div>
           )}
        </div>
      </div>
    </div>
  );
};

export default VideoPreview;
