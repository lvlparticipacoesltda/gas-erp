import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module';
import { StoresModule } from './modules/stores/stores.module';
import { UsersModule } from './modules/users/users.module';
import { CustomersModule } from './modules/customers/customers.module';
import { ProductsModule } from './modules/products/products.module';
import { StockModule } from './modules/stock/stock.module';
import { StockTransfersModule } from './modules/stock-transfers/stock-transfers.module';
import { SalesModule } from './modules/sales/sales.module';
import { DeliverersModule } from './modules/deliverers/deliverers.module';
import { DeliveriesModule } from './modules/deliveries/deliveries.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { HealthModule } from './modules/health/health.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    StoresModule,
    UsersModule,
    CustomersModule,
    ProductsModule,
    StockModule,
    StockTransfersModule,
    SalesModule,
    DeliverersModule,
    DeliveriesModule,
    DashboardModule,
    HealthModule,
  ],
})
export class AppModule {}
