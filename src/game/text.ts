import type { Gender } from "./types";

/**
 * עברית לפי הפנייה שהשחקן/ית בחר/ה.
 * say(g, "ניצח", "ניצחה") → "ניצח" / "ניצחה" / "ניצח/ה"
 */
export function say(gender: Gender, male: string, female: string, neutral?: string): string {
  if (gender === "m") return male;
  if (gender === "f") return female;
  if (neutral) return neutral;
  return female.startsWith(male) ? `${male}/${female.slice(male.length)}` : `${male}/${female}`;
}
