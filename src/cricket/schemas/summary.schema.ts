import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SummaryDocument = Summary & Document;

@Schema({ timestamps: true })
export class Summary {
  @Prop({ required: true, unique: true })
  userId: string;

  @Prop({ required: true })
  summary: string;

  @Prop({ default: 0 })
  conversationCount: number;

  @Prop({ default: Date.now })
  lastUpdated: Date;
}

export const SummarySchema = SchemaFactory.createForClass(Summary);
// Note: `unique: true` on `userId` already creates an index; avoid duplicate index warnings.