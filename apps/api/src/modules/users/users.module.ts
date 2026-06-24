import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { AuditService } from '../../common/audit/audit.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService, AuditService],
})
export class UsersModule {}
