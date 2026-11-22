import { Module } from '@nestjs/common';
import { DomainModule } from '../domain.module';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';
import { AssistantTools } from './assistant.tools';
import { ClaudeProvider } from './claude.provider';
import { DemoProvider } from './demo.provider';

/** NOVA AI: providers, tools and confirm-before-write proposals (ADR-0005). */
@Module({
  imports: [DomainModule],
  controllers: [AssistantController],
  providers: [AssistantService, AssistantTools, DemoProvider, ClaudeProvider],
})
export class AssistantModule {}
