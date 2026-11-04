export type UserProfile = {
  target: string | null;
  timeBy: "date" | "weeks";
  examDate: string;
  weeks: string;
  level: string | null;
  perWeek: string | null;
  minutes: string | null;
  difficulties: string[];
  lang: "zh" | "en" | null;
  explainLanguage?: "en" | "zh" | null;
  nudgesDefault?: boolean | null;
  onboardingCompleted: boolean;
  excludedMemoryIds: string[];
};

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  profile: UserProfile;
  createdAt: string;
};

export const DEFAULT_PROFILE: UserProfile = {
  target: null,
  timeBy: "date",
  examDate: "",
  weeks: "",
  level: null,
  perWeek: null,
  minutes: null,
  difficulties: [],
  lang: null,
  explainLanguage: null,
  nudgesDefault: null,
  onboardingCompleted: false,
  excludedMemoryIds: [],
};
