/** 3–20 letters, digits, `_` or `-`. Uniqueness is case-insensitive. */
export const NICKNAME_PATTERN = /^[A-Za-z0-9_-]{3,20}$/;
export const NICKNAME_RULES = '3–20 characters: letters, numbers, _ or -';

/** Names that would look official on a public leaderboard. Matched anywhere in the name. */
const RESERVED_PARTS = ['admin', 'moderator', 'cuberush', 'official'];
/** Matched as the whole name only. */
const RESERVED_NAMES = ['mod', 'mods', 'staff', 'support', 'system', 'root', 'guest', 'anonymous'];

// Offensive words. Unmistakable ones are matched anywhere in the name; short ones that hide inside
// ordinary words (cl-ass-ic, ther-apist) only as a whole word of the name. A list never catches
// everything; it stops the obvious cases on a public leaderboard.
const ANYWHERE = [
  'fuck',
  'nigger',
  'nigga',
  'faggot',
  'retard',
  'whore',
  'bitch',
  'pussy',
  'penis',
  'vagina',
  'porn',
  'hitler',
  'kike',
  'chink',
  'tranny',
  'jizz',
  'twat',
  'dildo',
  'shit',
  'molest',
  'blowjob',
  'boner',
  'hentai',
  'nsfw',
];
const WHOLE_WORD = [
  'cunt',
  'nazi',
  'wank',
  'slut',
  'ass',
  'arse',
  'dick',
  'cock',
  'cum',
  'sex',
  'tit',
  'tits',
  'fag',
  'rape',
  'rapist',
  'pedo',
  'spic',
  'anal',
  'kkk',
  'nude',
  'nudes',
  'xxx',
  'sexy',
];

/** Undoes the usual letter-for-digit swaps (n1gg3r → nigger). */
function unleet(s: string): string {
  const swaps: Record<string, string> = {
    '0': 'o',
    '1': 'i',
    '3': 'e',
    '4': 'a',
    '5': 's',
    '7': 't',
    '8': 'b',
    '9': 'g',
  };
  return s.replace(/[0-9]/g, (d) => swaps[d] ?? d);
}

/** The words a nickname is made of: split at `_`, `-`, digits and camelCase humps. */
function words(nickname: string): string[] {
  return nickname
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[\s_\-0-9]+/)
    .map((w) => w.toLowerCase())
    .filter(Boolean);
}

/**
 * Why a nickname can't be used, or null if it can. The same check runs in the browser (for quick
 * feedback) and on the server (which decides).
 */
export function nicknameProblem(nickname: string): string | null {
  if (!NICKNAME_PATTERN.test(nickname)) return `Nicknames are ${NICKNAME_RULES}.`;
  const lower = nickname.toLowerCase();
  const joined = lower.replace(/[_-]/g, '');
  const flat = unleet(joined);

  if (
    RESERVED_PARTS.some((part) => joined.includes(part) || flat.includes(part)) ||
    RESERVED_NAMES.includes(joined) ||
    RESERVED_NAMES.includes(flat)
  ) {
    return 'That nickname is reserved. Please pick another.';
  }

  const candidates = [...words(nickname), joined, flat, ...words(unleet(nickname))];
  const offensive =
    ANYWHERE.some((bad) => flat.includes(bad) || joined.includes(bad)) ||
    candidates.some((w) => WHOLE_WORD.includes(w) || WHOLE_WORD.includes(w.replace(/s$/, '')));
  return offensive ? 'Please pick a different nickname.' : null;
}
