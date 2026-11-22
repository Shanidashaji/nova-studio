import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { RequestContextMiddleware } from './common/request-context.middleware';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { ActivityModule } from './modules/activity/activity.module';
import { AssistantModule } from './modules/assistant/assistant.module';
import { DomainModule } from './modules/domain.module';
import { ErpModule } from './modules/erp.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    EventEmitterModule.forRoot(),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    ActivityModule,
    AuthModule,
    DomainModule,
    ErpModule,
    AssistantModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: HttpExceptionFilter }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('*path');
  }
}
