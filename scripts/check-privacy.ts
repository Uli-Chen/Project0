import { privacyNotice } from "../lib/privacy/notice";
if (privacyNotice().includes("【待定")) { console.error("隐私说明尚有待定项，不能部署。"); process.exitCode = 1; }
else console.log("隐私说明发布检查通过。");
