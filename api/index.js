export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  return res.status(200).json({
    name: 'AI Vision API',
    version: '2.0.0',
    description: 'Serverless AI vision analysis API using Cloudinary',
    endpoints: {
      health: {
        path: '/api/health',
        method: 'GET',
        description: 'Health check endpoint'
      },
      analyze: {
        path: '/api/analyze',
        method: 'POST',
        description: 'Main analysis endpoint with support for general, moderation, and tagging',
        parameters: {
          imageUrl: 'string (required) - URL of image to analyze',
          analysis_type: 'string (required) - ai_vision_general|ai_vision_moderation|ai_vision_tagging',
          prompts: 'array (optional) - Custom prompts for analysis',
          tags: 'array (optional) - Tag definitions for tagging analysis',
          multi_label: 'boolean (optional) - Enable multi-label classification'
        }
      },
      batchAnalyze: {
        path: '/api/batch-analyze',
        method: 'POST',
        description: 'Batch analysis endpoint',
        parameters: {
          imageUrl: 'string (required) - URL of image to analyze',
          analysisType: 'string (required) - Analysis type',
          analysisData: 'array (required) - Analysis data/prompts',
          multiLabel: 'boolean (optional) - Enable multi-label classification'
        }
      },
      legacyAnalyze: {
        path: '/api/analyze-image',
        method: 'GET',
        description: 'Legacy analysis endpoint for backward compatibility',
        parameters: {
          imageUrl: 'string (required) - URL of image to analyze',
          appKey: 'string (required) - Application key (fGr3Ase|88330fgvv|gie3faavv3r1)'
        }
      }
    },
    environment: {
      required: [
        'CLOUDINARY_CLOUD_NAME',
        'CLOUDINARY_API_KEY',
        'CLOUDINARY_API_SECRET'
      ],
      optional: [
        'ZAPIER_WEBHOOK_URL'
      ]
    },
    documentation: 'https://cloudinary.com/documentation/ai_vision_addon',
    repository: 'See README.md for deployment instructions'
  });
} 