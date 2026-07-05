const supabase = require('../utils/supabaseClient');
const { normalizeRow } = require('../utils/supabaseHelpers');

module.exports = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authorization token required' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: 'Invalid token format' });
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('session_token', token)
      .maybeSingle();

    if (error) {
      console.error('Auth middleware error:', error);
      return res.status(500).json({ message: 'Internal server error during auth validation' });
    }

    if (!user) {
      return res.status(401).json({ message: 'Invalid or expired session' });
    }

    req.user = normalizeRow(user);
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ message: 'Internal server error during auth validation' });
  }
};
