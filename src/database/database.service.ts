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
      const count = await this.playerModel.countDocuments();
      
      if (count === 0) {
        this.logger.log('📊 No data found. Loading CSV data...');
        await this.loadAllCsvData();
      } else {
        this.logger.log(`✅ Database already has ${count} records`);
      }
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
    const csvPath = path.join(__dirname, '../../datasets', `${format}_players.csv`);
    
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
            await this.playerModel.deleteMany({ format });
            
            if (players.length > 0) {
              await this.playerModel.insertMany(players);
              this.logger.log(`✅ Loaded ${players.length} ${format.toUpperCase()} players`);
            }
            
            resolve();
          } catch (error) {
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