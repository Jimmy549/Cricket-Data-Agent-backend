import { Controller, Post, Get, Body, UseInterceptors, UploadedFile, Param, HttpException, HttpStatus, Query } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { LanggraphService } from './services/langgraph.service';
import { UploadService } from './services/upload.service';
import { MemoryService } from './services/memory.service';
import { AskQuestionDto, QueryResponseDto } from './dto/cricket.dto';

@Controller('cricket')
export class CricketController {
  constructor(
    private readonly langgraphService: LanggraphService,
    private readonly uploadService: UploadService,
    private readonly memoryService: MemoryService,
  ) {}

  @Post('ask')
  async askQuestion(@Body() askQuestionDto: AskQuestionDto, @Query('userId') userId?: string): Promise<QueryResponseDto> {
    // Validate input
    if (!askQuestionDto.question || askQuestionDto.question.trim().length === 0) {
      throw new HttpException(
        'Question cannot be empty',
        HttpStatus.BAD_REQUEST
      );
    }

    if (askQuestionDto.question.length > 500) {
      throw new HttpException(
        'Question must be less than 500 characters',
        HttpStatus.BAD_REQUEST
      );
    }

    try {
      const result = await this.langgraphService.processQuestion(
        askQuestionDto.question.trim(),
        userId || 'default'
      );
      return result;
    } catch (error) {
      console.error('Controller Error:', error);
      return {
        success: false,
        message: `Error processing question: ${error.message || 'Unknown error'}`,
        format: 'text'
      };
    }
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(@UploadedFile() file: any): Promise<any> {
    try {
      // This would handle individual file uploads
      return {
        success: true,
        message: 'File upload endpoint ready',
        filename: file?.originalname
      };
    } catch (error) {
      return {
        success: false,
        message: `Upload failed: ${error.message}`
      };
    }
  }

  @Post('upload-all')
  async uploadAllData(): Promise<any> {
    try {
      const result = await this.uploadService.uploadAllFormats();
      return result;
    } catch (error) {
      return {
        success: false,
        message: `Upload failed: ${error.message}`
      };
    }
  }

  @Get('trace/:id')
  async getTrace(@Param('id') id: string): Promise<any> {
    // For demo purposes, return the last workflow trace
    // In production, you'd store traces with IDs in database
    const trace = this.langgraphService.getWorkflowTrace();
    return {
      success: true,
      traceId: id,
      workflow: trace,
      summary: {
        totalNodes: trace.length,
        llmNodes: trace.filter(t => t.usedLLM).length,
        executionTime: trace.length > 0 ? 
          new Date(trace[trace.length - 1].timestamp).getTime() - new Date(trace[0].timestamp).getTime() : 0
      }
    };
  }

  @Get('stats')
  async getStats(): Promise<any> {
    try {
      const stats = await this.uploadService.getStats();
      return {
        success: true,
        data: stats
      };
    } catch (error) {
      return {
        success: false,
        message: `Error getting stats: ${error.message}`
      };
    }
  }

  @Get('history/:userId')
  async getHistory(@Param('userId') userId: string, @Query('limit') limit?: string): Promise<any> {
    try {
      const conversations = await this.memoryService.getConversationHistory(
        userId, 
        limit ? parseInt(limit) : 50
      );
      return {
        success: true,
        data: conversations,
        count: conversations.length
      };
    } catch (error) {
      return {
        success: false,
        message: `Error getting history: ${error.message}`
      };
    }
  }

  @Get('summary/:userId')
  async getSummary(@Param('userId') userId: string): Promise<any> {
    try {
      const summary = await this.memoryService.getSummary(userId);
      return {
        success: true,
        data: summary
      };
    } catch (error) {
      return {
        success: false,
        message: `Error getting summary: ${error.message}`
      };
    }
  }

  @Post('clear-memory/:userId')
  async clearMemory(@Param('userId') userId: string): Promise<any> {
    try {
      await this.memoryService.clearMemory(userId);
      return {
        success: true,
        message: 'Memory cleared successfully'
      };
    } catch (error) {
      return {
        success: false,
        message: `Error clearing memory: ${error.message}`
      };
    }
  }

  @Get('health')
  async healthCheck(): Promise<any> {
    return {
      success: true,
      message: 'Cricket API is running',
      timestamp: new Date().toISOString()
    };
  }
}