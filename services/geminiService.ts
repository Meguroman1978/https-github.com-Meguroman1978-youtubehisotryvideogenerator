
import { GoogleGenAI, Type, Modality, GenerateContentResponse } from "@google/genai";
import { Storyboard, Scene, TelopStyle, VisualStyle } from "../types";

const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY as string });

const withRetry = async <T>(fn: () => Promise<T>, retries = 3, delay = 5000): Promise<T> => {
  try {
    return await fn();
  } catch (error: any) {
    if (retries > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
      return withRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
};

// 外部の無料画像生成ツールへのフォールバック
const generateFallbackImage = async (prompt: string): Promise<string> => {
  console.log("Gemini quota reached or error. Falling back to Pollinations AI...");
  const seed = Math.floor(Math.random() * 1000000);
  const encodedPrompt = encodeURIComponent(`${prompt}, high quality, cinematic, 9:16 aspect ratio`);
  const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1080&height=1920&nologo=true&seed=${seed}&model=flux`;
  
  const response = await fetch(imageUrl);
  const blob = await response.blob();
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
};

export const generateStoryboard = async (topic: string, visualStyle: VisualStyle): Promise<Storyboard> => {
  const ai = getAI();
  const prompt = `Create a witty historical documentary storyboard about: ${topic}. EXACTLY 5 scenes. Output ONLY JSON.
  Instructions:
  - Scenes should tell a cohesive story.
  - Image prompts should be detailed.
  - Narration should be engaging.
  - telop_style must be 'default' or 'highlight'.
  - bgm_style must be 'epic', 'sad', 'peaceful', or 'suspense'.`;

  const response: GenerateContentResponse = await withRetry(() => ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
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
  try {
    const ai = getAI();
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: { parts: [{ text: `${prompt}, style: ${style}` }] },
      config: { imageConfig: { aspectRatio: "9:16" } }
    });

    const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    if (part?.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
    throw new Error("Gemini Image data missing");
  } catch (error) {
    console.error("Gemini Image generation failed:", error);
    // クォータ制限やエラー時は代替ツールを使用
    return await generateFallbackImage(prompt);
  }
};

export const generateVideoForScene = async (base64Image: string, motionPrompt: string): Promise<string> => {
  try {
    const ai = getAI();
    const pureBase64 = base64Image.split(',')[1];
    let operation: any = await ai.models.generateVideos({
      model: 'veo-3.1-fast-generate-preview',
      prompt: motionPrompt,
      image: { imageBytes: pureBase64, mimeType: 'image/png' },
      config: { numberOfVideos: 1, resolution: '1080p', aspectRatio: '9:16' }
    });
    
    while (!operation.done) {
      await new Promise(resolve => setTimeout(resolve, 10000));
      operation = await ai.operations.getVideosOperation({ operation: operation });
    }
    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  } catch (error) {
    console.error("Veo generation failed, using static image as fallback:", error);
    // 動画生成が失敗（クォータ制限等）した場合は、画像をそのまま返す（App.tsx側で対応）
    throw error;
  }
};

export const generateAudioForScene = async (text: string): Promise<{ audioUrl: string, duration: number }> => {
  const ai = getAI();
  const response: GenerateContentResponse = await withRetry(() => ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
    },
  }));
  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  // durationの概算（日本語の読み上げ速度に基づく）
  const estimatedDuration = text.length * 0.25;
  return { audioUrl: base64Audio || "", duration: estimatedDuration };
};
