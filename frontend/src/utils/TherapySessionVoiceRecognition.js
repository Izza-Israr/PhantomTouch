/**
 * Therapy Session Voice Recognition Module
 * Handles voice commands during therapy sessions with bilateral support
 */

export const THERAPY_VOICE_COMMANDS = {
    // Control commands
    START_THERAPY: ['start therapy', 'start session', 'begin'],
    PAUSE_SESSION: ['pause', 'pause session', 'stop session'],
    RESUME_SESSION: ['resume', 'resume session', 'continue'],
    END_SESSION: [
        'end session', 'end it', 'finish', 'finish session',
        'stop', 'stop therapy', 'quit', 'exit', 'done'
    ],

    // Pain level commands
    PAIN_LEVEL: ['pain level', 'pain is', 'pain', 'my pain'],
    PAIN_NUMBERS: ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'],

    // Unilateral specific commands
    RAISE_HANDS: ['raise hands', 'raise hand', 'lift', 'lift up', 'go up'],
    LOWER_HANDS: ['lower hands', 'lower hand', 'lower', 'put down', 'drop'],

    // Bilateral pose commands
    OPEN_HAND: ['open', 'open hand', 'relax', 'flat', 'spread'],
    CLENCH_FIST: ['clench', 'clinch', 'fist', 'clench fist', 'make fist', 'close hand'],
    VICTORY: ['victory', 'peace', 'v sign', 'two fingers', 'victory sign'],
    THUMBS_UP: ['thumb', 'thumbs up', 'thumbs', 'good'],
    POINT: ['point', 'pointing', 'point finger'],
    PINCH: ['pinch', 'pinching', 'pinch together'],

    // Therapy game specific
    REACH_TARGET: ['reach', 'reach target', 'target', 'hit', 'hit target']
};

export const THERAPY_VOICE_SCRIPTS = {
    WELCOME_UNILATERAL: `Voice control is enabled. Say: start therapy to begin, 
    raise hands to lift up, lower hands to put down, 
    pause to pause, resume to continue, or end session to finish. 
    You can also update pain level by saying pain followed by a number from zero to ten.`,

    WELCOME_BILATERAL: `Welcome. Voice control is enabled for bilateral therapy. Say: start therapy to begin,
    then use pose commands like open hand, clench fist, victory, thumbs up, point, or pinch to switch poses during therapy.
    Say pause to pause, resume to continue, pain followed by a number to report pain level, or end session to finish.`,

    READY_TO_START: `Ready to start. Show your hand to the camera when you say start therapy.`,

    SESSION_STARTED_UNILATERAL: `Therapy session started. Show your healthy hand to the camera. 
    Say lower hands or raise hands to control the phantom limb. Say pause anytime to pause.`,

    SESSION_STARTED_BILATERAL: `Therapy session started. Position yourself in front of the camera.
    Say open hand, clench fist, victory, thumbs up, point, or pinch to switch poses.
    Say pain followed by a number to report pain. Say pause anytime to pause, or end session to finish.`,

    PAUSED: `Session paused. Say resume to continue or end session to finish.`,

    RESUMED: `Session resumed.`,

    POSE_CHANGED: `Pose changed to {pose}.`,

    PAIN_RECORDED: `Pain level recorded as {level} out of ten.`,

    SESSION_ENDING: `Ending session. Please wait while your performance is being saved...`,

    SESSION_SAVED: `Session saved successfully. A new notification is available in your notification bell. Thank you for your therapy.`,

    VOICE_ERROR: `Sorry, I did not understand that. Please try again.`,

    NO_HAND_DETECTED: `No hand detected. Please position your hand in front of the camera.`,

    INVALID_PAIN_LEVEL: `Please say a number from zero to ten to set pain level.`
};

export const BILATERAL_POSE_LABELS = {
    open_hand: 'Open hand',
    clench_fist: 'Clench fist',
    victory: 'Victory',
    thumbs_up: 'Thumbs up',
    point: 'Point',
    pinch: 'Pinch'
};

export class TherapySessionVoiceRecognition {
    constructor(options = {}) {
        this.enabled = true;
        this.isBilateral = options.isBilateral || false;
        this.isRunning = false;
        this.isPaused = false;

        this.onCommand = options.onCommand || (() => { });
        this.onPainLevel = options.onPainLevel || (() => { });
        this.onPoseChange = options.onPoseChange || (() => { });
        this.onError = options.onError || (() => { });

        this.recognition = null;
        this.lastCommand = '';
        this.lastCommandTime = 0;

        this.initializeRecognition();
    }

    initializeRecognition() {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) {
            console.warn('Speech Recognition API not available');
            this.onError('Speech recognition not supported on this device');
            return false;
        }

        this.recognition = new SR();
        this.recognition.lang = 'en-US';
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.maxAlternatives = 1;

        this.recognition.onstart = () => {
            console.log('Therapy session voice recognition started');
        };

