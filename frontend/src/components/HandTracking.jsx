import React, { useEffect, useRef, useState } from 'react';
import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

const HandTracker = () => {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const [landmarker, setLandmarker] = useState(null);
    const [isCameraReady, setIsCameraReady] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    // 1. Initialize MediaPipe Hand Landmarker
    useEffect(() => {
        const initMediaPipe = async () => {
            try {
                // Fetch WASM binaries from CDN (avoids Vite bundling issues)
                const vision = await FilesetResolver.forVisionTasks(
                    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm"
                );

                const landmarkerInstance = await HandLandmarker.createFromOptions(vision, {
                    baseOptions: {
                        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
                        delegate: "GPU" // Uses hardware acceleration for maximum frame rates
                    },
                    runningMode: "VIDEO",
                    numHands: 2
                });

                setLandmarker(landmarkerInstance);
                console.log("🚀 MediaPipe Hand Landmarker successfully loaded!");
            } catch (err) {
                console.error("Error initializing MediaPipe:", err);
                setErrorMessage("Failed to load computer vision models.");
            }
        };

        initMediaPipe();
    }, []);

    // 2. Start Hardware Webcam Access
    useEffect(() => {
        if (!landmarker || !videoRef.current) return;

        const startCamera = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { width: 640, height: 480, frameRate: { ideal: 60 } },
                    audio: false
                });

                videoRef.current.srcObject = stream;
                videoRef.current.addEventListener('loadeddata', () => {
                    setIsCameraReady(true);
                });
            } catch (err) {
                console.error("Webcam access denied:", err);
                setErrorMessage("Webcam access denied. Check your permissions!");
            }
        };

        startCamera();

        // Cleanup camera stream when unmounting component
        return () => {
            if (videoRef.current && videoRef.current.srcObject) {
                videoRef.current.srcObject.getTracks().forEach(track => track.stop());
            }
        };
    }, [landmarker]);

    // 3. Real-Time Processing & Drawing Frame Loop
    useEffect(() => {
        if (!isCameraReady || !landmarker || !videoRef.current || !canvasRef.current) return;

        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        let animationFrameId;
        let lastVideoTime = -1;

        const renderLoop = () => {
            // Only process if a new video frame has actually loaded
            if (video.currentTime !== lastVideoTime) {
                lastVideoTime = video.currentTime;
                const startTimeMs = performance.now();

                // Execute coordinate extraction
                const results = landmarker.detectForVideo(video, startTimeMs);

                // Clear previous canvas drawing
                ctx.clearRect(0, 0, canvas.width, canvas.height);

                // Draw the visual landmarks overlay if hands are found
                if (results.landmarks && results.landmarks.length > 0) {
                    for (const landmarks of results.landmarks) {
                        // Draw tracking points
                        landmarks.forEach((point) => {
                            const x = point.x * canvas.width;
                            const y = point.y * canvas.height;

                            ctx.beginPath();
                            ctx.arc(x, y, 5, 0, 2 * Math.PI);
                            ctx.fillStyle = '#00FFCC'; // Bright cyan points for visibility
                            ctx.fill();
                        });

                        // NOTE: This raw point matrix data is what we will process and pipe 
                        // into Three.js and your backend telemetry records!
                    }
                }
            }

            // Request next browser frame repaint
            animationFrameId = requestAnimationFrame(renderLoop);
        };

        renderLoop();

        return () => cancelAnimationFrame(animationFrameId);
    }, [isCameraReady, landmarker]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', padding: '20px' }}>
            <h2 style={{ color: '#fff', margin: 0 }}>PhantomTouch Kinematic Workspace</h2>

            {errorMessage && <p style={{ color: '#ff4d4d' }}>{errorMessage}</p>}
            {!landmarker && !errorMessage && <p style={{ color: '#aaa' }}>Loading tracking engine...</p>}

            <div style={{ position: 'relative', width: '640px', height: '480px', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}>
                {/* Hidden or background mirror stream */}
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} // Mirror the preview
                />

                {/* Clear drawing layer overlay */}
                <canvas
                    ref={canvasRef}
                    width={640}
                    height={480}
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', transform: 'scaleX(-1)' }}
                />
            </div>
        </div>
    );
};

export default HandTracker;