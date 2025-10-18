export class ToolError extends Error {
  code: string;
  details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export const isToolError = (error: unknown): error is ToolError => error instanceof ToolError;
