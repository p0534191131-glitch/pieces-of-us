import type { AssistLevel, Grid, LoveCard, PlanId, PlayerColor, PowerKind } from "./types";

/**
 * סולם השלבים: מתחילים ב-9 חלקים, ובכל שלב מכפילים.
 * 9 → 18 → 36 → 72 → 144 → 288. הלוח תמיד ריבוע, אז חצי מהשלבים בנויים מחלקים מלבניים.
 */
export const LADDER: Grid[] = [
  { c: 3, r: 3 },
  { c: 3, r: 6 },
  { c: 6, r: 6 },
  { c: 6, r: 12 },
  { c: 12, r: 12 },
  { c: 12, r: 24 },
];
export const MAX_LEVELS = LADDER.length;
export const MIN_LEVELS = 2;

export function gridsFor(levels: number): Grid[] {
  const count = Math.max(MIN_LEVELS, Math.min(MAX_LEVELS, Math.round(levels)));
  return LADDER.slice(0, count).map((g) => ({ ...g }));
}

/** כמה שחקנים יכולים לשחק יחד */
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;

export interface PlanDef {
  id: PlanId;
  name: string;
  emoji: string;
  levels: number;
  blurb: string;
  minutes: string;
}

export const PLANS: Record<PlanId, PlanDef> = {
  sprint: { id: "sprint", name: "ספרינט", emoji: "⚡", levels: 3, blurb: "שלושה שלבים זריזים", minutes: "כ־5 דק׳" },
  classic: { id: "classic", name: "קלאסי", emoji: "💞", levels: 4, blurb: "מ־9 חלקים ועד 72", minutes: "כ־12 דק׳" },
  marathon: { id: "marathon", name: "מרתון", emoji: "🏆", levels: 5, blurb: "חמישה שלבים — עד 144 חלקים", minutes: "כ־30 דק׳" },
  legend: { id: "legend", name: "אגדה", emoji: "👑", levels: 6, blurb: "השלב האחרון: 288 חלקים. באמת.", minutes: "כשעה" },
};
export const PLAN_ORDER: PlanId[] = ["sprint", "classic", "marathon", "legend"];

export const planGrids = (plan: PlanId): Grid[] => gridsFor(PLANS[plan]?.levels ?? PLANS.classic.levels);

export const COLOR_ORDER: PlayerColor[] = ["rose", "gold", "violet", "teal", "sky", "lime"];
export const COLOR_VAR: Record<PlayerColor, string> = {
  rose: "var(--player-rose)",
  gold: "var(--player-gold)",
  violet: "var(--player-violet)",
  teal: "var(--player-teal)",
  sky: "var(--player-sky)",
  lime: "var(--player-lime)",
};
export const COLOR_NAME: Record<PlayerColor, string> = {
  rose: "ורוד",
  gold: "זהב",
  violet: "סגול",
  teal: "טורקיז",
  sky: "תכלת",
  lime: "ליים",
};

export const AVATARS = ["🌹", "💍", "🦋", "🌙", "☀️", "👑", "🧁", "🍫", "🍓", "🦁", "🐻", "🕊️"];

export const ASSISTS: Record<AssistLevel, { name: string; emoji: string; desc: string }> = {
  0: { name: "אלופים", emoji: "🔥", desc: "בלי סימון לחלקים שהגיעו למקום ובלי תמונת עזר" },
  1: { name: "רגיל", emoji: "⚖️", desc: "חלק שהגיע למקום ננעל ונדלק, ויש תמונת עזר" },
  2: { name: "בנחת", emoji: "🌸", desc: "כמו רגיל — ועוד רמז קטן כל כמה שניות" },
};

export interface PowerDef {
  name: string;
  emoji: string;
  desc: string;
  target: "rival" | "self";
  ms: number;
}

/** מצב שובבות: כל כמה חלקים שננעלים — מקבלים כוח. כוחות התקפה פוגעים במי שמוביל/ה */
export const POWERS: Record<PowerKind, PowerDef> = {
  hearts: { name: "גשם לבבות", emoji: "💘", desc: "לבבות מציפים לרגע את הלוח של מי שמוביל/ה", target: "rival", ms: 3800 },
  fog: { name: "ערפל אהבה", emoji: "🌫️", desc: "הלוח של המוביל/ה מיטשטש לכמה שניות", target: "rival", ms: 2600 },
  twist: { name: "סחרור", emoji: "🌀", desc: "מחליף אצל המוביל/ה שני חלקים שעוד לא במקום", target: "rival", ms: 700 },
  freeze: { name: "הקפאה", emoji: "🧊", desc: "שתי שניות שבהן המוביל/ה לא יכול/ה להזיז כלום", target: "rival", ms: 2000 },
  peek: { name: "הצצה", emoji: "👁️", desc: "רואים לרגע את התמונה השלמה על הלוח", target: "self", ms: 1700 },
  magnet: { name: "מגנט", emoji: "🧲", desc: "חלק אחד קופץ ישר למקום", target: "self", ms: 600 },
};
export const RIVAL_POWERS: PowerKind[] = ["hearts", "fog", "twist", "freeze"];
export const SELF_POWERS: PowerKind[] = ["peek", "magnet"];
export const MAX_POWERS = 2;

