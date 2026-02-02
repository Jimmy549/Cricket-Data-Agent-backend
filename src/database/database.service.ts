import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Player, PlayerDocument } from '../cricket/schemas/player.schema';
import * as fs from 'fs';
import * as path from 'path';
const csv = require('csv-parser');

@Injectable()
export class DatabaseService implements OnModuleInit {
  private readonly logger = new Logger(DatabaseService.name);

  constructor(
    @InjectModel(Player.name) private playerModel: Model<PlayerDocument>,
  ) {}

  async onModuleInit() {
    this.logger.log('🏏 Starting database initialization...');
    
    try {
      // Force refresh - always reload CSV data
      this.logger.log('🔄 Force refreshing database with latest CSV data...');
      await this.loadAllCsvData();
    } catch (error) {
      this.logger.error(`❌ Database initialization failed: ${error.message}`);
    }
  }

  private async loadAllCsvData(): Promise<void> {
    const formats = ['test', 'odi', 't20'];
    
    for (const format of formats) {
      await this.loadCsvFormat(format);
    }
    
    this.logger.log('✅ All CSV data loaded successfully');
  }

  private async loadCsvFormat(format: string): Promise<void> {
    // Resolve datasets path reliably across:
    // - dev (`nest start --watch`) where cwd is project root
    // - prod (`node dist/main`) where cwd is also typically project root
    const projectRoot = process.cwd();
    const csvPath = path.join(projectRoot, 'datasets', `${format}_players.csv`);
    
    if (!fs.existsSync(csvPath)) {
      this.logger.warn(`⚠️ CSV file not found: ${csvPath}`);
      return;
    }

    const players = [];

    return new Promise((resolve, reject) => {
      fs.createReadStream(csvPath)
        .pipe(csv())
        .on('data', (row) => {
          let player;
          
          if (format === 'test') {
            player = {
              name: row.Player?.trim(),
              format: 'test',
              country: row.Country?.trim() || 'Unknown',
              span: row.Span?.trim(),
              matches: parseInt(row.Matches) || 0,
              innings: parseInt(row.Innings) || 0,
              runs: parseInt(row.Runs) || 0,
              highestScore: row['Highest Score']?.trim() || '0',
              average: parseFloat(row.Average) || 0,
              strikeRate: parseFloat(row['Strike Rate']) || 0,
              centuries: parseInt(row['100']) || 0,
              fifties: parseInt(row['50']) || 0,
              ducks: parseInt(row.Ducks) || 0
            };
          } else if (format === 'odi') {
            player = {
              name: row.Player?.trim(),
              format: 'odi',
              country: row.Country?.trim() || 'Unknown',
              span: row.Span?.trim(),
              matches: parseInt(row.Matches) || 0,
              innings: parseInt(row.Innings) || 0,
              runs: parseInt(row.Runs) || 0,
              highestScore: row.HS?.trim() || '0',
              average: parseFloat(row.Average) || 0,
              strikeRate: parseFloat(row.SR) || 0,
              centuries: parseInt(row.Centuries) || 0,
              fifties: parseInt(row.Fifties) || 0,
              ducks: parseInt(row.Ducks) || 0
            };
          } else if (format === 't20') {
            const countryMatch = row.Player?.match(/\(([^)]+)\)/);
            const playerName = row.Player?.replace(/\s*\([^)]*\)\s*/, '').trim();
            
            player = {
              name: playerName,
              format: 't20',
              country: countryMatch ? countryMatch[1] : 'Unknown',
              span: row.Span?.trim(),
              matches: parseInt(row.Mat) || 0,
              innings: parseInt(row.Inns) || 0,
              runs: parseInt(row.Runs) || 0,
              highestScore: row.HS?.trim() || '0',
              average: parseFloat(row.Ave) || 0,
              strikeRate: parseFloat(row.SR) || 0,
              centuries: parseInt(row['100']) || 0,
              fifties: parseInt(row['50']) || 0,
              ducks: parseInt(row['0']) || 0
            };
          }
          
          if (player && player.name && player.name.trim()) {
            players.push(player);
          }
        })
        .on('end', async () => {
          try {
            // Clear existing data for this format
            const deletedCount = await this.playerModel.deleteMany({ format });
            this.logger.log(`🗑️ Deleted ${deletedCount.deletedCount} existing ${format.toUpperCase()} records`);
            
            if (players.length > 0) {
              await this.playerModel.insertMany(players);
              this.logger.log(`✅ Loaded ${players.length} ${format.toUpperCase()} players`);
              
              // Log sample data for verification
              const samplePlayer = players.find(p => p.name?.toLowerCase().includes('babar'));
              if (samplePlayer) {
                this.logger.log(`📋 Sample ${format} player: ${samplePlayer.name} - ${samplePlayer.runs} runs`);
              }
            } else {
              this.logger.warn(`⚠️ No valid players found in ${format} CSV`);
            }
            
            resolve();
          } catch (error) {
            this.logger.error(`❌ Error loading ${format} data:`, error);
            reject(error);
          }
        })
        .on('error', reject);
    });
  }

  async getStats(): Promise<any> {
    const stats = {};
    
    for (const format of ['test', 'odi', 't20']) {
      const count = await this.playerModel.countDocuments({ format });
      const totalRuns = await this.playerModel
        .aggregate([
          { $match: { format } },
          { $group: { _id: null, total: { $sum: '$runs' } } }
        ])
        .exec();
      
      stats[format] = {
        players: count,
        totalRuns: totalRuns[0]?.total || 0
      };
    }
    
    return stats;
  }
}