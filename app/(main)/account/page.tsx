import { privacyNoticeVisible, readFeatures } from "@/lib/config/features";
import type { Metadata } from "next";
import { AccountSettings } from "@/components/account/account-settings";
import { requireUser } from "@/lib/auth/server";

export const metadata: Metadata = { title: "账户" };

export default async function AccountPage() {
  const user = await requireUser();
  return <AccountSettings user={user} tutorV2Enabled={readFeatures().TUTOR_V2_ENABLED} privacyVisible={privacyNoticeVisible()} />;
}
