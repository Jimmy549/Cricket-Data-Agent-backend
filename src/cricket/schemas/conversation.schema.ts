import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import * as mongoose from 'mongoose';

export type ConversationDocument = Conversation & Document;

@Schema({ timestamps: true })
export class Conversation {
  @Prop({ required: true })
  userId: string;

  @Prop({ required: true })
  question: string;

  @Prop({ required: true })
  answer: string;

  @Prop({ default: 'text' })
  format: string;

  @Prop({ type: mongoose.Schema.Types.Mixed })
  data?: any;

  @Prop({ default: Date.now })
  timestamp: Date;
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);

// Create indexes for better query performance
ConversationSchema.index({ userId: 1, timestamp: -1 });
ConversationSchema.index({ userId: 1, createdAt: -1 });