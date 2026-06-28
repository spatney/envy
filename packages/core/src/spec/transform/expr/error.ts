/** Error thrown by the `calculate` expression tokenizer/parser/evaluator. */
export class ExpressionError extends Error {
  /** Source offset where the problem was detected, when known. */
  readonly pos: number | undefined;

  constructor(message: string, pos?: number) {
    super(message);
    this.name = 'ExpressionError';
    this.pos = pos;
  }
}
