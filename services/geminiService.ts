
import { GoogleGenAI, Type, Modality, GenerateContentResponse } from "@google/genai";
import { Storyboard, Scene, TelopStyle, VisualStyle } from "../types";

const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY as string });

const withRetry = async <T>(fn: () => Promise<T>, retries = 3, delay = 5000): Promise<T> => {
  try {
    return await fn();
  } catch (error: any) {
    const errorMsg = error.message || "";
    const errorStatus = error.status || "";
    
    if (errorMsg.includes("Requested entity was not found") || errorMsg.includes("API_KEY_INVALID")) {
      if (window.aistudio?.openSelectKey) {
        await window.aistudio.openSelectKey();
      }
      throw new Error("APIキーが無効、または未選択です。再設定してください。");
    }

    const isQuotaError = errorMsg.includes('429') || 
                        errorStatus === 'RESOURCE_EXHAUSTED' || 
                        error.status === 429 || 
                        errorMsg.includes('Quota exceeded');

    if (isQuotaError) {
      if (errorMsg.includes('limit: 0') || errorMsg.includes('per_day') || errorMsg.includes('daily limit')) {
        throw new Error("1日あたりのAPI利用制限（クォータ）に達しました。Flashモデルに変更しましたが、プロジェクトの設定で課金が有効でない場合、制限が厳しいことがあります。Google AI Studioでプランを確認してください。");
      }

      if (retries > 0) {
        console.warn(`Quota hit, retrying in ${delay}ms... (Remaining retries: ${retries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return withRetry(fn, retries - 1, delay * 2);
      }
      throw new Error("APIの利用制限に達しました。しばらく時間を置いてから再度お試しください。");
    }
    
    throw error;
  }
};

export const generateStoryboard = async (topic: string, visualStyle: VisualStyle): Promise<Storyboard> => {
  const ai = getAI();
  const prompt = `Create a witty historical documentary storyboard about: ${topic}.
  
  CORE RULES:
  1. SCOPE: Historical facts, figures, or legends.
  2. STYLE: Witty, slightly humorous, but deeply insightful.
  3. STRUCTURE: Exactly 5 scenes.
  4. LANGUAGE: Japanese narration/telops, detailed English image/motion prompts.
  5. SAFETY: Avoid any violence, hate speech, or sensitive content.
  6. IMAGE PROMPTS: Must be descriptive, cinematic.
  7. VISUAL STYLE: ${visualStyle === 'illustration' ? 'High-quality Japanese anime art' : 'Photorealistic cinematic historical reconstruction'}.`;

  // Flashモデルに変更することで制限を回避しやすくする
  const response: GenerateContentResponse = await withRetry(() => ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      systemInstruction: `You are an expert film director. Visual style: ${visualStyle}. Output JSON only. 'subject' is the short name of the figure. 'motion_prompt' must describe dynamic camera movements.`,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          subject: { type: Type.STRING },
          bgm_style: { type: Type.STRING },
          scenes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                time_range: { type: Type.STRING },
                narration: { type: Type.STRING },
                image_prompt: { type: Type.STRING },
                motion_prompt: { type: Type.STRING },
                telop: { type: Type.STRING },
                telop_style: { type: Type.STRING }
              },
              required: ["time_range", "narration", "image_prompt", "motion_prompt", "telop", "telop_style"]
            }
          }
        },
        required: ["title", "subject", "bgm_style", "scenes"]
      }
    }
  }));

  const data = JSON.parse(response.text || '{}');
  data.visual_style = visualStyle;
  return data as Storyboard;
};

export const generateImageForScene = async (prompt: string, style: VisualStyle): Promise<string> => {
  const ai = getAI();
  const styleInstruction = style === 'illustration' 
    ? "Masterpiece, high-quality Japanese anime illustration, hand-drawn art."
    : "8k resolution, photorealistic cinematic movie frame, historical atmosphere.";

  const response: GenerateContentResponse = await withRetry(() => ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: { parts: [{ text: `Create an image for this historical scene: ${prompt}. Style: ${styleInstruction}` }] },
    config: { imageConfig: { aspectRatio: "9:16" } }
  }));

  const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
  if (part?.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
  throw new Error("画像生成に失敗しました。");
};

export const generateVideoForScene = async (base64Image: string, motionPrompt: string): Promise<string> => {
  const ai = getAI();
  const pureBase64 = base64Image.split(',')[1];
  
  let operation: any = await withRetry(() => ai.models.generateVideos({
    model: 'veo-3.1-fast-generate-preview',
    prompt: `${motionPrompt}. Cinematic camera motion.`,
    image: { imageBytes: pureBase64, mimeType: 'image/png' },
    config: { numberOfVideos: 1, resolution: '1080p', aspectRatio: '9:16' }
  }));

  while (!operation.done) {
    await new Promise(resolve => setTimeout(resolve, 10000));
    operation = await ai.operations.getVideosOperation({ operation: operation });
  }

  const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
  if (!downloadLink) throw new Error("ビデオ生成に失敗しました。");
  const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
  const blob = await response.blob();
  return URL.createObjectURL(blob);
};

export const generateAudioForScene = async (text: string): Promise<{ audioUrl: string, duration: number }> => {
  const ai = getAI();
  const response: GenerateContentResponse = await withRetry(() => ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: `ナレーション：${text}` }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
    },
  }));

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) throw new Error("音声生成に失敗しました。");
  return { audioUrl: base64Audio, duration: Math.max(text.length * 0.18, 5) };
};
