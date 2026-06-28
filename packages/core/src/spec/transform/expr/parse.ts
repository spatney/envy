/**
 * Recursive-descent / precedence-climbing parser for the `calculate` language.
 *
 * Grammar (lowest → highest precedence):
 *   ternary   := logicalOr ('?' expr ':' expr)?
 *   logicalOr := logicalAnd ('||' logicalAnd)*
 *   logicalAnd:= equality ('&&' equality)*
 *   equality  := relational (('=='|'!='|'==='|'!==') relational)*
 *   relational:= additive (('<'|'<='|'>'|'>=') additive)*
 *   additive  := multiplicative (('+'|'-') multiplicative)*
 *   mul       := unary (('*'|'/'|'%') unary)*
 *   unary     := ('!'|'-'|'+') unary | postfix
 *   postfix   := primary ('.' ident | '[' expr ']')*
 *   primary   := number | string | 'true'|'false'|'null'
 *              | ident '(' args? ')'   (function call)
 *              | ident                  (field reference / `datum`)
 *              | '(' expr ')'
 *
 * The output AST is plain data evaluated by {@link evaluate}. No `eval`.
 */

import { ExpressionError } from './error';
import { tokenize, type Token } from './tokenize';

export type Node =
  | { type: 'num'; value: number }
  | { type: 'str'; value: string }
  | { type: 'lit'; value: boolean | null }
  | { type: 'field'; name: string }
  | { type: 'datum' }
  | { type: 'unary'; op: string; arg: Node }
  | { type: 'binary'; op: string; left: Node; right: Node }
  | { type: 'logical'; op: '&&' | '||'; left: Node; right: Node }
  | { type: 'ternary'; test: Node; then: Node; alt: Node }
  | { type: 'call'; callee: string; args: Node[] }
  | { type: 'member'; obj: Node; prop: Node; computed: boolean };

const EQUALITY = new Set(['==', '!=', '===', '!==']);
const RELATIONAL = new Set(['<', '<=', '>', '>=']);
const ADDITIVE = new Set(['+', '-']);
const MULTIPLICATIVE = new Set(['*', '/', '%']);

class Parser {
  private readonly tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token {
    return this.tokens[this.pos];
  }

  private next(): Token {
    return this.tokens[this.pos++];
  }

  private isOp(value: string): boolean {
    const t = this.peek();
    return t.type === 'op' && t.value === value;
  }

  private eat(value: string): void {
    if (!this.isOp(value)) {
      const t = this.peek();
      throw new ExpressionError(`Expected "${value}" but found ${describe(t)}.`, t.pos);
    }
    this.pos++;
  }

  parse(): Node {
    const node = this.parseTernary();
    const t = this.peek();
    if (t.type !== 'eof') throw new ExpressionError(`Unexpected ${describe(t)}.`, t.pos);
    return node;
  }

  private parseTernary(): Node {
    const test = this.parseBinary(0);
    if (this.isOp('?')) {
      this.eat('?');
      const then = this.parseTernary();
      this.eat(':');
      const alt = this.parseTernary();
      return { type: 'ternary', test, then, alt };
    }
    return test;
  }

  /** Precedence-climbing for the binary/logical operator levels. */
  private parseBinary(minLevel: number): Node {
    let left = this.parseUnary();
    for (;;) {
      const t = this.peek();
      if (t.type !== 'op') break;
      const level = binaryLevel(t.value as string);
      if (level < minLevel || level < 0) break;
      this.next();
      const right = this.parseBinary(level + 1);
      const op = t.value as string;
      left =
        op === '&&' || op === '||'
          ? { type: 'logical', op, left, right }
          : { type: 'binary', op, left, right };
    }
    return left;
  }

  private parseUnary(): Node {
    const t = this.peek();
    if (t.type === 'op' && (t.value === '!' || t.value === '-' || t.value === '+')) {
      this.next();
      return { type: 'unary', op: t.value, arg: this.parseUnary() };
    }
    return this.parsePostfix();
  }

  private parsePostfix(): Node {
    let node = this.parsePrimary();
    for (;;) {
      if (this.isOp('.')) {
        this.eat('.');
        const t = this.next();
        if (t.type !== 'ident') throw new ExpressionError(`Expected a property name after ".".`, t.pos);
        node = { type: 'member', obj: node, prop: { type: 'str', value: t.value as string }, computed: false };
      } else if (this.isOp('[')) {
        this.eat('[');
        const prop = this.parseTernary();
        this.eat(']');
        node = { type: 'member', obj: node, prop, computed: true };
      } else {
        break;
      }
    }
    return node;
  }

  private parsePrimary(): Node {
    const t = this.next();
    if (t.type === 'num') return { type: 'num', value: t.value as number };
    if (t.type === 'str') return { type: 'str', value: t.value as string };
    if (t.type === 'ident') {
      const name = t.value as string;
      if (name === 'true') return { type: 'lit', value: true };
      if (name === 'false') return { type: 'lit', value: false };
      if (name === 'null') return { type: 'lit', value: null };
      if (this.isOp('(')) {
        this.eat('(');
        const args: Node[] = [];
        if (!this.isOp(')')) {
          args.push(this.parseTernary());
          while (this.isOp(',')) {
            this.eat(',');
            args.push(this.parseTernary());
          }
        }
        this.eat(')');
        return { type: 'call', callee: name, args };
      }
      if (name === 'datum') return { type: 'datum' };
      return { type: 'field', name };
    }
    if (t.type === 'op' && t.value === '(') {
      const node = this.parseTernary();
      this.eat(')');
      return node;
    }
    throw new ExpressionError(`Unexpected ${describe(t)}.`, t.pos);
  }
}

/** Operator → precedence level (higher binds tighter); -1 if not binary. */
function binaryLevel(op: string): number {
  if (op === '||') return 1;
  if (op === '&&') return 2;
  if (EQUALITY.has(op)) return 3;
  if (RELATIONAL.has(op)) return 4;
  if (ADDITIVE.has(op)) return 5;
  if (MULTIPLICATIVE.has(op)) return 6;
  return -1;
}

function describe(t: Token): string {
  if (t.type === 'eof') return 'end of input';
  if (t.type === 'str') return `string ${JSON.stringify(t.value)}`;
  if (t.type === 'num') return `number ${t.value}`;
  return `"${t.value}"`;
}

/** Parse a `calculate` expression string into an AST (throws on syntax errors). */
export function parse(src: string): Node {
  if (typeof src !== 'string' || src.trim() === '') {
    throw new ExpressionError('Expression must be a non-empty string.', 0);
  }
  return new Parser(tokenize(src)).parse();
}
