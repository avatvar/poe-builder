import type { Metadata } from "next";
import { Manrope, Unbounded } from "next/font/google";
import "./globals.css";

const manrope = Manrope({ variable: "--font-manrope", subsets: ["cyrillic", "latin"] });
const unbounded = Unbounded({ variable: "--font-unbounded", subsets: ["cyrillic", "latin"] });

export const metadata: Metadata = {
  title: "Exile Path — простой путь развития персонажа",
  description: "Выбери класс и стиль игры, чтобы получить пошаговый маршрут прокачки персонажа Path of Exile.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru" suppressHydrationWarning><head><link rel="icon" href="favicon.svg" type="image/svg+xml" /></head><body className={`${manrope.variable} ${unbounded.variable}`}>{children}</body></html>;
}
