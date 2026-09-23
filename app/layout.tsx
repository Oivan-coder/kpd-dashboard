import "./globals.css";

export const metadata = {
  title: "КПД ЦКДЛ",
  description: "Верификация оборудования и расчёт загрузки анализаторов",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
