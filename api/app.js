require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const axios = require('axios');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const morgan = require('morgan');
const Joi = require('joi');

const app = express();
const upload = multer({ dest: 'uploads/' });

// Security configuration
const SECURITY_CONFIG = {
  apiKeys: new Set((process.env.API_KEYS || '').split(',').filter(function(key) { return key.trim(); })),
  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:5173').split(','),
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  }
};

// Validate security configuration
if (SECURITY_CONFIG.apiKeys.size === 0) {
  console.warn('⚠️  No API keys configured! Set API_KEYS environment variable.');
}

console.log('🔒 Security initialized: ' + SECURITY_CONFIG.apiKeys.size + ' API keys, ' + SECURITY_CONFIG.allowedOrigins.length + ' allowed origins');

// Security headers (using helmet v4 syntax)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
    },
  },
}));

// Enhanced CORS with origin validation
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    if (SECURITY_CONFIG.allowedOrigins.indexOf(origin) !== -1) {
      return callback(null, true);
    }
    
    console.warn('🚫 CORS blocked request from: ' + origin);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: false,
  methods: ['GET', 'POST'],
  allowedHeaders: [
    'Content-Type',
    'X-API-Key',
    'X-Client-Version',
    'X-Request-Source',
    'X-Timestamp'
  ],
  exposedHeaders: [
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset'
  ]
}));

// Request logging
app.use(morgan('combined', {
  skip: function(req) { return req.url === '/health' || req.url === '/'; }
}));

// Body parsing with size limits
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static('public'));

// Rate limiting
const limiter = rateLimit({
  windowMs: SECURITY_CONFIG.rateLimit.windowMs,
  max: SECURITY_CONFIG.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests',
    message: 'Rate limit exceeded. Please try again later.',
  },
  keyGenerator: function(req) {
    // Use API key if available, otherwise fall back to IP
    return req.headers['x-api-key'] || req.ip;
  },
  onLimitReached: function(req) {
    console.warn('🚨 Rate limit exceeded for IP: ' + req.ip + ', API Key: ' + (req.headers['x-api-key'] || 'none'));
  }
});

// Apply rate limiting to API routes
app.use('/analyze', limiter);
app.use('/batch-analyze', limiter);
app.use('/analyze-image', limiter);

// API Key authentication middleware
function authenticateApiKey(req, res, next) {
  // Skip authentication for health check and root
  if (req.path === '/health' || req.path === '/') {
    return next();
  }

  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey) {
    console.warn('🔑 Missing API key from IP: ' + req.ip);
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'API key is required. Please include X-API-Key header.',
      code: 'MISSING_API_KEY'
    });
  }

  // Validate API key format (64 hex characters)
  if (!/^[a-f0-9]{64}$/i.test(apiKey)) {
    console.warn('🔑 Invalid API key format from IP: ' + req.ip);
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid API key format',
      code: 'INVALID_API_KEY_FORMAT'
    });
  }

  // Check if API key exists (if any are configured)
  if (SECURITY_CONFIG.apiKeys.size > 0 && !SECURITY_CONFIG.apiKeys.has(apiKey)) {
    console.warn('🔑 Invalid API key attempt: ' + apiKey.substring(0, 8) + '...' + apiKey.substring(apiKey.length - 8) + ' from IP: ' + req.ip);
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid API key',
      code: 'INVALID_API_KEY'
    });
  }

  // Validate additional security headers
  const timestamp = req.headers['x-timestamp'];
  if (timestamp) {
    const requestTime = parseInt(timestamp);
    const currentTime = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes

    if (isNaN(requestTime) || (currentTime - requestTime) > maxAge || requestTime > currentTime) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Request timestamp is too old or invalid',
        code: 'INVALID_TIMESTAMP'
      });
    }
  }

  console.log('✅ Authenticated request from API key: ' + apiKey.substring(0, 8) + '... IP: ' + req.ip);
  next();
}

// Apply authentication to all routes except health check
app.use(authenticateApiKey);

