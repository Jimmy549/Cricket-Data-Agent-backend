# Cricket Data Agent Backend

A NestJS-based backend service that provides intelligent cricket data analysis using LangGraph workflows and Gemini AI.

## 🚀 Features

- **AI-Powered Analysis**: Uses Gemini 3 Flash via OpenRouter for intelligent cricket data queries
- **LangGraph Workflows**: Structured AI workflows for complex data analysis
- **Auto Data Seeding**: Automatically loads cricket data from CSV files on startup
- **MongoDB Integration**: Stores and queries cricket player statistics
- **RESTful API**: Clean API endpoints for frontend integration
- **Format Support**: Test, ODI, and T20 cricket formats

## 📋 Prerequisites

- Node.js 18+ 
- MongoDB (local or cloud)
- OpenRouter API key

## 🛠️ Installation

1. **Clone and navigate:**
   ```bash
   cd Cricket-Data-Agent-backend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Environment setup:**
   Create `.env` file:
   ```env
   OPENROUTER_API_KEY=sk-or-v1-your_actual_key_here
   GEMINI_MODEL=google/gemini-3-flash-preview
   MONGODB_URI=mongodb://localhost:27017/cricket-data
   PORT=3001
   NODE_ENV=development
   CORS_ORIGIN=http://localhost:3000
   ```

4. **Get OpenRouter API Key:**
   - Visit https://openrouter.ai
   - Sign up (free account available)
   - Generate API key from dashboard
   - Add to `.env` file

## 🏃‍♂️ Running the Application

### Development Mode
```bash
npm run start:dev
```

### Production Mode
```bash
npm run build
npm run start:prod
```

The server will start on `http://localhost:3001`

## 📊 Data Management

### Auto-Seeding
The application automatically loads cricket data from CSV files on startup:
- `datasets/test_players.csv` - Test cricket data
- `datasets/odi_players.csv` - ODI cricket data  
- `datasets/t20_players.csv` - T20 cricket data

### Manual Data Upload
```bash
# Upload all formats
curl -X POST http://localhost:3001/cricket/upload-all

# Check data stats
curl -X GET http://localhost:3001/cricket/stats
```

## 🔌 API Endpoints

### Health Check
```bash
GET /cricket/health
```

### Ask Questions
```bash
POST /cricket/ask
Content-Type: application/json

{
  "question": "Who has the most runs in Test cricket?"
}
```

### Get Statistics
```bash
GET /cricket/stats
```

### Upload Data
```bash
POST /cricket/upload-all
```

### Get Workflow Trace
```bash
GET /cricket/trace/:id
```

## 🧪 Testing

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Test coverage
npm run test:cov
```

## 📁 Project Structure

```
src/
├── cricket/           # Cricket module
│   ├── controllers/   # API controllers
│   ├── services/      # Business logic
│   ├── schemas/       # MongoDB schemas
│   └── dto/          # Data transfer objects
├── database/         # Database services
├── app.module.ts     # Main app module
└── main.ts          # Application entry point
```

## 🔧 Configuration

### Environment Variables
- `OPENROUTER_API_KEY`: Your OpenRouter API key
- `GEMINI_MODEL`: AI model to use (default: google/gemini-3-flash-preview)
- `MONGODB_URI`: MongoDB connection string
- `PORT`: Server port (default: 3001)
- `NODE_ENV`: Environment (development/production)
- `CORS_ORIGIN`: Frontend URL for CORS

### MongoDB Setup
Local MongoDB:
```bash
# Using Docker
docker run -d -p 27017:27017 --name mongodb mongo:latest

# Or install locally
# Follow MongoDB installation guide for your OS
```

## 🚨 Troubleshooting

### Common Issues

1. **MongoDB Connection Failed**
   - Ensure MongoDB is running
   - Check MONGODB_URI in .env
   - Verify network connectivity

2. **OpenRouter API Errors**
   - Verify API key is correct
   - Check API quota/limits
   - Ensure model name is valid

3. **CSV Data Not Loading**
   - Verify CSV files exist in `datasets/` folder
   - Check file permissions
   - Review application logs

### Debug Mode
```bash
# Enable debug logging
DEBUG=* npm run start:dev
```

## 📈 Performance

- Auto-seeding runs only when database is empty
- MongoDB indexes on frequently queried fields
- Efficient CSV parsing with streaming
- Connection pooling for database operations

## 🔒 Security

- Environment variables for sensitive data
- CORS configuration
- Input validation on all endpoints
- MongoDB injection protection

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Make changes
4. Add tests
5. Submit pull request

## 📄 License

MIT License - see LICENSE file for details