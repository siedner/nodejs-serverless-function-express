const axios = require('axios');

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { imageUrl, analysis_type, prompts, tags, multi_label } = req.body;

    // Basic input validation
    if (!imageUrl || !analysis_type) {
      return res.status(400).json({
        error: 'Missing required parameters',
        message: 'imageUrl and analysis_type are required'
      });
    }

    console.log('🔍 Analysis request:', analysis_type);

    let parameters = {};

    switch (analysis_type) {
      case 'ai_vision_general':
        parameters = { prompts: prompts || [] };
        break;
      case 'ai_vision_moderation':
        parameters = { rejection_questions: prompts || [] };
        break;
      case 'ai_vision_tagging':
        const formattedTags = (tags || []).map(tag => ({
          name: tag.name,
          description: tag.description,
        }));
        parameters = { tag_definitions: formattedTags };
        if (multi_label !== undefined) {
          parameters.multi_label = multi_label;
        }
        break;
      default:
        return res.status(400).json({
          error: 'Invalid analysis type',
          message: 'analysis_type must be ai_vision_general, ai_vision_moderation, or ai_vision_tagging'
        });
    }

    const payload = {
      source: { uri: imageUrl },
      ...parameters
    };

    const analysisResult = await axios.post(
      `https://${process.env.CLOUDINARY_API_KEY}:${process.env.CLOUDINARY_API_SECRET}@api.cloudinary.com/v2/analysis/${process.env.CLOUDINARY_CLOUD_NAME}/analyze/${analysis_type}`,
      payload,
      { 
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      }
    );

    // Optional: Send data to Zapier webhook (if configured)
    if (process.env.ZAPIER_WEBHOOK_URL) {
      try {
        await axios.post(process.env.ZAPIER_WEBHOOK_URL, {
          imageAnalysis: analysisResult.data,
          originalRequest: req.body,
          timestamp: new Date().toISOString()
        });
        console.log('📊 Data sent to Zapier');
      } catch (err) {
        console.error('❌ Zapier webhook error:', err.message);
      }
    }

    console.log('✅ Analysis completed');
    return res.json(analysisResult.data);

  } catch (error) {
    console.error('❌ Analysis failed:', error.response ? error.response.data : error.message);
    
    if (error.code === 'ECONNABORTED') {
      return res.status(408).json({ 
        error: 'Request Timeout', 
        message: 'Analysis request timed out. Please try again.' 
      });
    }
    
    return res.status(500).json({ 
      error: 'Analysis failed',
      message: 'Unable to process image analysis. Please check the image URL and try again.',
      details: error.response ? error.response.data : error.message
    });
  }
} 