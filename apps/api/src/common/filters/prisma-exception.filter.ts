import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { Prisma } from '@gas-erp/database';
import { Response } from 'express';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();

    let message = 'Erro ao processar a operação no banco de dados';
    let status = HttpStatus.INTERNAL_SERVER_ERROR;

    if (exception.code === 'P2003') {
      status = HttpStatus.BAD_REQUEST;
      message = 'Referência inválida. Verifique produto, cliente ou entregador.';
    } else if (exception.code === 'P2025') {
      status = HttpStatus.NOT_FOUND;
      message = 'Registro não encontrado';
    }

    response.status(status).json({
      statusCode: status,
      message,
      error: status === HttpStatus.BAD_REQUEST ? 'Bad Request' : 'Internal Server Error',
    });
  }
}
