const axios = require('axios');

export default async function handler(req, res) {
  // Allow GET requests for legacy compatibility
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { imageUrl, appKey } = req.query;

    // Basic input validation
    if (!imageUrl || !appKey) {
      return res.status(400).json({ 
        error: 'Missing required parameters',
        message: 'Both imageUrl and appKey are required'
      });
    }

    // Validate imageUrl format
    try {
      new URL(imageUrl);
      if (!/^https?:\/\//.test(imageUrl)) {
        throw new Error('Invalid protocol');
      }
    } catch(e) {
      return res.status(400).json({
        error: 'Invalid image URL',
        message: 'Please provide a valid HTTP/HTTPS image URL'
      });
    }

    console.log('🔍 Legacy analysis request with appKey:', appKey);

    let analysisType = '';
    let parameters = {};

    switch (appKey) {
      case 'fGr3Ase':
        analysisType = 'ai_vision_tagging';
        parameters = { tag_definitions: [
          { name: 'prompt1', description: 'Tag for prompt1' }, 
          { name: 'prompt2', description: 'Tag for prompt2' }
        ]};
        break;
      case '88330fgvv':
        analysisType = 'ai_vision_moderation';
        parameters = { rejection_questions: ['is it safe?'] };
        break;
      case 'gie3faavv3r1':
        analysisType = 'ai_vision_general';
        parameters = { prompts: ['write a very long song about this image'] };
        break;
      default:
        return res.status(400).json({
          error: 'Invalid app key',
          message: 'The provided appKey is not recognized'
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

    console.log('✅ Legacy analysis completed');
    return res.json({
      prompts: parameters.tag_definitions || parameters.rejection_questions || parameters.prompts,
      answer: analysisResult.data
    });

  } catch (error) {
    console.error('❌ Legacy analysis failed:', error.response ? error.response.data : error.message);
    
    if (error.code === 'ECONNABORTED') {
      return res.status(408).json({ 
        error: 'Request Timeout', 
        message: 'Analysis request timed out. Please try again.' 
      });
    }
    
    return res.status(500).json({ 
      error: 'Analysis failed', 
      message: 'Unable to process legacy analysis. Please check the parameters and try again.',
      details: error.response ? error.response.data : error.message
    });
  }
} 