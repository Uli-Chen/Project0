import { OnboardingForm } from "@/components/pages/onboarding-form";
import { requireUser } from "@/lib/auth/server";

export default async function OnboardingPage() {
  const user = await requireUser();
  return <OnboardingForm initial={user.profile} />;
}