// Input validation schemas
const analyzeSchema = Joi.object({
  imageUrl: Joi.string().uri({ scheme: ['http', 'https'] }).required()
    .pattern(/^https?:\/\//, 'valid URL')
    .pattern(/(localhost|127\.0\.0\.1|0\.0\.0\.0|file:|data:)/i, { invert: true }),
  analysis_type: Joi.string().valid('ai_vision_general', 'ai_vision_moderation', 'ai_vision_tagging').required(),
  prompts: Joi.array().items(Joi.string().max(1000)).max(10).when('analysis_type', {
    not: 'ai_vision_tagging',
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  tags: Joi.array().items(Joi.object({
    name: Joi.string().max(100).required()
      .pattern(/^[^<>]*$/, 'no HTML tags'),
    description: Joi.string().max(500).required()
      .pattern(/^[^<>]*$/, 'no HTML tags')
  })).max(20).when('analysis_type', {
    is: 'ai_vision_tagging',
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  multi_label: Joi.boolean().optional()
});

// Input validation middleware
function validateInput(schema) {
  return function(req, res, next) {
    const validation = schema.validate(req.body);
    if (validation.error) {
      console.warn('📝 Validation error from IP: ' + req.ip + ' - ' + validation.error.message);
      return res.status(400).json({
        error: 'Validation Error',
        message: validation.error.details[0].message,
        code: 'INVALID_INPUT'
      });
    }
    req.body = validation.value; // Use validated/sanitized data
    next();
  };
}

// Cloudinary configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Health check endpoint (no auth required)
app.get('/health', function(req, res) {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    security: {
      apiKeysConfigured: SECURITY_CONFIG.apiKeys.size > 0,
      allowedOrigins: SECURITY_CONFIG.allowedOrigins.length,
      rateLimitWindow: SECURITY_CONFIG.rateLimit.windowMs / 1000 + 's',
      rateLimitMax: SECURITY_CONFIG.rateLimit.max
    }
  });
});

// Redirect from root to 'general.html'
app.get('/', function(req, res) {
  res.redirect('/general.html');
});

// Main analyze endpoint with security
app.post('/analyze', validateInput(analyzeSchema), function(req, res) {
  const imageUrl = req.body.imageUrl;
  const analysis_type = req.body.analysis_type;
  const prompts = req.body.prompts;
  const tags = req.body.tags;
  const multi_label = req.body.multi_label;

  console.log('🔍 Analysis request: ' + analysis_type + ' from IP: ' + req.ip);

  let parameters = {};

  switch (analysis_type) {
    case 'ai_vision_general':
      parameters = { prompts: prompts };
      break;
    case 'ai_vision_moderation':
      parameters = { rejection_questions: prompts };
      break;
    case 'ai_vision_tagging':
      const formattedTags = tags.map(function(tag) {
        return {
          name: tag.name,
          description: tag.description,
        };
      });
      parameters = { tag_definitions: formattedTags };
      if (multi_label !== undefined) {
        parameters.multi_label = multi_label;
      }
      break;
  }

  const payload = {
    source: { uri: imageUrl },
    ...parameters
  };

  axios.post(
    'https://' + process.env.CLOUDINARY_API_KEY + ':' + process.env.CLOUDINARY_API_SECRET + '@api.cloudinary.com/v2/analysis/' + process.env.CLOUDINARY_CLOUD_NAME + '/analyze/' + analysis_type,
    payload,
    { 
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000 // 30 second timeout
    }
  ).then(function(analysisResult) {
    // Optional: Send data to Zapier webhook (if configured)
    if (process.env.ZAPIER_WEBHOOK_URL) {
      const apiKeyForLog = req.headers['x-api-key'];
      axios.post(process.env.ZAPIER_WEBHOOK_URL, {
        imageAnalysis: analysisResult.data,
        originalRequest: req.body,
        timestamp: new Date().toISOString(),
        clientInfo: {
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          apiKey: apiKeyForLog ? (apiKeyForLog.substring(0, 8) + '...') : 'none'
        }
      })
      .then(function() { console.log('📊 Data sent to Zapier'); })
      .catch(function(err) { console.error('❌ Zapier webhook error:', err.message); });
    }

    console.log('✅ Analysis completed for IP: ' + req.ip);
    res.json(analysisResult.data);
  }).catch(function(error) {
    console.error('❌ Analysis failed for IP: ' + req.ip + ':', error.response ? error.response.data : error.message);
    
    if (error.code === 'ECONNABORTED') {
      return res.status(408).json({ 
        error: 'Request Timeout', 
        message: 'Analysis request timed out. Please try again.' 
      });
    }
    
    res.status(500).json({ 
      error: 'Analysis failed',
      message: 'Unable to process image analysis. Please check the image URL and try again.',
      code: 'ANALYSIS_ERROR'
    });
  });
});

// Batch analyze endpoint with security
app.post('/batch-analyze', validateInput(analyzeSchema), function(req, res) {
  const imageUrl = req.body.imageUrl;
  const analysisType = req.body.analysisType;
  const analysisData = req.body.analysisData;
  const multiLabel = req.body.multiLabel;

  console.log('🔍 Batch analysis request: ' + analysisType + ' from IP: ' + req.ip);

  let parameters = {};

  switch (analysisType) {
    case 'ai_vision_general':
      parameters = { prompts: analysisData };
      break;
    case 'ai_vision_moderation':
      parameters = { rejection_questions: analysisData };
      break;
    case 'ai_vision_tagging':
      const formattedTags = analysisData.map(function(tag) {
        return {
          name: tag.name,
          description: tag.description,
        };
      });
      parameters = { tag_definitions: formattedTags };
      if (multiLabel !== undefined) {
        parameters.multi_label = multiLabel;
      }
      break;
    default:
      return res.status(400).json({
        error: 'Invalid analysis type',
        code: 'INVALID_ANALYSIS_TYPE'
      });
  }

  const payload = {
    source: { uri: imageUrl },
    ...parameters
  };

  axios.post(
    'https://' + process.env.CLOUDINARY_API_KEY + ':' + process.env.CLOUDINARY_API_SECRET + '@api.cloudinary.com/v2/analysis/' + process.env.CLOUDINARY_CLOUD_NAME + '/analyze/' + analysisType,
    payload,
    { 
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    }
  ).then(function(analysisResult) {
    console.log('✅ Batch analysis completed for IP: ' + req.ip);
    res.json(analysisResult.data);
  }).catch(function(error) {
    console.error('❌ Batch analysis failed for IP: ' + req.ip + ':', error.response ? error.response.data : error.message);
    res.status(500).json({ 
      error: 'Analysis failed', 
      details: error.message,
      code: 'BATCH_ANALYSIS_ERROR'
    });
  });
});

// Legacy analyze-image endpoint (maintained for backward compatibility)
app.get('/analyze-image', function(req, res) {
  const imageUrl = req.query.imageUrl;
  const appKey = req.query.appKey;

  if (!imageUrl || !appKey) {
    return res.status(400).json({ 
      error: 'Missing required parameters',
      message: 'Both imageUrl and appKey are required',
      code: 'MISSING_PARAMETERS'
    });
  }

  // Validate imageUrl
  try {
    new URL(imageUrl);
    if (!/^https?:\/\//.test(imageUrl)) {
      throw new Error('Invalid protocol');
    }
  } catch(e) {
    return res.status(400).json({
      error: 'Invalid image URL',
      code: 'INVALID_URL'
    });
  }

  console.log('🔍 Legacy analysis request with appKey: ' + appKey + ' from IP: ' + req.ip);

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
      console.warn('🔑 Invalid app key: ' + appKey + ' from IP: ' + req.ip);
      return res.status(400).json({
        error: 'Invalid app key',
        code: 'INVALID_APP_KEY'
      });
  }

  const payload = {
    source: { uri: imageUrl },
    ...parameters
  };

  axios.post(
    'https://' + process.env.CLOUDINARY_API_KEY + ':' + process.env.CLOUDINARY_API_SECRET + '@api.cloudinary.com/v2/analysis/' + process.env.CLOUDINARY_CLOUD_NAME + '/analyze/' + analysisType,
    payload,
    { 
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    }
  ).then(function(analysisResult) {
    console.log('✅ Legacy analysis completed for IP: ' + req.ip);
    res.json({
      prompts: parameters.tag_definitions || parameters.rejection_questions || parameters.prompts,
      answer: analysisResult.data
    });
  }).catch(function(error) {
    console.error('❌ Legacy analysis failed for IP: ' + req.ip + ':', error.response ? error.response.data : error.message);
    res.status(500).json({ 
      error: 'Analysis failed', 
      details: error.message,
      code: 'LEGACY_ANALYSIS_ERROR'
    });
  });
});

// 404 handler
app.use('*', function(req, res) {
  console.warn('🚫 404 request to ' + req.originalUrl + ' from IP: ' + req.ip);
  res.status(404).json({
    error: 'Not Found',
    message: 'The requested resource was not found',
    path: req.originalUrl
  });
});

// Global error handler
app.use(function(err, req, res, next) {
  console.error('💥 Server error for IP: ' + req.ip + ':', err);
  
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'CORS policy violation. Origin not allowed.',
      code: 'CORS_ERROR'
    });
  }
  
  res.status(500).json({
    error: 'Internal Server Error',
    message: 'An unexpected error occurred',
    code: 'SERVER_ERROR'
  });
});