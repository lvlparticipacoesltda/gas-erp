import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@gas-erp/database';
import { Response } from 'express';

const CODE_MESSAGES: Record<string, { status: number; message: string }> = {
  P2002: { status: HttpStatus.BAD_REQUEST, message: 'Registro duplicado.' },
  P2003: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Referência inválida. Verifique produto, cliente ou entregador.',
  },
  P2011: { status: HttpStatus.BAD_REQUEST, message: 'Dados obrigatórios ausentes.' },
  P2021: {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    message: 'Tabela não encontrada no banco. Verifique se as migrations foram aplicadas.',
  },
  P2022: {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    message: 'Banco desatualizado. Aplique as migrations (pnpm db:deploy no Railway).',
  },
  P2025: { status: HttpStatus.NOT_FOUND, message: 'Registro não encontrado.' },
};

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const mapped = CODE_MESSAGES[exception.code] ?? {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Erro ao processar a operação no banco de dados.',
    };

    this.logger.error(
      `Prisma ${exception.code}: ${exception.message}`,
      exception.meta ? JSON.stringify(exception.meta) : undefined,
    );

    response.status(mapped.status).json({
      statusCode: mapped.status,
      message: mapped.message,
      code: exception.code,
      error: mapped.status === HttpStatus.BAD_REQUEST ? 'Bad Request' : 'Internal Server Error',
    });
  }
}

@Catch(Prisma.PrismaClientValidationError)
export class PrismaValidationExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaValidationExceptionFilter.name);

  catch(exception: Prisma.PrismaClientValidationError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    this.logger.error(exception.message);

    response.status(HttpStatus.BAD_REQUEST).json({
      statusCode: HttpStatus.BAD_REQUEST,
      message: 'Dados inválidos para salvar no banco.',
      error: 'Bad Request',
    });
  }
}
