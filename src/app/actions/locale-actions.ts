"use server";

import { cookies } from "next/headers";

const SUPPORTED_LOCALES = ["en", "si", "ta", "fr", "es", "de", "ar", "zh", "hi", "pt", "ja", "ko", "id", "ru"];

export async function setLocale(locale: string) {
  if (!SUPPORTED_LOCALES.includes(locale)) return;
  const cookieStore = await cookies();
  cookieStore.set("olgax_locale", locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 year
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}
