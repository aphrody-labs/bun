// Real WinRT calls through the generated families (Windows only): bun scripts/aphrody/winrt/calls.ts
const P = require("node:path").join(import.meta.dir, "../../../packages/") + "/";
const profile = require(P + "bun-windows-winrt-windows-system-profile");
const xml = require(P + "bun-windows-winrt-windows-data-xml-dom");
const notifications = require(P + "bun-windows-winrt-windows-ui-notifications");
const storage = require(P + "bun-windows-winrt-windows-storage");
const info = profile.AnalyticsInfo.VersionInfo;
console.log("System.Profile DeviceFamily:", info.DeviceFamily, "version:", info.DeviceFamilyVersion);
console.log("System.Profile DeviceForm:", profile.AnalyticsInfo.DeviceForm);
const doc = notifications.ToastNotificationManager.GetTemplateContent(notifications.ToastTemplateType.ToastText01);
console.log("UI.Notifications template:", doc.runtimeClassName, doc.as("Windows.Data.Xml.Dom.IXmlNodeSerializer").GetXml());
const paths = storage.UserDataPaths.GetDefault();
console.log("Storage UserDataPaths.Documents:", paths.Documents, "LocalAppData:", paths.LocalAppData);
console.log("Storage SystemDataPaths.Windows:", storage.SystemDataPaths.GetDefault().Windows);
