import { Module } from '@nestjs/common';
import { DomainModule } from '../domain.module';
import { StudioModule } from '../studio/studio.module';
import { StudioTools } from './studio.tools';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';
import { AssistantTools } from './assistant.tools';
import { ClaudeProvider } from './claude.provider';
import { DemoProvider } from './demo.provider';

/** NOVA AI: providers, tools and confirm-before-write proposals (ADR-0005). */
@Module({
  imports: [DomainModule, StudioModule],
  controllers: [AssistantController],
  providers: [AssistantService, AssistantTools, StudioTools, DemoProvider, ClaudeProvider],
})
export class AssistantModule {}
