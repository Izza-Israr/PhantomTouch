process.env.VERCEL = process.env.VERCEL || '1';

// Vercel's Node runtime can host Express apps directly.
module.exports = require('../backend/server');
