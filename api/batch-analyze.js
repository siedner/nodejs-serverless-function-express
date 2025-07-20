const axios = require('axios');

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { imageUrl, analysisType, analysisData, multiLabel } = req.body;

    // Basic input validation
    if (!imageUrl || !analysisType || !analysisData) {
      return res.status(400).json({
        error: 'Missing required parameters',
        message: 'imageUrl, analysisType, and analysisData are required'
      });
    }

    console.log('🔍 Batch analysis request:', analysisType);

    let parameters = {};

    switch (analysisType) {
      case 'ai_vision_general':
        parameters = { prompts: analysisData };
        break;
      case 'ai_vision_moderation':
        parameters = { rejection_questions: analysisData };
        break;
      case 'ai_vision_tagging':
        const formattedTags = analysisData.map(tag => ({
          name: tag.name,
          description: tag.description,
        }));
        parameters = { tag_definitions: formattedTags };
        if (multiLabel !== undefined) {
          parameters.multi_label = multiLabel;
        }
        break;
      default:
        return res.status(400).json({
          error: 'Invalid analysis type',
          message: 'analysisType must be ai_vision_general, ai_vision_moderation, or ai_vision_tagging'
        });
    }

    const payload = {
      source: { uri: imageUrl },
      ...parameters
    };

    const analysisResult = await axios.post(
      `https://${process.env.CLOUDINARY_API_KEY}:${process.env.CLOUDINARY_API_SECRET}@api.cloudinary.com/v2/analysis/${process.env.CLOUDINARY_CLOUD_NAME}/analyze/${analysisType}`,
      payload,
      { 
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      }
    );

    console.log('✅ Batch analysis completed');
    return res.json(analysisResult.data);

  } catch (error) {
    console.error('❌ Batch analysis failed:', error.response ? error.response.data : error.message);
    
    if (error.code === 'ECONNABORTED') {
      return res.status(408).json({ 
        error: 'Request Timeout', 
        message: 'Analysis request timed out. Please try again.' 
      });
    }
    
    return res.status(500).json({ 
      error: 'Analysis failed', 
      message: 'Unable to process batch analysis. Please check the data and try again.',
      details: error.response ? error.response.data : error.message
    });
  }
} 