const express = require('express');
const router = express.Router();
const supabase = require('../utils/supabaseClient');
const auth = require('../middleware/auth');

// Get notifications for the authenticated user
router.get('/', auth, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('notifications')
            .select('*')
            .eq('recipient_user_id', req.user.id)
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) {
            console.error('Fetch notifications error:', error);
            return res.status(500).json({ message: 'Failed to retrieve notifications' });
        }

        res.json(data || []);
    } catch (err) {
        console.error('Fetch notifications error:', err);
        res.status(500).json({ message: 'Failed to retrieve notifications' });
    }
});

// Mark a notification as read
router.post('/:id/read', auth, async (req, res) => {
    try {
        const notifId = req.params.id;
        const { data, error } = await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('id', notifId)
            .eq('recipient_user_id', req.user.id)
            .select('*')
            .single();

        if (error) {
            console.error('Mark notification read error:', error);
            return res.status(500).json({ message: 'Failed to mark notification read' });
        }

        res.json(data || {});
    } catch (err) {
        console.error('Mark notification read error:', err);
        res.status(500).json({ message: 'Failed to mark notification read' });
    }
});

module.exports = router;
