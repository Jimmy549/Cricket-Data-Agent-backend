import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Player, PlayerDocument } from '../schemas/player.schema';
import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { MemoryService } from './memory.service';

interface WorkflowTrace {
  nodeId: string;
  nodeName: string;
  usedLLM: boolean;
  input: any;
  output: any;
  timestamp: Date;
}

@Injectable()
export class LanggraphService {
  private llm: ChatOpenAI | null;
  private workflowTrace: WorkflowTrace[] = [];

  constructor(
    @InjectModel(Player.name) private playerModel: Model<PlayerDocument>,
    private memoryService: MemoryService,
  ) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      this.llm = null;
    } else {
      this.llm = new ChatOpenAI({
        openAIApiKey: apiKey,
        modelName: process.env.GEMINI_MODEL || 'google/gemini-3-flash-preview',
        temperature: 0,
        maxTokens: 500,
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

  private initializeLLM(): ChatOpenAI {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error('No API key found');
    }
    return new ChatOpenAI({
      openAIApiKey: apiKey,
      modelName: process.env.GEMINI_MODEL || 'google/gemini-3-flash-preview',
      temperature: 0,
      maxTokens: 500,
      configuration: {
        baseURL: 'https://openrouter.ai/api/v1',
        defaultHeaders: {
          'HTTP-Referer': 'http://localhost:3001',
          'X-Title': 'Cricket Data Agent'
        }
      }
    });
  }

  async processQuestion(question: string, userId: string = 'default', reqId: string = 'n/a'): Promise<any> {
    this.workflowTrace = [];
    console.log(`🧠 processQuestion reqId=${reqId} userId=${userId}`);
    
    // Debug: Check if Babar data exists
    if (question.toLowerCase().includes('babar')) {
      const babarCheck = await this.playerModel.find({ name: { $regex: 'Babar', $options: 'i' } }).exec();
      console.log('🔍 Babar data check:', babarCheck.length, 'records found');
      if (babarCheck.length > 0) {
        console.log('📋 Babar formats available:', babarCheck.map(p => `${p.name} - ${p.format}`));
      }
    }
    
    const isRelevant = await this.checkRelevancy(question);
    if (!isRelevant) {
      return {
        success: false,
        message: "Sorry, I can only answer cricket-related questions.",
        format: 'text',
        trace: this.workflowTrace
      };
    }

    const memory = await this.retrieveMemory(userId);
    const mongoQuery = await this.generateQuery(question, memory);
    const results = await this.executeQuery(mongoQuery);
    const formattedAnswer = await this.formatAnswer(question, results, mongoQuery);
    
    // Save conversation to memory
    await this.saveMemory(userId, question, formattedAnswer);
    
    return this.finalResponse(formattedAnswer);
  }

  private async checkRelevancy(question: string): Promise<boolean> {
    try {
      // If no LLM configured, use deterministic keyword-based relevancy.
      if (!process.env.OPENROUTER_API_KEY) {
        const q = question.toLowerCase();
        const cricketKeywords = [
          'cricket', 'test', 'odi', 't20', 't-20', 'ipl', 'bbl', 'psl',
          'runs', 'run', 'average', 'strike rate', 'sr', 'century', 'hundred',
          'fifty', 'duck', 'batsman', 'batter', 'player', 'innings', 'match',
          'highest score', 'top', 'most'
        ];
        const isRelevant = cricketKeywords.some(k => q.includes(k));
        this.workflowTrace.push({
          nodeId: '1',
          nodeName: 'Relevancy Checker (Fallback)',
          usedLLM: false,
          input: question,
          output: isRelevant,
          timestamp: new Date()
        });
        return isRelevant;
      }

      if (!this.llm) this.llm = this.initializeLLM();
      
      const prompt = PromptTemplate.fromTemplate(
        `You are a cricket domain expert. Determine if the following question is related to cricket.
        
        Question: {question}
        
        Respond with only 'true' if the question is about cricket, or 'false' if it's not about cricket.`
      );
      
      const chain = prompt.pipe(this.llm);
      const response = await chain.invoke({ question });
      const isRelevant = response.content.toString().toLowerCase().trim() === 'true';
      
      this.workflowTrace.push({
        nodeId: '1',
        nodeName: 'Relevancy Checker',
        usedLLM: true,
        input: question,
        output: isRelevant,
        timestamp: new Date()
      });
      
      return isRelevant;
    } catch (error) {
      // If LLM fails, fallback to keyword relevancy instead of failing the whole request.
      console.error('LLM Error (relevancy), using fallback:', error.message);
      const q = question.toLowerCase();
      const isRelevant = /cricket|test|odi|t20|runs|average|strike|century|player|batsman|innings|match/.test(q);
      this.workflowTrace.push({
        nodeId: '1',
        nodeName: 'Relevancy Checker (Fallback after error)',
        usedLLM: false,
        input: question,
        output: isRelevant,
        timestamp: new Date()
      });
      return isRelevant;
    }
  }

  private async retrieveMemory(userId: string): Promise<string> {
    try {
      const memory = await this.memoryService.getMemory(userId);
      
      this.workflowTrace.push({
        nodeId: '2',
        nodeName: 'Memory Retriever',
        usedLLM: false,
        input: { userId },
        output: memory ? 'Memory retrieved' : 'No memory found',
        timestamp: new Date()
      });
      
      return memory;
    } catch (error) {
      console.error('Memory retrieval error:', error);
      return '';
    }
  }

  private async generateQuery(question: string, memory: string = ''): Promise<any> {
    try {
      // If no LLM configured, always use fallback query generation.
      if (!process.env.OPENROUTER_API_KEY) {
        const fallbackQuery = this.generateQueryFallback(question);
        this.workflowTrace.push({
          nodeId: '3',
          nodeName: 'Query Generator (No-LLM Fallback)',
          usedLLM: false,
          input: { question, memory },
          output: fallbackQuery,
          timestamp: new Date()
        });
        return fallbackQuery;
      }

      if (!this.llm) this.llm = this.initializeLLM();
      
      const prompt = PromptTemplate.fromTemplate(
        `Convert to MongoDB query using current question and conversation memory. Return ONLY valid JSON:
        
        Current Question: {question}
        
        Conversation Memory: {memory}
        
        Examples:
        "babar azam" -> {{"type":"find","filter":{{"name":{{"$regex":"Babar","$options":"i"}}}},"sort":{{"runs":-1}},"limit":5}}
        "babar azam t20" -> {{"type":"find","filter":{{"name":{{"$regex":"Babar","$options":"i"}},"format":"t20"}},"sort":{{"runs":-1}},"limit":5}}
        "highest scores" -> {{"type":"find","filter":{{}},"sort":{{"runs":-1}},"limit":5}}
        "kohli" -> {{"type":"find","filter":{{"name":{{"$regex":"Kohli","$options":"i"}}}},"sort":{{"runs":-1}},"limit":5}}
        
        Use memory context to understand references like "and what about Test cricket?" or "same player in ODI".
        
        Return JSON only:`
      );
      
      const chain = prompt.pipe(this.llm);
      const response = await chain.invoke({ question, memory });
      
      let responseText = response.content.toString().trim();
      
      // Aggressive cleaning
      responseText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      responseText = responseText.replace(/^[^{]*/, '').replace(/[^}]*$/, '');
      
      // Find JSON object
      const jsonStart = responseText.indexOf('{');
      const jsonEnd = responseText.lastIndexOf('}') + 1;
      
      if (jsonStart !== -1 && jsonEnd > jsonStart) {
        responseText = responseText.substring(jsonStart, jsonEnd);
      }
      
      const queryObj = JSON.parse(responseText);
      
      this.workflowTrace.push({
        nodeId: '3',
        nodeName: 'Query Generator',
        usedLLM: true,
        input: { question, memory },
        output: queryObj,
        timestamp: new Date()
      });
      
      return queryObj;
    } catch (error) {
      console.error('LLM Query Error, using fallback:', error.message);
      
      // Use fallback query generation
      const fallbackQuery = this.generateQueryFallback(question);
      
      this.workflowTrace.push({
        nodeId: '3',
        nodeName: 'Query Generator (Fallback)',
        usedLLM: false,
        input: { question, memory },
        output: fallbackQuery,
        timestamp: new Date()
      });
      
      return fallbackQuery;
    }
  }

  private sanitizeQuery(queryObj: any): any {
    const safeTypes = new Set(['find', 'findOne']);
    const safeSortFields = new Set(['runs', 'average', 'strikeRate', 'matches', 'innings', 'centuries', 'fifties', 'ducks']);
    const safeFilterFields = new Set(['name', 'country', 'format', 'runs', 'average', 'strikeRate', 'matches', 'innings', 'centuries', 'fifties', 'ducks']);

    const type = safeTypes.has(queryObj?.type) ? queryObj.type : 'find';
    const rawFilter = (queryObj?.filter && typeof queryObj.filter === 'object') ? queryObj.filter : {};
    const rawSort = (queryObj?.sort && typeof queryObj.sort === 'object') ? queryObj.sort : undefined;
    const rawLimit = Number(queryObj?.limit);

    // Filter: allowlist keys only
    const filter: Record<string, any> = {};
    for (const key of Object.keys(rawFilter)) {
      if (!safeFilterFields.has(key)) continue;
      const val = rawFilter[key];
      if (key === 'format' && typeof val === 'string') {
        const normalized = val.toLowerCase().trim();
        if (normalized === 'test' || normalized === 'odi' || normalized === 't20') {
          filter[key] = normalized;
        }
        continue;
      }
      // Only allow regex object for name/country; otherwise allow primitives + simple comparison operators
      if ((key === 'name' || key === 'country') && val && typeof val === 'object') {
        const allowedRegexObj: any = {};
        if (typeof val.$regex === 'string') allowedRegexObj.$regex = val.$regex;
        if (typeof val.$options === 'string') allowedRegexObj.$options = val.$options.replace(/[^imsx]/g, '');
        if (Object.keys(allowedRegexObj).length > 0) filter[key] = allowedRegexObj;
        continue;
      }
      filter[key] = val;
    }

    // Sort: allowlist fields only
    let sort: Record<string, 1 | -1> | undefined = undefined;
    if (rawSort) {
      sort = {};
      for (const key of Object.keys(rawSort)) {
        if (!safeSortFields.has(key)) continue;
        sort[key] = rawSort[key] === 1 ? 1 : -1;
      }
      if (Object.keys(sort).length === 0) sort = undefined;
    }

    // Limit: clamp
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 50) : undefined;

    return { type, filter, sort, limit };
  }
  
  private generateQueryFallback(question: string): any {
    const lowerQuestion = question.toLowerCase();
    console.log('Using fallback for question:', lowerQuestion);
    
    // Player specific queries with format
    if (lowerQuestion.includes('babar') && lowerQuestion.includes('t20')) {
      return {
        type: 'find',
        filter: { name: { $regex: 'Babar', $options: 'i' }, format: 't20' },
        sort: { runs: -1 },
        limit: 5
      };
    }
    
    if (lowerQuestion.includes('babar')) {
      return {
        type: 'find',
        filter: { name: { $regex: 'Babar', $options: 'i' } },
        sort: { runs: -1 },
        limit: 5
      };
    }
    
    if (lowerQuestion.includes('kohli') || lowerQuestion.includes('virat')) {
      return {
        type: 'find',
        filter: { name: { $regex: 'Kohli|Virat', $options: 'i' } },
        sort: { runs: -1 },
        limit: 5
      };
    }
    
    // Format specific
    if (lowerQuestion.includes('t20')) {
      return {
        type: 'find',
        filter: { format: 't20' },
        sort: { runs: -1 },
        limit: 5
      };
    }
    
    if (lowerQuestion.includes('odi')) {
      return {
        type: 'find',
        filter: { format: 'odi' },
        sort: { runs: -1 },
        limit: 5
      };
    }
    
    if (lowerQuestion.includes('test')) {
      return {
        type: 'find',
        filter: { format: 'test' },
        sort: { runs: -1 },
        limit: 5
      };
    }
    
    // Default: top scorers
    return {
      type: 'find',
      filter: {},
      sort: { runs: -1 },
      limit: 5
    };
  }

  private async executeQuery(queryObj: any): Promise<any> {
    try {
      const safeQuery = this.sanitizeQuery(queryObj);
      console.log('Executing query:', JSON.stringify(safeQuery));
      
      const projection = {
        _id: 0,
        name: 1,
        country: 1,
        format: 1,
        span: 1,
        matches: 1,
        innings: 1,
        runs: 1,
        highestScore: 1,
        average: 1,
        strikeRate: 1,
        centuries: 1,
        fifties: 1,
        ducks: 1
      };

      if (safeQuery.type === 'findOne') {
        let query = this.playerModel.findOne(safeQuery.filter, projection as any);
        if (safeQuery.sort) {
          query = query.sort(safeQuery.sort);
        }
        const result = await query.exec();
        console.log('Query result:', result ? 'Found 1 record' : 'No records found');
        return result;
      } else {
        let query = this.playerModel.find(safeQuery.filter, projection as any);
        if (safeQuery.sort) {
          query = query.sort(safeQuery.sort);
        }
        if (safeQuery.limit) {
          query = query.limit(safeQuery.limit);
        }
        const results = await query.exec();
        console.log('🔍 Query results:', results.length, 'records found');
        if (results.length > 0) {
          console.log('📋 First result:', results[0].name, results[0].format, results[0].runs);
        } else {
          console.log('❌ No results found for query:', JSON.stringify(queryObj.filter));
        }
      this.workflowTrace.push({
        nodeId: '4',
        nodeName: 'Query Executor',
        usedLLM: false,
        input: safeQuery,
        output: `Executed query, returned ${Array.isArray(results) ? results.length : 1} results`,
        timestamp: new Date()
      });
        return results;
      }
    } catch (error) {
      console.error('Query execution error:', error);
      throw new Error(`Query execution failed: ${error.message}`);
    }
  }

  private async formatAnswer(question: string, results: any, queryObj?: any): Promise<any> {
    if (!results || (Array.isArray(results) && results.length === 0)) {
      return {
        format: 'text',
        data: 'No data found for your query.'
      };
    }

    console.log('Formatting results:', results.length || 1, 'records');
    
    // Check if single result for text format
    if (!Array.isArray(results) || results.length === 1) {
      const player = Array.isArray(results) ? results[0] : results;
      
      // Single player - return as text
      const textAnswer = {
        format: 'text',
        data: `${player.name} (${player.country}) - Format: ${player.format?.toUpperCase()}, Runs: ${player.runs}, Average: ${player.average?.toFixed(2)}, Highest Score: ${player.highestScore}, Strike Rate: ${player.strikeRate?.toFixed(2)}`
      };
      
      this.workflowTrace.push({
        nodeId: '5',
        nodeName: 'Answer Formatter',
        usedLLM: false,
        input: { question, results, queryObj },
        output: textAnswer,
        timestamp: new Date()
      });
      
      return textAnswer;
    }
    
    // Multiple results - return as table
    const tableData = results.map(player => ({
      Name: player.name || 'Unknown',
      Country: player.country || 'Unknown', 
      Format: player.format?.toUpperCase() || 'ALL',
      Runs: player.runs || 0,
      Average: player.average?.toFixed(2) || '0.00',
      'Strike Rate': player.strikeRate?.toFixed(2) || '0.00',
      'Highest Score': player.highestScore || '0',
      Matches: player.matches || 0
    }));
    
    const tableAnswer = {
      format: 'table',
      data: tableData
    };
    
    console.log('Formatted answer:', tableAnswer);
    
    this.workflowTrace.push({
      nodeId: '5',
      nodeName: 'Answer Formatter',
      usedLLM: false,
      input: { question, results, queryObj },
      output: tableAnswer,
      timestamp: new Date()
    });
    
    return tableAnswer;
  }
  
  private formatAnswerFallback(results: any): any {
    if (!Array.isArray(results)) {
      return {
        format: 'text',
        data: `${results.name} (${results.country}) - Runs: ${results.runs}, Average: ${results.average}, Highest Score: ${results.highestScore}`
      };
    }

    const tableData = results.slice(0, 5).map(player => ({
      Name: player.name,
      Country: player.country,
      Format: player.format?.toUpperCase() || 'ALL',
      Runs: player.runs,
      Average: player.average?.toFixed(2) || '0.00',
      'Highest Score': player.highestScore || '0'
    }));

    return {
      format: 'table',
      data: tableData
    };
  }

  private async saveMemory(userId: string, question: string, formattedAnswer: any): Promise<void> {
    try {
      const answerText = formattedAnswer.format === 'table' 
        ? `Table with ${formattedAnswer.data?.length || 0} results`
        : formattedAnswer.data || formattedAnswer.message;
      
      await this.memoryService.saveConversation(
        userId, 
        question, 
        answerText, 
        formattedAnswer.format,
        formattedAnswer.data
      );
      
      this.workflowTrace.push({
        nodeId: '6',
        nodeName: 'Memory Saver',
        usedLLM: false,
        input: { userId, question, answer: answerText },
        output: 'Conversation saved to memory',
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Memory save error:', error);
    }
  }

  private finalResponse(formattedAnswer: any): any {
    this.workflowTrace.push({
      nodeId: '7',
      nodeName: 'Final Response',
      usedLLM: false,
      input: formattedAnswer,
      output: 'Response prepared',
      timestamp: new Date()
    });
    
    return {
      success: true,
      ...formattedAnswer,
      trace: this.workflowTrace
    };
  }
  
  getWorkflowTrace(): WorkflowTrace[] {
    return this.workflowTrace;
  }
}