export const EMOTES = ["❤️", "😘", "😂", "😱", "🔥", "👑"];

/** "מה אני מקבל/ת אם אנצח" */
export const WISHES = [
  "🥐 ארוחת בוקר מפנקת — מוגשת",
  "🍽️ ערב שלם בלי כלים",
  "💆 עיסוי של 10 דקות עם טיימר",
  "🎟️ אני בוחר/ת את הבילוי הבא",
  "🍰 קינוח לבחירתי — מוכן בשבילי",
  "💌 מכתב אהבה בכתב יד",
  "✨ יום שלם של 'כן' לבקשות קטנות",
  "☕ קפה עד המיטה, שלושה בקרים",
];

/** מי שסיים/ה אחרון/ה בשלב מקבל/ת כרטיס */
export const LOVE_CARDS: LoveCard[] = [
  { emoji: "💬", text: "שלוש מחמאות ב־15 שניות. בלי לחזור על אף מילה." },
  { emoji: "🤗", text: "חיבוק של 20 שניות. בלי לדבר." },
  { emoji: "🕰️", text: "ספרו על הרגע שבו הבנתם ש״זהו, זה זה״." },
  { emoji: "☕", text: "משקה חם לבן/בת הזוג בסוף המשחק. בלי תירוצים." },
  { emoji: "🎤", text: "שורה אחת משיר שמזכיר לכם אחד את השני. בקול." },
  { emoji: "💐", text: "תודה על משהו קטן שאף פעם לא אמרתם עליו תודה." },
  { emoji: "🧠", text: "נחשו: מה המאכל שבן/בת הזוג הכי אוהב/ת שאתם מכינים?" },
  { emoji: "📸", text: "איזו תמונה שלנו הכי אהובה עליכם — ולמה דווקא היא?" },
  { emoji: "🌙", text: "מה הכי בא לכם לעשות יחד החודש? להגיד בקול." },
  { emoji: "💆", text: "עיסוי כתפיים של שתי דקות. עם טיימר." },
  { emoji: "🥇", text: "שלושה דברים שבן/בת הזוג עושה יותר טוב מכם." },
  { emoji: "🎁", text: "חייבים טובה קטנה. בן/בת הזוג בוחר/ת מתי לגבות." },
  { emoji: "😍", text: "עשר שניות מבט בעיניים בלי לצחוק. צחקתם? עוד עשר." },
  { emoji: "📖", text: "ספרו על פעם שממש התגאיתם בבן/בת הזוג." },
  { emoji: "🍫", text: "משהו מתוק מהמטבח לבן/בת הזוג. עכשיו." },
  { emoji: "🌟", text: "תארו את בן/בת הזוג בשלוש מילים בדיוק." },
  { emoji: "😂", text: "מה הצחוק הכי גדול שהיה לנו השנה?" },
  { emoji: "🎯", text: "נחשו איזה שיר בן/בת הזוג מזמזם/ת בלי לשים לב." },
  { emoji: "🧺", text: "מחר לוקחים מטלה אחת של בן/בת הזוג." },
  { emoji: "🎈", text: "ספרו על חלום אחד שעוד לא סיפרתם עליו מספיק." },
  { emoji: "🍽️", text: "מציעים מקום לדייט הבא. המנצח/ת בוחר/ת מתי." },
  { emoji: "💤", text: "מה הדבר הכי מרגיע שבן/בת הזוג עושה בשבילכם?" },
  { emoji: "🥹", text: "״אני אוהב/ת אותך״ — בטון שעוד לא השתמשתם בו אף פעם." },
  { emoji: "🎨", text: "ציירו באצבע מילה על כף היד של בן/בת הזוג. שינחשו." },
  { emoji: "📞", text: "מי זוכר/ת יותר פרטים מהשיחה הראשונה שלנו? תתחילו." },
  { emoji: "🎂", text: "מה המתנה הכי טובה שקיבלתם מבן/בת הזוג?" },
  { emoji: "🌊", text: "לאן היינו טסים מחר אם אפשר? עונים יחד בספירה לשלוש." },
  { emoji: "🪄", text: "בן/בת הזוג מבקש/ת בקשה קטנה אחת — ואתם מסכימים." },
  { emoji: "🫶", text: "תודה אחת על משהו שקרה היום." },
  { emoji: "💌", text: "שלחו עכשיו הודעה מתוקה לבן/בת הזוג — גם אם יושבים זה ליד זה." },
  { emoji: "🍰", text: "מתכננים יחד קינוח לסוף השבוע — ואתם מכינים." },
  { emoji: "👑", text: "עד סוף השלב הבא, פונים למנצח/ת ב״הוד מעלתך״." },
];
