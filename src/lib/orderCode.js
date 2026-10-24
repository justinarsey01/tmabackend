import crypto from "node:crypto";

// Letters and digits without look-alikes (no 0/O, 1/I).
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/*
|--------------------------------------------------------------------------
| Public order code
| A short, non-sequential code derived from the order's unique ID, for example
| "K7Q2-M9XD". It is shown instead of the running order number, so nobody can
| work out how many orders you have, and it cannot be guessed.
| The sequential number stays in the database; only the display changes.
|--------------------------------------------------------------------------
*/
export function orderCode(id) {
  if (!id) return "";

  const digest = crypto
    .createHash("sha256")
    .update(String(id))
    .digest();

  let code = "";

  for (let index = 0; index < 8; index += 1) {
    code += ALPHABET[digest[index] % ALPHABET.length];
  }

  return `${code.slice(0, 4)}-${code.slice(4)}`;
}
