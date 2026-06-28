/**
 * Tokenizer for the restricted `calculate` expression language.
 *
 * Produces a flat token stream for {@link parse}. Deliberately tiny and total —
 * no `eval`/`Function`, no regex backtracking on untrusted input beyond simple
 * character classes. Any unexpected character throws an {@link ExpressionError}.
 */

import { ExpressionError } from './error';

export type TokenType = 'num' | 'str' | 'ident' | 'op' | 'eof';

export interface Token {
  type: TokenType;
  /** Raw operator/punctuation text, identifier name, string value, or number. */
  value: string | number;
  /** Source offset where the token starts (for error messages). */
  pos: number;
}

/** Multi-character operators, longest first so we match greedily. */
const MULTI_OPS = ['===', '!==', '==', '!=', '<=', '>=', '&&', '||'];
const SINGLE_OPS = new Set('+-*/%!<>?:.,()[]'.split(''));

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

function isIdentStart(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_' || ch === '$';
}

function isIdentPart(ch: string): boolean {
  return isIdentStart(ch) || isDigit(ch);
}

/** Lex `src` into tokens, ending with a single `eof` token. */
export function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = src.length;

  while (i < n) {
    const ch = src[i];

    // Whitespace.
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
      continue;
    }

    // String literal.
    if (ch === '"' || ch === "'") {
      const start = i;
      const quote = ch;
      i++;
      let out = '';
      while (i < n && src[i] !== quote) {
        if (src[i] === '\\') {
          const next = src[i + 1];
          if (next === undefined) throw new ExpressionError('Unterminated string literal.', start);
          out += next === 'n' ? '\n' : next === 't' ? '\t' : next === 'r' ? '\r' : next;
          i += 2;
        } else {
          out += src[i];
          i++;
        }
      }
      if (i >= n) throw new ExpressionError('Unterminated string literal.', start);
      i++; // closing quote
      tokens.push({ type: 'str', value: out, pos: start });
      continue;
    }

    // Number literal (digits, or a leading dot followed by a digit).
    if (isDigit(ch) || (ch === '.' && isDigit(src[i + 1] ?? ''))) {
      const start = i;
      while (i < n && isDigit(src[i])) i++;
      if (src[i] === '.') {
        i++;
        while (i < n && isDigit(src[i])) i++;
      }
      if (src[i] === 'e' || src[i] === 'E') {
        i++;
        if (src[i] === '+' || src[i] === '-') i++;
        if (!isDigit(src[i] ?? '')) throw new ExpressionError('Malformed number literal.', start);
        while (i < n && isDigit(src[i])) i++;
      }
      tokens.push({ type: 'num', value: Number(src.slice(start, i)), pos: start });
      continue;
    }

    // Identifier / keyword.
    if (isIdentStart(ch)) {
      const start = i;
      i++;
      while (i < n && isIdentPart(src[i])) i++;
      tokens.push({ type: 'ident', value: src.slice(start, i), pos: start });
      continue;
    }

    // Multi-char operator.
    const three = src.slice(i, i + 3);
    const two = src.slice(i, i + 2);
    const multi = MULTI_OPS.find((op) => op === three) ?? MULTI_OPS.find((op) => op === two);
    if (multi) {
      tokens.push({ type: 'op', value: multi, pos: i });
      i += multi.length;
      continue;
    }

    // Single-char operator / punctuation.
    if (SINGLE_OPS.has(ch)) {
      tokens.push({ type: 'op', value: ch, pos: i });
      i++;
      continue;
    }

    throw new ExpressionError(`Unexpected character ${JSON.stringify(ch)}.`, i);
  }

  tokens.push({ type: 'eof', value: '', pos: n });
  return tokens;
}
