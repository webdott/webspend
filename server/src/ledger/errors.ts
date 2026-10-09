export class LedgerError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export class NotFoundError extends LedgerError {
  constructor(message = 'not found') {
    super(404, 'not_found', message);
  }
}

export class ConflictError extends LedgerError {
  constructor(message: string) {
    super(409, 'conflict', message);
  }
}

export class InvalidRequestError extends LedgerError {
  constructor(message: string) {
    super(400, 'invalid_request', message);
  }
}
