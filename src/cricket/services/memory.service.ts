import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Conversation, ConversationDocument } from '../schemas/conversation.schema';
import { Summary, SummaryDocument } from '../schemas/summary.schema';
import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';

@Injectable()
export class MemoryService {
  private llm: ChatOpenAI | null;

  constructor(
    @InjectModel(Conversation.name) private conversationModel: Model<ConversationDocument>,
    @InjectModel(Summary.name) private summaryModel: Model<SummaryDocument>,
  ) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (apiKey) {
      this.llm = new ChatOpenAI({
        openAIApiKey: apiKey,
        modelName: process.env.GEMINI_MODEL || 'google/gemini-3-flash-preview',
        temperature: 0,
        maxTokens: 300,
        configuration: {
          baseURL: 'https://openrouter.ai/api/v1',
          defaultHeaders: {
            'HTTP-Referer': 'https://cricket-data-agent-backend.onrender.com',
            'X-Title': 'Cricket Data Agent'
          }
        }
      });
    }
  }

  async getMemory(userId: string): Promise<string> {
    try {
      // Get recent conversations (last 10)
      const recentConversations = await this.conversationModel
        .find({ userId })
        .sort({ timestamp: -1 })
        .limit(10)
        .exec();

      // Get summary if exists
      const summary = await this.summaryModel.findOne({ userId }).exec();

      let memoryContext = '';

      if (summary) {
        memoryContext += `Previous conversation summary: ${summary.summary}\n\n`;
      }

      if (recentConversations.length > 0) {
        memoryContext += 'Recent conversation history:\n';
        recentConversations.reverse().forEach((conv, index) => {
          memoryContext += `${index + 1}. User: ${conv.question}\n   Bot: ${conv.answer}\n`;
        });
      }

      return memoryContext.trim();
    } catch (error) {
      console.error('Memory retrieval error:', error);
      return '';
    }
  }

  async saveConversation(userId: string, question: string, answer: string, format: string = 'text', data?: any): Promise<void> {
    try {
      const conversation = new this.conversationModel({
        userId,
        question,
        answer,
        format,
        data,
        timestamp: new Date()
      });

      await conversation.save();

      // Check if we need to summarize (if more than 20 conversations)
      const conversationCount = await this.conversationModel.countDocuments({ userId });
      
      if (conversationCount > 20) {
        await this.summarizeAndCleanup(userId);
      }
    } catch (error) {
      console.error('Save conversation error:', error);
    }
  }

  private async summarizeAndCleanup(userId: string): Promise<void> {
    try {
      if (!this.llm) return;

      // Get all conversations for user
      const conversations = await this.conversationModel
        .find({ userId })
        .sort({ timestamp: 1 })
        .exec();

      if (conversations.length <= 10) return;

      // Take older conversations (keep last 5)
      const conversationsToSummarize = conversations.slice(0, -5);
      
      // Create summary text
      const conversationText = conversationsToSummarize
        .map(conv => `User: ${conv.question}\nBot: ${conv.answer}`)
        .join('\n\n');

      const prompt = PromptTemplate.fromTemplate(
        `Summarize this cricket conversation history into key facts and context that would be useful for future questions. Keep it concise (max 200 words):

{conversations}

Summary:`
      );

      const chain = prompt.pipe(this.llm);
      const response = await chain.invoke({ conversations: conversationText });
      const summaryText = response.content.toString().trim();

      // Update or create summary
      await this.summaryModel.findOneAndUpdate(
        { userId },
        {
          summary: summaryText,
          conversationCount: conversations.length,
          lastUpdated: new Date()
        },
        { upsert: true }
      );

      // Delete old conversations (keep last 5)
      const conversationIdsToDelete = conversationsToSummarize.map(conv => conv._id);
      await this.conversationModel.deleteMany({ _id: { $in: conversationIdsToDelete } });

    } catch (error) {
      console.error('Summarization error:', error);
    }
  }

  async getConversationHistory(userId: string, limit: number = 50): Promise<any[]> {
    try {
      const conversations = await this.conversationModel
        .find({ userId })
        .sort({ timestamp: -1 })
        .limit(limit)
        .exec();

      return conversations.map(conv => ({
        id: conv._id,
        question: conv.question,
        answer: conv.answer,
        format: conv.format,
        data: conv.data,
        timestamp: conv.timestamp
      }));
    } catch (error) {
      console.error('Get history error:', error);
      return [];
    }
  }

  async getSummary(userId: string): Promise<any> {
    try {
      const summary = await this.summaryModel.findOne({ userId }).exec();
      return summary ? {
        summary: summary.summary,
        conversationCount: summary.conversationCount,
        lastUpdated: summary.lastUpdated
      } : null;
    } catch (error) {
      console.error('Get summary error:', error);
      return null;
    }
  }

  async clearMemory(userId: string): Promise<void> {
    try {
      await this.conversationModel.deleteMany({ userId });
      await this.summaryModel.deleteOne({ userId });
    } catch (error) {
      console.error('Clear memory error:', error);
    }
  }
}