# AI Vision API - Vercel Deployment

A serverless AI vision analysis API built for Vercel using Cloudinary's AI Vision capabilities.

## Features

- **Image Analysis**: General AI vision analysis with custom prompts
- **Content Moderation**: AI-powered content moderation
- **Image Tagging**: Custom tag-based image classification
- **Legacy Support**: Backward compatibility with existing applications
- **Serverless**: Deployed as Vercel serverless functions

## Deployment

### 1. Clone and Setup

```bash
git clone <your-repo-url>
cd vercel-deploy
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Variables

Create a `.env.local` file in the root directory with your Cloudinary credentials:

```bash
# Required
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Optional
ZAPIER_WEBHOOK_URL=your_webhook_url
```

### 4. Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Add environment variables in Vercel dashboard
# or via CLI:
vercel env add CLOUDINARY_CLOUD_NAME
vercel env add CLOUDINARY_API_KEY
vercel env add CLOUDINARY_API_SECRET
```

## API Endpoints

### POST /api/analyze

Main analysis endpoint supporting multiple analysis types.

**Request Body:**
```json
{
  "imageUrl": "https://example.com/image.jpg",
  "analysis_type": "ai_vision_general|ai_vision_moderation|ai_vision_tagging",
  "prompts": ["prompt1", "prompt2"],
  "tags": [{"name": "tag1", "description": "desc1"}],
  "multi_label": true
}
```

### POST /api/batch-analyze

Batch analysis endpoint for processing multiple analyses.

**Request Body:**
```json
{
  "imageUrl": "https://example.com/image.jpg",
  "analysisType": "ai_vision_general",
  "analysisData": ["prompt1", "prompt2"],
  "multiLabel": false
}
```

### GET /api/analyze-image

Legacy endpoint for backward compatibility.

**Query Parameters:**
- `imageUrl`: URL of the image to analyze
- `appKey`: Application key (`fGr3Ase`, `88330fgvv`, `gie3faavv3r1`)

### GET /api/health

Health check endpoint.

## Local Development

```bash
# Start development server
npm run dev

# Access at http://localhost:3000
```

## Changes from Express Version

- **Security Removed**: No API key authentication, rate limiting, or CORS restrictions
- **Serverless**: Each endpoint is a separate serverless function
- **Simplified**: Removed all security middleware and validation layers
- **Vercel Optimized**: Configured for Vercel's serverless environment

## Error Handling

All endpoints return standardized error responses:

```json
{
  "error": "Error Type",
  "message": "Human readable message",
  "details": "Additional details if available"
}
```

## Support

For issues related to Cloudinary AI Vision, check the [Cloudinary documentation](https://cloudinary.com/documentation). 