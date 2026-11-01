import { countWords } from "./text";

/** 05_提交与检查 第 3 节：按顺序检查，返回第一个不通过的原因；通过返回 null。 */
export function checkInput(text: string, prompt: string, essayKind: "original" | "revision", originalText?: string): string | null {
  if (!text.trim()) return "作文是空的。";
  if (text.length > 20000) return "内容过长，请检查是否粘贴了多余内容。";
  const letters = text.match(/\p{L}/gu) ?? [];
  const latin = letters.filter((ch) => /[A-Za-z]/.test(ch)).length;
  if (letters.length && latin / letters.length < 0.8) return "作文需要用英文写。中文想法可以在教练面板里先说。";
  if (countWords(text) < 50) return "至少写 50 词才能评估。";
  const words = (s: string) => s.toLowerCase().match(/[a-z]+(?:['’-][a-z]+)*/g) ?? [];
  const promptWords = new Set(words(prompt));
  const essayWords = words(text);
  if (essayWords.length && essayWords.filter((w) => promptWords.has(w)).length / essayWords.length > 0.8) {
    return "看起来主要是题目内容，请写出你的回答。";
  }
  const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
  if (essayKind === "revision" && originalText != null && normalize(text) === normalize(originalText)) {
    return "改写稿和原稿一样，先做一些修改吧。";
  }
  return null;
}
