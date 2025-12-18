import { GoogleGenAI } from "@google/genai";
import { TimelineItem, WeeklySummary } from '../types';

const getAiClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.warn("API Key is missing. Mocking AI response.");
    return null;
  }
  return new GoogleGenAI({ apiKey });
};

export const generateWeeklySummary = async (items: TimelineItem[]): Promise<WeeklySummary> => {
  const ai = getAiClient();

  if (!ai) {
    return {
      summary: "API Key 未设置。请配置 API_KEY 以启用 AI 功能。",
      keyAchievements: ["数据已保存本地", "等待配置 AI"],
      suggestions: "去 Google AI Studio 获取 Key。"
    };
  }

  // Format Items
  const logsText = items.map(item => `[${item.date} ${item.timeLabel}] ${item.content}`).join('\n');

  const prompt = `
    你是一个私人工作助理。请阅读以下按时间顺序排列的工作日志片段（Micro-Journaling），生成一份结构化的周报。
    
    输出必须是纯 JSON 格式。
    {
      "summary": "一段流畅的叙述性总结 (50-100字)",
      "keyAchievements": ["提取出的主要成就1", "提取出的主要成就2", "提取出的主要成就3"],
      "suggestions": "基于工作模式的一句简短建议"
    }

    日志流:
    ${logsText}
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json'
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response");

    return JSON.parse(text) as WeeklySummary;

  } catch (error) {
    console.error("Gemini API Error:", error);
    return {
      summary: "生成摘要时遇到错误。",
      keyAchievements: [],
      suggestions: "请稍后重试。"
    };
  }
};