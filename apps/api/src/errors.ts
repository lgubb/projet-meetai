export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
  }
}

export function unauthorized(message = "Unauthorized"): never {
  throw new HttpError(401, message);
}

export function forbidden(message = "Forbidden"): never {
  throw new HttpError(403, message);
}

export function notFound(message = "Not Found"): never {
  throw new HttpError(404, message);
}
