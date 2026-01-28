import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Player, PlayerDocument } from '../schemas/player.schema';
const csv = require('csv-parser');
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class UploadService {
  constructor(
    @InjectModel(Player.name) private playerModel: Model<PlayerDocument>,
  ) {}

  async uploadCsvData(filePath: string, format: string): Promise<any> {
    const players = [];
    
    return new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => {
          let player;
          
          if (format === 'test') {
            // Test CSV: Player,Country,Span,Matches,Innings,NotOuts,Runs,Highest Score,Average,Balls Faced,Strike Rate,100,50,Ducks,Fours,Sixes
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
            // ODI CSV: Sno,Player,Country,Span,Matches,Innings,No,Runs,HS,Average,BF,SR,Centuries,Fifties,Ducks,Band
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
            // T20 CSV: Player,Span,Mat,Inns,NO,Runs,HS,Ave,BF,SR,100,50,0,4s,6s
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
          
          // Only add if player has a name
          if (player && player.name && player.name.trim()) {
            players.push(player);
          }
        })
        .on('end', async () => {
          try {
            // Clear existing data for this format
            await this.playerModel.deleteMany({ format });
            
            // Insert new data
            if (players.length > 0) {
              await this.playerModel.insertMany(players);
            }
            
            resolve({
              success: true,
              message: `Successfully uploaded ${players.length} ${format} players`,
              count: players.length,
              format
            });
          } catch (error) {
            reject(error);
          }
        })
        .on('error', (error) => {
          reject(error);
        });
    });
  }

  async uploadAllFormats(): Promise<any> {
    const results = [];
    const projectRoot = path.resolve(__dirname, '../../..');
    const formats = [
      { file: path.join(projectRoot, 'datasets', 'test_players.csv'), format: 'test' },
      { file: path.join(projectRoot, 'datasets', 'odi_players.csv'), format: 'odi' },
      { file: path.join(projectRoot, 'datasets', 't20_players.csv'), format: 't20' }
    ];

    console.log('Project root:', projectRoot);
    console.log('Looking for files:', formats.map(f => f.file));

    for (const { file, format } of formats) {
      try {
        // Check if file exists
        if (!fs.existsSync(file)) {
          console.error(`File not found: ${file}`);
          results.push({
            success: false,
            format,
            error: `File not found: ${file}`
          });
          continue;
        }
        
        console.log(`Processing ${format} file: ${file}`);
        const result = await this.uploadCsvData(file, format);
        results.push(result);
        console.log(`Completed ${format}: ${result.count} players`);
      } catch (error) {
        console.error(`Error processing ${format}:`, error.message);
        results.push({
          success: false,
          format,
          error: error.message
        });
      }
    }

    const totalUploaded = results.filter(r => r.success).reduce((sum, r) => sum + (r.count || 0), 0);
    
    return {
      success: results.some(r => r.success),
      results,
      totalUploaded,
      summary: {
        test: results.find(r => r.format === 'test')?.count || 0,
        odi: results.find(r => r.format === 'odi')?.count || 0,
        t20: results.find(r => r.format === 't20')?.count || 0
      }
    };
  }

  async getStats(): Promise<any> {
    const stats = await Promise.all([
      this.playerModel.countDocuments({ format: 'test' }),
      this.playerModel.countDocuments({ format: 'odi' }),
      this.playerModel.countDocuments({ format: 't20' }),
      this.playerModel.countDocuments({})
    ]);

    return {
      test: stats[0],
      odi: stats[1],
      t20: stats[2],
      total: stats[3]
    };
  }
}