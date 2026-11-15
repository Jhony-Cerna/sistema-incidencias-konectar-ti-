import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(message: string, statusCode = 400, code = 'APP_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      code: err.code,
      message: err.message,
    });
    return;
  }

  if (err instanceof ZodError) {
    const details = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    res.status(400).json({
      success: false,
      code: 'VALIDATION_ERROR',
      message: details[0]?.message || 'Datos de entrada inválidos.',
      errors: details,
    });
    return;
  }

  if (err instanceof Error && err.name === 'MulterError') {
    res.status(400).json({
      success: false,
      code: 'UPLOAD_ERROR',
      message: `Error al subir archivo adjunto: ${err.message}`,
    });
    return;
  }

  console.error('[ERROR NO CONTROLADO]', err);
  res.status(500).json({
    success: false,
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Ocurrió un error interno al procesar la solicitud.',
  });
}
