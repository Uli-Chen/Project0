import { z } from "zod";

export const nameSchema = z.string().trim().min(1, "请填写你的名字。").max(40, "名字最多 40 个字符。");
export const emailSchema = z.string().trim().toLowerCase().max(254, "邮箱地址过长。").email("请输入有效的邮箱地址。");
export const passwordSchema = z.string().min(10, "密码至少需要 10 个字符。").max(128, "密码最多 128 个字符。");
export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1, "请输入密码。").max(128, "密码最多 128 个字符。") }).strict();
export const registerSchema = z.object({ name: nameSchema, email: emailSchema, password: passwordSchema }).strict();

const numericString = (values: string[]) => z.union([z.string(), z.number()]).transform(String).refine((value) => values.includes(value), "请选择有效的选项。");
const optionalWeeks = z.union([z.string(), z.number()]).transform(String).refine((value) => value === "" || (/^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 52), "准备时间应为 1～52 周。");
export const profilePatchSchema = z.object({
  name: nameSchema.optional(),
  target: numericString(["5", "5.0", "5.5", "6", "6.0", "6.5", "7", "7.0", "7.5", "8", "8.0", "8.5", "9", "9.0"]).transform((value) => Number(value).toFixed(1)).optional(),
  timeBy: z.enum(["date", "weeks"]).optional(),
  examDate: z.string().refine((value) => value === "" || (/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value), "请选择有效的考试日期。").optional(),
  weeks: optionalWeeks.optional(),
  level: z.enum(["未考过", "5 左右", "6 左右", "6.5 以上"]).optional(),
  perWeek: numericString(["1", "2", "3", "4", "5", "6", "7"]).optional(),
  minutes: numericString(["30", "45", "60", "90"]).optional(),
  difficulties: z.array(z.enum(["没想法", "想法说不清", "英文表达不出来", "语法错误多", "写不完"])).max(5).transform((values) => [...new Set(values)]).optional(),
  lang: z.enum(["zh", "en"]).optional(),
  explainLanguage: z.enum(["en", "zh"]).nullable().optional(),
  nudgesDefault: z.boolean().nullable().optional(),
  onboardingCompleted: z.boolean().optional(),
  excludedMemoryIds: z.array(z.string().max(200)).max(1000).transform((values) => [...new Set(values)]).optional(),
}).strict();