        this.recognition.onerror = (event) => {
            console.warn('Voice recognition error:', event.error);
            if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
                this.enabled = false;
                this.onError('Microphone permission denied');
            }
        };

        this.recognition.onresult = (event) => {
            const result = event.results[event.results.length - 1];
            const transcript = (result?.[0]?.transcript || '').toLowerCase().trim();
            const isFinal = result?.isFinal !== false;

            if (!transcript) return;

            // Only process final results or immediate keywords
            const immediateKeywords = /start|pause|resume|end|pain|raise|lower|open|clench|victory|thumb|point|pinch|reach/i;
            if (!isFinal && !immediateKeywords.test(transcript)) return;

            this.processVoiceCommand(transcript);
        };

        this.recognition.onend = () => {
            if (this.isRunning && this.enabled) {
                setTimeout(() => {
                    try {
                        this.recognition.start();
                    } catch (e) {
                        console.warn('Could not restart voice recognition:', e);
                    }
                }, 300);
            }
        };

        return true;
    }

    processVoiceCommand(transcript) {
        const now = Date.now();
        if (transcript === this.lastCommand && now - this.lastCommandTime < 1000) {
            return; // Ignore duplicate commands within 1 second
        }

        this.lastCommand = transcript;
        this.lastCommandTime = now;

        // Control commands
        if (this.matchesAny(transcript, THERAPY_VOICE_COMMANDS.START_THERAPY)) {
            this.onCommand('START_SESSION');
            return;
        }

        if (this.matchesAny(transcript, THERAPY_VOICE_COMMANDS.PAUSE_SESSION)) {
            this.onCommand('PAUSE_SESSION');
            this.isPaused = true;
            return;
        }

        if (this.matchesAny(transcript, THERAPY_VOICE_COMMANDS.RESUME_SESSION)) {
            this.onCommand('RESUME_SESSION');
            this.isPaused = false;
            return;
        }

        if (this.matchesAny(transcript, THERAPY_VOICE_COMMANDS.END_SESSION)) {
            this.onCommand('END_SESSION');
            return;
        }

        // Pain level
        if (this.matchesAny(transcript, THERAPY_VOICE_COMMANDS.PAIN_LEVEL)) {
            const painLevel = this.extractPainLevel(transcript);
            if (painLevel !== null) {
                this.onPainLevel(painLevel);
            } else {
                this.onError(THERAPY_VOICE_SCRIPTS.INVALID_PAIN_LEVEL);
            }
            return;
        }

        // Unilateral commands
        if (!this.isBilateral) {
            if (this.matchesAny(transcript, THERAPY_VOICE_COMMANDS.RAISE_HANDS)) {
                this.onCommand('RAISE_HANDS');
                return;
            }

            if (this.matchesAny(transcript, THERAPY_VOICE_COMMANDS.LOWER_HANDS)) {
                this.onCommand('LOWER_HANDS');
                return;
            }
        }

        // Bilateral pose commands
        if (this.isBilateral) {
            if (this.matchesAny(transcript, THERAPY_VOICE_COMMANDS.OPEN_HAND)) {
                this.onPoseChange('open_hand');
                return;
            }

            if (this.matchesAny(transcript, THERAPY_VOICE_COMMANDS.CLENCH_FIST)) {
                this.onPoseChange('clench_fist');
                return;
            }

            if (this.matchesAny(transcript, THERAPY_VOICE_COMMANDS.VICTORY)) {
                this.onPoseChange('victory');
                return;
            }

            if (this.matchesAny(transcript, THERAPY_VOICE_COMMANDS.THUMBS_UP)) {
                this.onPoseChange('thumbs_up');
                return;
            }

            if (this.matchesAny(transcript, THERAPY_VOICE_COMMANDS.POINT)) {
                this.onPoseChange('point');
                return;
            }

            if (this.matchesAny(transcript, THERAPY_VOICE_COMMANDS.PINCH)) {
                this.onPoseChange('pinch');
                return;
            }
        }

        // Therapy game
        if (this.matchesAny(transcript, THERAPY_VOICE_COMMANDS.REACH_TARGET)) {
            this.onCommand('REACH_TARGET');
            return;
        }

        this.onError(THERAPY_VOICE_SCRIPTS.VOICE_ERROR);
    }

    extractPainLevel(transcript) {
        for (let i = 0; i <= 10; i++) {
            const word = String(i);
            const name = THERAPY_VOICE_COMMANDS.PAIN_NUMBERS[i];
            if (transcript.includes(word) || transcript.includes(name)) {
                return i;
            }
        }
        return null;
    }

    matchesAny(text, keywords) {
        return keywords.some(keyword => text.includes(keyword));
    }

    start() {
        if (!this.recognition || !this.enabled) return false;
        try {
            this.isRunning = true;
            this.recognition.start();
            return true;
        } catch (e) {
            console.error('Failed to start voice recognition:', e);
            return false;
        }
    }

    stop() {
        if (!this.recognition) return;
        try {
            this.isRunning = false;
            this.recognition.stop();
        } catch (e) {
            console.warn('Error stopping voice recognition:', e);
        }
    }

    abort() {
        if (!this.recognition) return;
        try {
            this.isRunning = false;
            this.recognition.abort();
        } catch (e) {
            console.warn('Error aborting voice recognition:', e);
        }
    }

    setLanguage(lang) {
        if (this.recognition) {
            this.recognition.lang = lang;
        }
    }

    setBilateral(isBilateral) {
        this.isBilateral = isBilateral;
    }

    destroy() {
        this.stop();
        this.recognition = null;
    }
}

export function speakTherapyMessage(message) {
    try {
        const utterance = new SpeechSynthesisUtterance(message);
        utterance.lang = 'en-US';
        utterance.rate = 0.95;
        utterance.pitch = 1.0;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
        return true;
    } catch (e) {
        console.warn('Failed to speak message:', e);
        return false;
    }
}
