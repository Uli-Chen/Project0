import type { Metadata } from "next";
import { MotionPreview } from "./preview";

export const metadata: Metadata = {
  title: "动效实验室",
  description: "与现有前端对齐的 25 组交互预览：背景图片流、基础反馈、导航浮层、写作教练、练习数据。",
  robots: { index: false, follow: false },
};

export default function MotionPreviewPage() {
  return <MotionPreview />;
}
