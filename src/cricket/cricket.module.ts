import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CricketController } from './cricket.controller';
import { LanggraphService } from './services/langgraph.service';
import { UploadService } from './services/upload.service';
import { Player, PlayerSchema } from './schemas/player.schema';
import { DatabaseService } from '../database/database.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Player.name, schema: PlayerSchema }])
  ],
  controllers: [CricketController],
  providers: [LanggraphService, UploadService, DatabaseService],
  exports: [LanggraphService, UploadService]
})
export class CricketModule {}