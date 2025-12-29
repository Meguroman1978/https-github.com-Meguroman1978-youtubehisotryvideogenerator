
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { Storyboard, Scene, VisualStyle, ProductionMode } from "../types";

const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY as string });

// PCM 16bit/24kHz/Mono を標準WAV Blobに変換
const pcmToWavBlobUrl = (base64Pcm: string): string => {
  const binary = atob(base64Pcm);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);

  const sampleRate = 24000;
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const writeString = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + len, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, len, true);

  return URL.createObjectURL(new Blob([header, bytes], { type: 'audio/wav' }));
};

export const generateStoryboard = async (
  topic: string, 
  visualStyle: VisualStyle, 
  sceneCount: number, 
  sceneDuration: number,
  mode: ProductionMode
): Promise<Storyboard> => {
  const ai = getAI();
  const totalSeconds = sceneCount * sceneDuration;
  
  // Use Flash for standard mode to avoid 429 errors on free projects, Pro for Paid mode
  const modelName = mode === 'paid' ? 'gemini-3-pro-preview' : 'gemini-3-flash-preview';
  
  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: `歴史的な出来事「${topic}」について、感動的なショート動画脚本を作成してください。
      
制約事項:
1. 全体で${sceneCount}つのシーンで構成すること。
2. 各シーンの長さは約${sceneDuration}秒とし、合計で${totalSeconds}秒程度の構成にすること。
3. 歴史的に正確でありつつ、視聴者の感情に訴えかけるナレーションを日本語で作成すること。`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            subject: { type: Type.STRING },
            scenes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  time_range: { type: Type.STRING, description: "例: 00:00 - 00:10" },
                  narration: { type: Type.STRING },
                  image_prompt: { type: Type.STRING, description: "詳細な画像生成用英語プロンプト" },
                  telop: { type: Type.STRING, description: "画面に表示する印象的な短いフレーズ" },
                  telop_style: { type: Type.STRING, enum: ["default", "highlight"] }
                }
              }
            }
          }
        }
      }
    });
    const data = JSON.parse(response.text || '{}');
    data.visual_style = visualStyle;
    return data as Storyboard;
  } catch (error: any) {
    // If Pro fails with quota, throw specific error to trigger API key selection
    if (error.message?.includes('429') || error.message?.includes('quota')) {
      throw new Error(`QUOTA_EXHAUSTED: ${modelName} has hit a limit. Please connect a paid API key in settings.`);
    }
    throw error;
  }
};

export const generateImageForScene = async (prompt: string, style: VisualStyle): Promise<string> => {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: { parts: [{ text: `${prompt}, cinematic, historical accurate, highly detailed, ${style}` }] },
    config: { imageConfig: { aspectRatio: "9:16" } }
  });
  const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
  if (!part?.inlineData) throw new Error("Image generation failed");
  const blob = await (await fetch(`data:image/png;base64,${part.inlineData.data}`)).blob();
  return URL.createObjectURL(blob);
};

export const generateAudioForScene = async (text: string): Promise<string> => {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
    },
  });
  const data = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!data) throw new Error("Audio generation failed");
  return pcmToWavBlobUrl(data);
};
