
import React, { useState, useEffect, useRef } from 'react';
import { Storyboard, Scene, TelopStyle, YouTubeMetadata } from '../types';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

// ==========================================
// 【重要】設定項目
// ==========================================
// 1. YouTube Data API の Client ID をここに入力してください
const YOUTUBE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID_HERE.apps.googleusercontent.com';
const YOUTUBE_SCOPES = 'https://www.googleapis.com/auth/youtube.upload';

// 2. デフォルトBGM（著作権フリー）
const BGM_URLS = {
  epic: "https://cdn.pixabay.com/audio/2023/12/04/audio_92425f3898.mp3",
  sad: "https://cdn.pixabay.com/audio/2023/11/24/audio_349d970e7e.mp3",
  peaceful: "https://cdn.pixabay.com/audio/2024/01/16/audio_034a74797a.mp3",
  suspense: "https://cdn.pixabay.com/audio/2024/02/06/audio_40914619d0.mp3"
};
// ==========================================

interface VideoPreviewProps {
  storyboard: Storyboard;
  onClose: () => void;
}

const VideoPreview: React.FC<VideoPreviewProps> = ({ storyboard, onClose }) => {
  const [currentSceneIndex, setCurrentSceneIndex] = useState(-2); // -2: Standby, -1: Intro, 0+: Scenes
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
  const audioDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const mediaRefs = useRef<(HTMLVideoElement | HTMLImageElement | null)[]>([]);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const animationFrameRef = useRef<number | null>(null);

  const [ytMeta, setYtMeta] = useState<YouTubeMetadata>({
    title: `${storyboard.subject}の衝撃的な真実`,
    description: `歴史の闇に葬られた${storyboard.subject}の物語。 #歴史 #雑学 #AI動画`,
    tags: `${storyboard.subject}, 歴史, AI`,
    privacyStatus: 'private'
  });

  // FFmpeg初期化
  useEffect(() => {
    const loadFFmpeg = async () => {
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
      const ffmpeg = ffmpegRef.current;
      try {
        await ffmpeg.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        });
        setFfmpegReady(true);
      } catch (err) {
        console.error("FFmpeg load failed:", err);
      }
    };
    loadFFmpeg();
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, []);

  // 音声デコード (Base64 PCM -> AudioBuffer)
  const decodePCM = (base64: string, ctx: AudioContext) => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const dataInt16 = new Int16Array(bytes.buffer);
    const buffer = ctx.createBuffer(1, dataInt16.length, 24000);
    const channelData = buffer.getChannelData(0);
    for (let i = 0; i < dataInt16.length; i++) channelData[i] = dataInt16[i] / 32768.0;
    return buffer;
  };

  const initAudioEngine = async () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 44100 });
      audioDestinationRef.current = audioContextRef.current.createMediaStreamDestination();
    }
    if (audioContextRef.current.state === 'suspended') await audioContextRef.current.resume();

    if (!bgmBufferRef.current) {
      const resp = await fetch(BGM_URLS[storyboard.bgm_style as keyof typeof BGM_URLS] || BGM_URLS.epic);
      const arrayBuffer = await resp.arrayBuffer();
      bgmBufferRef.current = await audioContextRef.current.decodeAudioData(arrayBuffer);
    }
  };

  const playNarration = (buffer: AudioBuffer) => {
    if (!audioContextRef.current || !audioDestinationRef.current) return;
    const source = audioContextRef.current.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContextRef.current.destination);
    source.connect(audioDestinationRef.current);
    source.start();
    return source;
  };

  const playBGM = () => {
    if (!audioContextRef.current || !bgmBufferRef.current || !audioDestinationRef.current) return;
    const source = audioContextRef.current.createBufferSource();
    source.buffer = bgmBufferRef.current;
    source.loop = true;
    const gain = audioContextRef.current.createGain();
    gain.gain.value = 0.12; // BGM音量
    source.connect(gain);
    gain.connect(audioContextRef.current.destination);
    gain.connect(audioDestinationRef.current);
    source.start();
    return source;
  };

  const startFullProduction = async () => {
    if (!ffmpegReady || isExporting) return;
    setIsExporting(true);
    setExportStep("リソース準備中...");
    setUploadStatus(null);
    recordedChunksRef.current = [];
    
    try {
      await initAudioEngine();
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      canvas.width = 1080;
      canvas.height = 1920;

      const videoStream = canvas.captureStream(30);
      const audioStream = audioDestinationRef.current!.stream;
      const combinedStream = new MediaStream([
        ...videoStream.getVideoTracks(),
        ...audioStream.getAudioTracks()
      ]);

      const recorder = new MediaRecorder(combinedStream, { mimeType: 'video/webm;codecs=vp9,opus' });
      recorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
      
      recorder.onstop = async () => {
        setExportStep("MP4変換中 (FFmpeg)...");
        const webmBlob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        const ffmpeg = ffmpegRef.current;
        
        await ffmpeg.writeFile('input.webm', await fetchFile(webmBlob));
        // 再生互換性を高めるために libx264 + aac + yuv420p で変換
        await ffmpeg.exec([
          '-i', 'input.webm',
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-pix_fmt', 'yuv420p',
          '-c:a', 'aac',
          '-b:a', '128k',
          'output.mp4'
        ]);

        const data = await ffmpeg.readFile('output.mp4');
        const mp4Blob = new Blob([data], { type: 'video/mp4' });
        setFinalVideoBlob(mp4Blob);
        
        // 自動ダウンロード
        const url = URL.createObjectURL(mp4Blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${storyboard.subject}_final.mp4`;
        a.click();
        
        setIsExporting(false);
        setExportStep("");
        setUploadStatus("書き出し完了！");
      };

      recorder.start();
      setIsPlaying(true);
      const bgmSource = playBGM();
      
      // シーン再生ループ
      setExportStep("録画中...");
      setCurrentSceneIndex(-1); // Intro
      renderLoop();

      await new Promise(r => setTimeout(r, 3500)); // Intro duration

      for (let i = 0; i < storyboard.scenes.length; i++) {
        setCurrentSceneIndex(i);
        const scene = storyboard.scenes[i];
        const audioBuffer = decodePCM(scene.audioUrl!, audioContextRef.current!);
        const narration = playNarration(audioBuffer);
        
        const media = mediaRefs.current[i];
        if (media instanceof HTMLVideoElement) {
          media.currentTime = 0;
          media.play().catch(() => {});
        }

        await new Promise(resolve => {
          narration!.onended = () => setTimeout(resolve, 800);
        });
      }

      setIsPlaying(false);
      recorder.stop();
      bgmSource?.stop();
    } catch (e) {
      console.error(e);
      setIsExporting(false);
      setExportStep("エラーが発生しました");
    }
  };

  const renderLoop = () => {
    const canvas = canvasRef.current;
    if (!canvas || !isPlaying) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (currentSceneIndex === -1) {
      // Intro Rendering
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#f59e0b';
      ctx.font = 'bold 120px "Noto Serif JP"';
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 30;
      ctx.fillText(storyboard.subject, canvas.width / 2, canvas.height / 2 - 100);
      ctx.fillStyle = 'white';
      ctx.font = 'bold 80px "Noto Serif JP"';
      ctx.fillText("の実は...", canvas.width / 2, canvas.height / 2 + 100);
      ctx.restore();
    } else if (currentSceneIndex >= 0) {
      const media = mediaRefs.current[currentSceneIndex];
      const scene = storyboard.scenes[currentSceneIndex];
      if (media) {
        // Fit image/video
        const vR = (media instanceof HTMLVideoElement ? media.videoWidth : (media as HTMLImageElement).naturalWidth) || 1080;
        const vH = (media instanceof HTMLVideoElement ? media.videoHeight : (media as HTMLImageElement).naturalHeight) || 1920;
        const ratio = Math.max(canvas.width / vR, canvas.height / vH);
        const nw = vR * ratio;
        const nh = vH * ratio;
        ctx.drawImage(media, (canvas.width - nw) / 2, (canvas.height - nh) / 2, nw, nh);

        // Telop
        ctx.save();
        ctx.textAlign = 'center';
        ctx.font = 'bold 70px "Noto Serif JP"';
        const lines = scene.telop.length > 15 ? [scene.telop.slice(0, 15), scene.telop.slice(15)] : [scene.telop];
        lines.forEach((line, i) => {
          const textWidth = ctx.measureText(line).width;
          ctx.fillStyle = scene.telop_style === TelopStyle.HIGHLIGHT ? 'rgba(180, 0, 0, 0.9)' : 'rgba(0, 0, 0, 0.8)';
          ctx.fillRect((canvas.width - textWidth - 60) / 2, canvas.height * 0.75 + (i * 110), textWidth + 60, 100);
          ctx.fillStyle = 'white';
          ctx.fillText(line, canvas.width / 2, canvas.height * 0.75 + 75 + (i * 110));
        });
        ctx.restore();
      }
    }
    animationFrameRef.current = requestAnimationFrame(renderLoop);
  };

  // YouTube Upload (Resumable)
  const handleYouTubeUpload = async () => {
    if (!finalVideoBlob) return;
    setIsUploading(true);
    setUploadStatus("Google認証中...");

    try {
      const client = (window as any).google.accounts.oauth2.initTokenClient({
        client_id: YOUTUBE_CLIENT_ID,
        scope: YOUTUBE_SCOPES,
        callback: async (tokenResp: any) => {
          if (tokenResp.error) {
            setUploadStatus("認証に失敗しました。");
            setIsUploading(false);
            return;
          }

          const accessToken = tokenResp.access_token;
          setUploadStatus("アップロード中...");

          // 1. メタデータを送信してアップロードURLを取得
          const metadata = {
            snippet: {
              title: ytMeta.title,
              description: ytMeta.description,
              tags: ytMeta.tags.split(',').map(s => s.trim()),
              categoryId: '22'
            },
            status: { privacyStatus: ytMeta.privacyStatus }
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

          const uploadUrl = initResp.headers.get('Location');
          if (!uploadUrl) throw new Error("Upload URL 取得失敗");

          // 2. バイナリデータをPUT
          const uploadResp = await fetch(uploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': 'video/mp4' },
            body: finalVideoBlob
          });

          if (uploadResp.ok) {
            setUploadStatus("YouTube公開完了！");
          } else {
            setUploadStatus("アップロードに失敗しました。");
          }
          setIsUploading(false);
        }
      });
      client.requestAccessToken();
    } catch (err) {
      console.error(err);
      setIsUploading(false);
      setUploadStatus("エラーが発生しました。");
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 backdrop-blur-xl overflow-y-auto">
      <canvas ref={canvasRef} className="hidden" />
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
        {/* Preview Screen */}
        <div className="relative aspect-[9/16] w-full max-w-[320px] mx-auto bg-black rounded-[2.5rem] overflow-hidden shadow-[0_0_50px_rgba(245,158,11,0.3)] border border-white/10">
          <div className="absolute inset-0">
            {currentSceneIndex === -1 ? (
              <div className="w-full h-full flex flex-col items-center justify-center bg-black">
                <h4 className="text-amber-500 font-bold text-4xl">{storyboard.subject}</h4>
                <p className="text-white text-xl mt-4">の実は...</p>
              </div>
            ) : currentSceneIndex >= 0 ? (
              storyboard.scenes.map((scene, idx) => (
                <div key={idx} className={`absolute inset-0 transition-opacity duration-500 ${idx === currentSceneIndex ? 'opacity-100' : 'opacity-0'}`}>
                  {scene.videoUrl && !scene.videoUrl.includes('data:image') ? (
                    <video ref={el => mediaRefs.current[idx] = el} src={scene.videoUrl} className="w-full h-full object-cover" muted playsInline />
                  ) : (
                    <img ref={el => mediaRefs.current[idx] = el} src={scene.imageUrl} className="w-full h-full object-cover" />
                  )}
                </div>
              ))
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-500 uppercase text-xs tracking-widest">Ready to Produce</div>
            )}
          </div>
          {isExporting && (
             <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center gap-4">
                <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent animate-spin rounded-full"></div>
                <span className="text-white text-[10px] uppercase font-black tracking-widest">{exportStep}</span>
             </div>
          )}
        </div>

        {/* Controls */}
        <div className="space-y-8">
          <div>
            <span className="text-amber-500 text-[10px] font-black uppercase tracking-widest mb-2 block">AI Video Studio</span>
            <h3 className="text-4xl font-serif-jp text-white mb-4">{storyboard.title}</h3>
            <p className="text-gray-400 font-serif-jp italic leading-relaxed">映像と音声をMP4へ完全合成します。このファイルはYouTubeやTikTok、スマホのギャラリーでそのまま再生可能です。</p>
          </div>

          {!showUploadForm ? (
            <div className="grid gap-4">
              <button onClick={startFullProduction} disabled={isExporting} className="bg-white text-black font-black py-6 rounded-full text-center hover:bg-amber-500 transition-all flex items-center justify-center gap-3">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                {isExporting ? "制作中..." : "制作してMP4を保存"}
              </button>
              <button onClick={() => setShowUploadForm(true)} className="bg-red-600 text-white font-black py-6 rounded-full text-center hover:bg-red-500 transition-all flex items-center justify-center gap-3 shadow-lg shadow-red-900/20">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z"/></svg>
                YouTubeにアップロード
              </button>
              <button onClick={onClose} className="text-white/30 text-[10px] font-black uppercase tracking-widest mt-4 hover:text-white transition-all text-center">Studioを閉じる</button>
            </div>
          ) : (
            <div className="bg-white/5 p-8 rounded-3xl border border-white/10 space-y-6">
              <h4 className="text-2xl font-serif-jp text-amber-500">YouTube設定</h4>
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] text-gray-500 uppercase tracking-widest ml-1">動画タイトル</label>
                  <input value={ytMeta.title} onChange={e => setYtMeta({...ytMeta, title: e.target.value})} className="w-full bg-black/50 border border-white/10 p-4 rounded-xl text-white outline-none focus:border-red-600" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-gray-500 uppercase tracking-widest ml-1">動画の説明</label>
                  <textarea rows={3} value={ytMeta.description} onChange={e => setYtMeta({...ytMeta, description: e.target.value})} className="w-full bg-black/50 border border-white/10 p-4 rounded-xl text-white outline-none focus:border-red-600" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <select value={ytMeta.privacyStatus} onChange={e => setYtMeta({...ytMeta, privacyStatus: e.target.value as any})} className="bg-black border border-white/10 p-4 rounded-xl text-white outline-none">
                    <option value="private">非公開</option>
                    <option value="unlisted">限定公開</option>
                    <option value="public">公開</option>
                  </select>
                  <button onClick={handleYouTubeUpload} disabled={isUploading || !finalVideoBlob} className="bg-red-600 text-white font-black rounded-xl hover:bg-red-500 transition-all disabled:opacity-50">
                    {isUploading ? "送信中..." : "アップロード"}
                  </button>
                </div>
                {!finalVideoBlob && <p className="text-[10px] text-amber-500 text-center">※先に「制作してMP4を保存」を完了させてください</p>}
                {uploadStatus && <p className="text-sm text-amber-500 text-center font-bold mt-2">{uploadStatus}</p>}
                <button onClick={() => setShowUploadForm(false)} className="text-gray-500 text-[10px] uppercase font-black block mx-auto pt-4">キャンセル</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VideoPreview;
