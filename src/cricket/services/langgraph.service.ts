import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Player, PlayerDocument } from '../schemas/player.schema';
import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';

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
            'HTTP-Referer': 'http://localhost:3001',
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

  async processQuestion(question: string): Promise<any> {
    this.workflowTrace = [];
    
    const isRelevant = await this.checkRelevancy(question);
    if (!isRelevant) {
      return {
        success: false,
        message: "Sorry, I can only answer cricket-related questions.",
        format: 'text',
        trace: this.workflowTrace
      };
    }

    const mongoQuery = await this.generateQuery(question);
    const results = await this.executeQuery(mongoQuery);
    const formattedAnswer = await this.formatAnswer(question, results, mongoQuery);
    
    return this.finalResponse(formattedAnswer);
  }

  private async checkRelevancy(question: string): Promise<boolean> {
    try {
      if (!this.llm) {
        this.llm = this.initializeLLM();
      }
      
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
      console.error('LLM Error:', error.message);
      throw error;
    }
  }

  private async generateQuery(question: string): Promise<any> {
    try {
      if (!this.llm) {
        this.llm = this.initializeLLM();
      }
      
      const prompt = PromptTemplate.fromTemplate(
        `Convert to MongoDB query. Return ONLY valid JSON:
        
        Question: {question}
        
        Examples:
        "babar azam" -> {{"type":"find","filter":{{"name":{{"$regex":"Babar","$options":"i"}}}},"sort":{{"runs":-1}},"limit":5}}
        "highest scores" -> {{"type":"find","filter":{{}},"sort":{{"runs":-1}},"limit":5}}
        "kohli" -> {{"type":"find","filter":{{"name":{{"$regex":"Kohli","$options":"i"}}}},"sort":{{"runs":-1}},"limit":5}}
        
        Return JSON only:`
      );
      
      const chain = prompt.pipe(this.llm);
      const response = await chain.invoke({ question });
      
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
        nodeId: '2',
        nodeName: 'Query Generator',
        usedLLM: true,
        input: question,
        output: queryObj,
        timestamp: new Date()
      });
      
      return queryObj;
    } catch (error) {
      console.error('LLM Query Error:', error.message);
      throw new Error(`LLM query generation failed: ${error.message}`);
    }
  }
  
  private generateQueryFallback(question: string): any {
    const lowerQuestion = question.toLowerCase();
    
    // Player specific queries
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
      if (queryObj.type === 'findOne') {
        let query = this.playerModel.findOne(queryObj.filter);
        if (queryObj.sort) {
          query = query.sort(queryObj.sort);
        }
        return await query.exec();
      } else {
        let query = this.playerModel.find(queryObj.filter);
        if (queryObj.sort) {
          query = query.sort(queryObj.sort);
        }
        if (queryObj.limit) {
          query = query.limit(queryObj.limit);
        }
        return await query.exec();
      }
    } catch (error) {
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

    try {
      if (!this.llm) {
        this.llm = this.initializeLLM();
      }
      
      const limitedResults = Array.isArray(results) ? results.slice(0, 5) : results;
      
      const prompt = PromptTemplate.fromTemplate(
        `Format cricket data as JSON table. Return ONLY valid JSON:
        
        Data: {results}
        
        Required format:
        {{"format": "table", "data": [{{"Name": "PlayerName", "Country": "CountryCode", "Runs": 1000}}]}}
        
        Return JSON only, no text:`
      );
      
      const chain = prompt.pipe(this.llm);
      const response = await chain.invoke({ 
        results: JSON.stringify(limitedResults, null, 2).substring(0, 1500)
      });
      
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
      
      const formattedAnswer = JSON.parse(responseText);
      
      this.workflowTrace.push({
        nodeId: '4',
        nodeName: 'Answer Formatter',
        usedLLM: true,
        input: { question, results: limitedResults, queryObj },
        output: formattedAnswer,
        timestamp: new Date()
      });
      
      return formattedAnswer;
    } catch (error) {
      console.error('LLM JSON Error:', error.message);
      console.error('Raw response:', error.response || 'No response');
      throw new Error(`LLM formatting failed: ${error.message}`);
    }
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

  private finalResponse(formattedAnswer: any): any {
    this.workflowTrace.push({
      nodeId: '5',
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