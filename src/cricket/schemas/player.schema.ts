import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PlayerDocument = Player & Document;

@Schema()
export class Player {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  format: string; // 'test', 'odi', 't20'

  @Prop({ default: 0 })
  matches: number;

  @Prop({ default: 0 })
  runs: number;

  @Prop({ default: 0 })
  average: number;

  @Prop({ default: 0 })
  strikeRate: number;

  @Prop()
  highestScore: string; // Keep as string to handle values like "200*"

  @Prop({ required: true })
  country: string;

  @Prop()
  span: string;

  @Prop({ default: 0 })
  innings: number;

  @Prop({ default: 0 })
  centuries: number;

  @Prop({ default: 0 })
  fifties: number;

  @Prop({ default: 0 })
  ducks: number;
}

export const PlayerSchema = SchemaFactory.createForClass(Player);

// Create indexes for better query performance
PlayerSchema.index({ format: 1, runs: -1 });
PlayerSchema.index({ format: 1, average: -1 });
PlayerSchema.index({ name: 1, format: 1 });
PlayerSchema.index({ country: 1, format: 1 });