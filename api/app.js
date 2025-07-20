require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const axios = require('axios');
const Joi = require('joi');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// Body parsing
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static('public'));

// Cloudinary configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Health check endpoint
app.get('/health', function(req, res) {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// Redirect from root to general.html
app.get('/', function(req, res) {
  res.redirect('/general.html');
});

// Validation schema
const analyzeSchema = Joi.object({
  imageUrl: Joi.string().uri({ scheme: ['http', 'https'] }).required()
    .pattern(/^https?:\/\//, 'valid URL'),
  analysis_type: Joi.string().valid('ai_vision_general', 'ai_vision_moderation', 'ai_vision_tagging').required(),
  prompts: Joi.array().items(Joi.string().max(1000)).max(10).when('analysis_type', {
    not: 'ai_vision_tagging',
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  tags: Joi.array().items(Joi.object({
    name: Joi.string().max(100).required(),
    description: Joi.string().max(500).required()
  })).max(20).when('analysis_type', {
    is: 'ai_vision_tagging',
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  multi_label: Joi.boolean().optional()
});

function validateInput(schema) {
  return function(req, res, next) {
    const validation = schema.validate(req.body);
    if (validation.error) {
      return res.status(400).json({
        error: 'Validation Error',
        message: validation.error.details[0].message,
        code: 'INVALID_INPUT'
      });
    }
    req.body = validation.value;
    next();
  };
}

// Main analyze endpoint
app.post('/analyze', validateInput(analyzeSchema), async (req, res) => {
  const { imageUrl, analysis_type, prompts, tags, multi_label } = req.body;

  let parameters = {};
  switch (analysis_type) {
    case 'ai_vision_general':
      parameters = { prompts };
      break;
    case 'ai_vision_moderation':
      parameters = { rejection_questions: prompts };
      break;
    case 'ai_vision_tagging':
      parameters = {
        tag_definitions: tags.map(tag => ({ name: tag.name, description: tag.description })),
        ...(multi_label !== undefined && { multi_label })
      };
      break;
  }

  const payload = {
    source: { uri: imageUrl },
    ...parameters
  };

  try {
    const response = await axios.post(
      `https://${process.env.CLOUDINARY_API_KEY}:${process.env.CLOUDINARY_API_SECRET}@api.cloudinary.com/v2/analysis/${process.env.CLOUDINARY_CLOUD_NAME}/analyze/${analysis_type}`,
      payload,
      { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }
    );
    res.json(response.data);
  } catch (error) {
    console.error('❌ Analysis failed:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Analysis failed',
      message: 'Unable to process image analysis. Please check the image URL and try again.',
      code: 'ANALYSIS_ERROR'
    });
  }
});

// Catch-all 404
app.use('*', function(req, res) {
  res.status(404).json({
    error: 'Not Found',
    message: 'The requested resource was not found',
    path: req.originalUrl
  });
});

module.exports = app;
