import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MailModule } from './common/mail/mail.module';
import { PushModule } from './common/push/push.module';
import { GeocodingModule } from './common/geocoding/geocoding.module';
import { AuthModule } from './modules/auth/auth.module';
import { StoresModule } from './modules/stores/stores.module';
import { UsersModule } from './modules/users/users.module';
import { CustomersModule } from './modules/customers/customers.module';
import { ProductsModule } from './modules/products/products.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { PurchaseInvoicesModule } from './modules/purchase-invoices/purchase-invoices.module';
import { StockModule } from './modules/stock/stock.module';
import { StockTransfersModule } from './modules/stock-transfers/stock-transfers.module';
import { SalesModule } from './modules/sales/sales.module';
import { DeliverersModule } from './modules/deliverers/deliverers.module';
import { DeliveriesModule } from './modules/deliveries/deliveries.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { ReportsModule } from './modules/reports/reports.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { HealthModule } from './modules/health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { RealtimeModule } from './common/realtime/realtime.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
    }),
    MailModule,
    PushModule,
    GeocodingModule,
    PrismaModule,
    RealtimeModule,
    AuthModule,
    StoresModule,
    UsersModule,
    CustomersModule,
    ProductsModule,
    SuppliersModule,
    PurchaseInvoicesModule,
    StockModule,
    StockTransfersModule,
    SalesModule,
    DeliverersModule,
    DeliveriesModule,
    DashboardModule,
    ReportsModule,
    NotificationsModule,
    HealthModule,
  ],
})
export class AppModule {}
