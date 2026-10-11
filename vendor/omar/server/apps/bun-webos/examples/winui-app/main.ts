// A WinUI 3 window driven from Bun: XAML markup, Fluent 2 brushes from @aphrody/bun-fluent, events on the JS thread.
//   bun main.ts
import { fluentWinuiResources } from "@aphrody/bun-fluent";
import winui from "bun:winui";

const app = winui.start();
// The Fluent 2 web palette for the WinUI theme resources (light and dark dictionaries).
const fluent = app.load(fluentWinuiResources());
app.application.get("Resources").get("MergedDictionaries").call("Append", fluent);

const win = app.createWindow({
  title: "Bun + WinUI 3",
  width: 480,
  height: 360,
  content: `<StackPanel Padding="24" Spacing="12">
    <TextBlock Text="Notes" Style="{StaticResource TitleTextBlockStyle}"/>
    <TextBox x:Name="note" PlaceholderText="Écrire une note"/>
    <StackPanel Orientation="Horizontal" Spacing="8">
      <Button x:Name="add" Content="Ajouter" Style="{StaticResource AccentButtonStyle}"/>
      <ComboBox x:Name="theme" SelectedIndex="0">
        <x:String>Système</x:String>
        <x:String>Clair</x:String>
        <x:String>Sombre</x:String>
      </ComboBox>
    </StackPanel>
    <ListView x:Name="list"/>
  </StackPanel>`,
});

const note = win.find("note")!;
const list = win.find("list")!;
win.find("add")!.on("Click", () => {
  const text = String(note.get("Text")).trim();
  if (!text) return;
  list.get("Items").call("Append", text);
  note.set("Text", "");
});
// ElementTheme: 0 Default, 1 Light, 2 Dark.
const root = win.content!;
win.find("theme")!.on("SelectionChanged", () => root.set("RequestedTheme", win.find("theme")!.get("SelectedIndex")));

if (process.argv.includes("--smoke")) {
  note.set("Text", "première note");
  win.find("add")!.invoke();
  console.log(list.get("Items").get("Size"), root.tree().children?.length);
  await win.close();
}
await win.closed;
