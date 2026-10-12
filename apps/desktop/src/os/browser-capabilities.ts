// SPDX-License-Identifier: Apache-2.0
export type BrowserCapability =
  | "files"
  | "directory"
  | "camera"
  | "microphone"
  | "screen"
  | "location"
  | "notifications"
  | "clipboard"
  | "usb"
  | "hid"
  | "serial"
  | "bluetooth"
  | "fullscreen"
  | "storage"
  | "gpu";

interface Chooser {
  requestDevice(options: object): Promise<unknown>;
}
interface BrowserExtensions {
  usb?: Chooser;
  hid?: Chooser;
  serial?: { requestPort(): Promise<unknown> };
  bluetooth?: Chooser;
  gpu?: { requestAdapter(): Promise<{ features: ReadonlySet<string> } | null> };
}
interface FilePickerWindow {
  showOpenFilePicker?: (options: object) => Promise<FileSystemFileHandle[]>;
  showDirectoryPicker?: (options: object) => Promise<FileSystemDirectoryHandle>;
}

export const CAPABILITY_LABELS: Record<BrowserCapability, string> = {
  files: "Importer des fichiers dans le stockage local",
  directory: "Choisir un dossier en lecture",
  camera: "Tester la caméra",
  microphone: "Tester le microphone",
  screen: "Choisir un écran à partager",
  location: "Afficher ma position",
  notifications: "Autoriser les notifications",
  clipboard: "Lire la taille du texte du presse-papiers",
  usb: "Choisir un périphérique USB",
  hid: "Choisir un périphérique HID",
  serial: "Choisir un port série",
  bluetooth: "Choisir un périphérique Bluetooth",
  fullscreen: "Passer en plein écran",
  storage: "Demander la conservation du stockage local",
  gpu: "Inspecter WebGPU",
};

export function browserCapabilityAvailable(id: BrowserCapability): boolean {
  const extra = navigator as Navigator & BrowserExtensions;
  const picker = window as Window & FilePickerWindow;
  switch (id) {
    case "files":
      return !!picker.showOpenFilePicker && !!navigator.storage?.getDirectory;
    case "directory":
      return !!picker.showDirectoryPicker;
    case "camera":
    case "microphone":
      return !!navigator.mediaDevices?.getUserMedia;
    case "screen":
      return !!navigator.mediaDevices?.getDisplayMedia;
    case "location":
      return !!navigator.geolocation;
    case "notifications":
      return "Notification" in window;
    case "clipboard":
      return !!navigator.clipboard?.readText;
    case "usb":
      return !!extra.usb;
    case "hid":
      return !!extra.hid;
    case "serial":
      return !!extra.serial;
    case "bluetooth":
      return !!extra.bluetooth;
    case "fullscreen":
      return document.fullscreenEnabled;
    case "storage":
      return !!navigator.storage?.persist;
    case "gpu":
      return !!extra.gpu;
  }
}

/** Invoked directly by a click; no permission requests or host calls during discovery. */
export async function requestBrowserCapability(id: BrowserCapability): Promise<string> {
  if (!globalThis.isSecureContext) throw new Error("Ouvrez le site en HTTPS ou sur localhost.");
  if (!navigator.userActivation?.isActive) throw new Error("Cliquez sur la capacité à autoriser.");
  if (!browserCapabilityAvailable(id)) throw new Error("Cette capacité est indisponible dans ce navigateur.");
  const extra = navigator as Navigator & BrowserExtensions;
  const picker = window as Window & FilePickerWindow;
  switch (id) {
    case "files": {
      const handles = await picker.showOpenFilePicker!({ multiple: true });
      if (handles.length > 8) throw new Error("Import limité à huit fichiers par opération.");
      const files = await Promise.all(handles.map(handle => handle.getFile()));
      if (files.reduce((sum, file) => sum + file.size, 0) > 16 * 1024 * 1024)
        throw new Error("Import limité à 16 Mio par opération.");
      const root = await (
        await navigator.storage.getDirectory()
      ).getDirectoryHandle("bun-webos-files", { create: true });
      const imports = await root.getDirectoryHandle("imports", { create: true });
      const batch = await imports.getDirectoryHandle(crypto.randomUUID(), { create: true });
      for (const file of files) {
        const target = await batch.getFileHandle(file.name, { create: true });
        const writer = await target.createWritable();
        try {
          await writer.write(file);
          await writer.close();
        } catch (error) {
          await writer.abort();
          throw error;
        }
      }
      return `${files.length} fichiers copiés dans le stockage privé de ce site. Les originaux sont conservés.`;
    }
    case "directory": {
      const handle = await picker.showDirectoryPicker!({ mode: "read" });
      return `Dossier sélectionné : ${handle.name}. Aucune lecture récursive ni modification.`;
    }
    case "camera":
    case "microphone":
    case "screen": {
      const stream =
        id === "screen"
          ? await navigator.mediaDevices.getDisplayMedia({ video: true })
          : await navigator.mediaDevices.getUserMedia({
              video: id === "camera",
              audio: id === "microphone",
            });
      try {
        return `${stream.getTracks().length} piste(s) autorisée(s). Test terminé, capture arrêtée.`;
      } finally {
        for (const track of stream.getTracks()) track.stop();
      }
    }
    case "location":
      return new Promise((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(
          position =>
            resolve(
              `${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)} (±${Math.round(position.coords.accuracy)} m)`,
            ),
          reject,
          { timeout: 10000, maximumAge: 0 },
        ),
      );
    case "notifications":
      return `Permission : ${await Notification.requestPermission()}`;
    case "clipboard":
      return `${(await navigator.clipboard.readText()).length} caractères. Texte non conservé.`;
    case "usb":
      await extra.usb!.requestDevice({ filters: [] });
      return "Périphérique USB sélectionné ; aucune commande envoyée.";
    case "hid":
      await extra.hid!.requestDevice({ filters: [] });
      return "Périphérique HID sélectionné ; aucune commande envoyée.";
    case "serial":
      await extra.serial!.requestPort();
      return "Port série sélectionné ; port fermé.";
    case "bluetooth":
      await extra.bluetooth!.requestDevice({ acceptAllDevices: true });
      return "Périphérique Bluetooth sélectionné ; connexion GATT non ouverte.";
    case "fullscreen":
      await document.documentElement.requestFullscreen();
      return "Plein écran actif. Échap pour quitter.";
    case "storage":
      return (await navigator.storage.persist())
        ? "Stockage persistant accordé."
        : "Stockage persistant refusé ; le navigateur peut libérer les données.";
    case "gpu": {
      const adapter = await extra.gpu!.requestAdapter();
      return adapter
        ? `WebGPU : ${Array.from(adapter.features).join(", ") || "adaptateur disponible"}`
        : "Aucun adaptateur WebGPU disponible.";
    }
  }
}
