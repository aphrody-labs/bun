import "./globals.css";

export const metadata = { title: "Bun App Router" };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
