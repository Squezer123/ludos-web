
export type LuaValue =
  | string
  | number
  | boolean
  | null
  | LuaValue[]
  | { [k: string]: LuaValue };

class Reader {
  i = 0;
  readonly s: string;

  constructor(s: string) {
    this.s = s;
  }

  fail(msg: string): never {
    const upto = this.s.slice(0, this.i);
    const line = upto.split("\n").length;
    throw new Error(`Błąd parsowania Lua (linia ${line}): ${msg}`);
  }

  skip() {
    const s = this.s;

    for (;;) {
      const c = s[this.i];

      if (
        c === " " ||
        c === "\t" ||
        c === "\n" ||
        c === "\r" ||
        c === "﻿"
      ) {
        this.i++;
      } else if (c === "-" && s[this.i + 1] === "-") {
        // Komentarz: --[[ ... ]] lub do końca linii
        if (s.startsWith("--[[", this.i)) {
          const end = s.indexOf("]]", this.i + 4);
          this.i = end === -1 ? s.length : end + 2;
        } else {
          const end = s.indexOf("\n", this.i);
          this.i = end === -1 ? s.length : end + 1;
        }
      } else {
        return;
      }
    }
  }

  peek() {
    this.skip();
    return this.s[this.i];
  }

  expect(ch: string) {
    this.skip();

    if (this.s[this.i] !== ch) {
      this.fail(
        `oczekiwano "${ch}", jest "${this.s[this.i] ?? "koniec pliku"}"`
      );
    }

    this.i++;
  }

  string(): string {
    const quote = this.s[this.i];
    this.i++;

    let out = "";

    for (;;) {
      const c = this.s[this.i++];

      if (c === undefined) {
        this.fail("niezamknięty string");
      }

      if (c === quote) {
        return out;
      }

      if (c === "\\") {
        const n = this.s[this.i++];

        if (n === "n") {
          out += "\n";
        } else if (n === "t") {
          out += "\t";
        } else if (n === "r") {
          out += "\r";
        } else if (n === "\n") {
          out += "\n";
        } else if (n !== undefined && n >= "0" && n <= "9") {
          let digits = n;

          while (
            digits.length < 3 &&
            /[0-9]/.test(this.s[this.i] ?? "")
          ) {
            digits += this.s[this.i++];
          }

          out += String.fromCharCode(parseInt(digits, 10));
        } else {
          out += n ?? "";
        }
      } else {
        out += c;
      }
    }
  }

  number(): number {
    const m =
      /^-?(?:0[xX][0-9a-fA-F]+|\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)/.exec(
        this.s.slice(this.i, this.i + 64)
      );

    if (!m) {
      this.fail("niepoprawna liczba");
    }

    this.i += m[0].length;
    return Number(m[0]);
  }

  ident(): string | null {
    const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(
      this.s.slice(this.i, this.i + 128)
    );

    if (!m) {
      return null;
    }

    this.i += m[0].length;
    return m[0];
  }

  value(): LuaValue {
    const c = this.peek();

    if (c === "{") {
      return this.table();
    }

    if (c === '"' || c === "'") {
      return this.string();
    }

    if (
      c === "-" ||
      c === "." ||
      (c !== undefined && c >= "0" && c <= "9")
    ) {
      return this.number();
    }

    const id = this.ident();

    if (id === "true") {
      return true;
    }

    if (id === "false") {
      return false;
    }

    if (id === "nil") {
      return null;
    }

    return this.fail(
      `nieoczekiwany token "${id ?? c ?? "koniec pliku"}"`
    );
  }

  table(): LuaValue {
    this.expect("{");

    const positional: LuaValue[] = [];
    const keyed: Array<[string | number, LuaValue]> = [];

    for (;;) {
      const c = this.peek();

      if (c === "}") {
        this.i++;
        break;
      }

      if (c === undefined) {
        this.fail("niezamknięta tabela");
      }

      if (c === "[") {
        this.i++;

        const key = this.value() as string | number;

        this.expect("]");
        this.expect("=");

        keyed.push([key, this.value()]);
      } else if (/[A-Za-z_]/.test(c)) {
        // `nazwa = wartość` albo wartość-słowo (true/false/nil)
        const save = this.i;
        const id = this.ident()!;

        this.skip();

        if (this.s[this.i] === "=" && this.s[this.i + 1] !== "=") {
          this.i++;
          keyed.push([id, this.value()]);
        } else {
          this.i = save;
          positional.push(this.value());
        }
      } else {
        positional.push(this.value());
      }

      const sep = this.peek();

      if (sep === "," || sep === ";") {
        this.i++;
      }
    }

    if (keyed.length === 0) {
      return positional;
    }

    // Same klucze 1..n -> tablica
    const allInts = keyed.every(
      ([k]) =>
        typeof k === "number" &&
        Number.isInteger(k) &&
        k >= 1
    );

    if (positional.length === 0 && allInts) {
      const keys = new Set(keyed.map(([k]) => k as number));

      if (
        keys.size === keyed.length &&
        keyed.every(([k]) => (k as number) <= keyed.length)
      ) {
        const arr: LuaValue[] = new Array(keyed.length);

        for (const [k, v] of keyed) {
          arr[(k as number) - 1] = v;
        }

        return arr;
      }
    }

    const obj: { [k: string]: LuaValue } = {};

    positional.forEach((v, idx) => {
      obj[String(idx + 1)] = v;
    });

    for (const [k, v] of keyed) {
      if (v !== null) {
        obj[String(k)] = v;
      }
    }

    return obj;
  }
}

/** Parsuje plik SavedVariables i zwraca { NazwaZmiennej: wartość }. */
export function parseSavedVariables(
  text: string
): Record<string, LuaValue> {
  const r = new Reader(text);
  const out: Record<string, LuaValue> = {};

  for (;;) {
    r.skip();

    if (r.i >= text.length) {
      break;
    }

    const name = r.ident();

    // Bezpośredni throw pozwala TypeScriptowi zawęzić typ name do string.
    if (name === null) {
      throw new Error(
        "Błąd parsowania Lua: oczekiwano nazwy zmiennej"
      );
    }

    r.expect("=");
    out[name] = r.value();
  }

  return out;
}
