import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CricketController } from './cricket.controller';
import { LanggraphService } from './services/langgraph.service';
import { UploadService } from './services/upload.service';
import { MemoryService } from './services/memory.service';
import { Player, PlayerSchema } from './schemas/player.schema';
import { Conversation, ConversationSchema } from './schemas/conversation.schema';
import { Summary, SummarySchema } from './schemas/summary.schema';
import { DatabaseService } from '../database/database.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Player.name, schema: PlayerSchema },
      { name: Conversation.name, schema: ConversationSchema },
      { name: Summary.name, schema: SummarySchema }
    ])
  ],
  controllers: [CricketController],
  providers: [LanggraphService, UploadService, MemoryService, DatabaseService],
  exports: [LanggraphService, UploadService, MemoryService]
})
export class CricketModule {}