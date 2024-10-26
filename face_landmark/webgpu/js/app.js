import { FaceLandmarkRenderer } from './face-landmark-renderer.js';
import { Matrix4 } from './matrix4.js';
import { TextureLoader } from './texture-loader.js';
import { MaskManager } from './mask-manager.js';

// Enhanced global state
let renderer;
let faceMeshModel;
let stats;
let gui;
let maskManager;
let videoStream;
let lastFrameTime = 0;
let frameCounter = 0;
let fpsValues = [];

// Enhanced GUI Properties
const guiProperties = {
    srcImgScale: 1.0,
    maskAlpha: 0.7,
    flipHorizontal: true,
    maskEyeHole: false,
    drawPerfMeter: true,
    enableSmoothing: true,
    smoothingFactor: 0.5,
    predictionsPerSecond: 30,
    highPerformanceMode: false
};

// Performance monitoring
const performanceMetrics = {
    fps: 0,
    renderTime: 0,
    detectionTime: 0,
    gpuMemory: 0
};

function checkDependencies() {
    const dependencies = {
        'TensorFlow.js': typeof tf !== 'undefined',
        'Face Landmarks Detection': typeof faceLandmarksDetection !== 'undefined',
        'Stats.js': typeof Stats !== 'undefined',
        'dat.GUI': typeof dat !== 'undefined'
    };

    console.log('Checking dependencies:');
    Object.entries(dependencies).forEach(([name, loaded]) => {
        console.log(`${name}: ${loaded ? '✓' : '✗'}`);
        if (!loaded) {
            throw new Error(`${name} not loaded`);
        }
    });
}

// Helper function to wait for video to be ready
function waitForVideoReady(video) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('Video ready timeout'));
        }, 10000);

        function checkVideo() {
            if (isVideoReady(video)) {
                clearTimeout(timeout);
                resolve();
            } else {
                requestAnimationFrame(checkVideo);
            }
        }
        checkVideo();
    });
}


async function init() {
    try {
        // 1. Check WebGPU support
        if (!navigator.gpu) {
            throw new Error('WebGPU not supported');
        }

        // 2. Check dependencies
        try {
            checkDependencies();
        } catch (error) {
            console.error('Dependency check failed:', error);
            document.getElementById('debug_log').innerHTML = `Error: ${error.message}`;
            return;
        }

        // 3. Initialize WebGPU renderer FIRST
        const canvas = document.getElementById('gpuCanvas');
        renderer = new FaceLandmarkRenderer();
        await renderer.initialize(canvas);
        console.log('WebGPU renderer initialized');

        // 4. Initialize TensorFlow.js
        await tf.ready();
        console.log('TensorFlow.js ready');

        // 5. Initialize face detection
        if (typeof faceLandmarksDetection === 'undefined') {
            throw new Error('Face landmarks detection library not loaded');
        }

        try {
            faceMeshModel = await faceLandmarksDetection.createDetector(
                faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh,
                {
                    runtime: 'tfjs',
                    refineLandmarks: true,
                    maxFaces: 1,
                }
            );
            console.log('Face mesh model loaded');
        } catch (modelError) {
            console.error('Error loading face mesh model:', modelError);
            throw modelError;
        }

        // 6. Initialize video stream with proper setup
        console.log('Setting up video stream...');
        try {
            videoStream = await setupVideoStream();
            console.log('Video stream initialized');

            await waitForVideoReady(videoStream);
            console.log('Video stream ready', {
                width: videoStream.videoWidth,
                height: videoStream.videoHeight
            });

        } catch (streamError) {
            console.error('Error accessing camera:', streamError);
            throw streamError;
        }

        // 7. Initialize texture loader and mask manager
        // Now renderer.device is available
        const textureLoader = await TextureLoader.initialize(renderer.device);
            
        const maskManager = new MaskManager(renderer.device, textureLoader);
        try {
            await maskManager.loadDefaultMasks();
            console.log('Masks loaded successfully');
        } catch (error) {
            console.error('Mask loading failed:', error);
        }
       
       
          // Verify active mask
          const activeMask = maskManager.getActiveMask();
          if (!activeMask) {
              throw new Error('No active mask available after loading');
          }

        // 9. Initialize stats
        stats = new Stats();
        document.body.appendChild(stats.dom);
        stats.showPanel(0);
        console.log('Stats initialized');

        // 10. Initialize GUI
        initializeGUI();
        console.log('GUI initialized');

        // 11. Start render loop
        // Only start render loop after everything is initialized
         // 11. Verify all components before starting render loop
     
        if (activeMask && isVideoReady(videoStream)) {
            requestAnimationFrame(enhancedRender);
            console.log('Render loop started with active mask');
        } else {
            throw new Error('Missing required components for render loop');
        }

        console.log('Render loop started');

        // 12. Hide loading spinner
        document.getElementById('loading').classList.add('loaded');

    } catch (error) {
        console.error('Initialization error:', error);
        document.getElementById('debug_log').innerHTML = `Error: ${error.message}`;
        
        // Add more detailed error information to debug log
        const debugLog = document.getElementById('debug_log');
        if (debugLog) {
            debugLog.innerHTML += `<br>Details:<br>- GPU initialized: ${!!renderer}<br>- Masks loaded: ${!!maskManager?.getActiveMask()}<br>- Video ready: ${!!videoStream}`;
        }
    }
}


// Add helper function to check if mask file exists
async function checkMaskFileExists(maskPath) {
    try {
        const response = await fetch(maskPath, { method: 'HEAD' });
        return response.ok;
    } catch (error) {
        console.warn(`Failed to check mask file: ${maskPath}`, error);
        return false;
    }
}

// Add mask preview helper
function addMaskPreview(mask) {
    if (!mask) {
        console.warn('Attempted to add preview for null mask');
        return;
    }

    try {
        const previewsContainer = document.getElementById('mask-previews');
        if (!previewsContainer) {
            console.warn('Mask previews container not found');
            return;
        }

        const preview = document.createElement('div');
        preview.className = 'mask-preview';
        preview.innerHTML = `
            <img src="${mask.id}" alt="Mask preview" onerror="this.src='assets/mask/placeholder.jpg'">
            <div class="mask-label">${mask.id.split('/').pop()}</div>
        `;
        preview.onclick = () => {
            try {
                maskManager.setActiveMask(mask.id);
                // Update active state visuals
                document.querySelectorAll('.mask-preview').forEach(p => p.classList.remove('active'));
                preview.classList.add('active');
            } catch (error) {
                console.error('Error setting active mask:', error);
            }
        };
        previewsContainer.appendChild(preview);
    } catch (error) {
        console.error('Error adding mask preview:', error);
    }
}

// Add an initialization status display
function updateInitStatus(stage, success = true) {
    const debugLog = document.getElementById('debug_log');
    const status = success ? '✅' : '❌';
    debugLog.innerHTML += `<div>${status} ${stage}</div>`;
}

// Update the GUI initialization
function initializeGUI() {
    if (!dat || !dat.GUI) {
        console.error('dat.GUI not loaded');
        return;
    }

    try {
        gui = new dat.GUI();
        const renderFolder = gui.addFolder('Rendering');
        renderFolder.add(guiProperties, 'maskAlpha', 0.0, 1.0).name('Mask Opacity');
        renderFolder.add(guiProperties, 'flipHorizontal').name('Flip Camera');
        renderFolder.add(guiProperties, 'maskEyeHole').name('Eye Holes');

        const performanceFolder = gui.addFolder('Performance');
        performanceFolder.add(guiProperties, 'highPerformanceMode').name('High Performance')
            .onChange(value => updatePerformanceMode(value));
        performanceFolder.add(guiProperties, 'predictionsPerSecond', 15, 60).name('FPS Target');
        performanceFolder.add(guiProperties, 'enableSmoothing').name('Enable Smoothing');
        performanceFolder.add(guiProperties, 'smoothingFactor', 0, 1).name('Smooth Factor');

        renderFolder.open();
        performanceFolder.open();
    } catch (error) {
        console.error('Error initializing GUI:', error);
        updateInitStatus('GUI initialization', false);
    }
}
function addDebugVideoDisplay() {
    const debugVideo = document.createElement('video');
    debugVideo.id = 'debug-video';
    debugVideo.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        width: 160px;
        height: 120px;
        opacity: 0.5;
        z-index: 1000;
        border-radius: 4px;
        display: none;
    `;
    document.body.appendChild(debugVideo);
    return debugVideo;
}

function updateDebugInfo(message) {
    const debugLog = document.getElementById('debug_log');
    if (debugLog) {
        const timestamp = new Date().toLocaleTimeString();
        debugLog.innerHTML = `
            <div class="debug-message">${timestamp}: ${message}</div>
            <div class="debug-state">
                Video Ready: ${isVideoReady()}<br>
                Frame Count: ${frameCounter}<br>
                FPS: ${performanceMetrics.fps.toFixed(1)}<br>
                Video Size: ${videoStream?.videoWidth}x${videoStream?.videoHeight}
            </div>
        ` + debugLog.innerHTML;

        // Keep only last 5 messages
        const messages = debugLog.getElementsByClassName('debug-message');
        while (messages.length > 5) {
            messages[messages.length - 1].remove();
        }
    }
}

// Updated video stream setup
async function setupVideoStream() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: 640,
                height: 480,
                facingMode: "user",
                frameRate: { ideal: 30 }
            }
        });

        // Create and setup video element
        const video = document.createElement('video');
        video.width = 640;
        video.height = 480;
        video.autoplay = true;
        video.playsInline = true;
        video.muted = true;
        
        // Set video source
        video.srcObject = stream;

        // Wait for video to be ready
        await new Promise((resolve, reject) => {
            video.onloadedmetadata = () => {
                video.play().then(resolve).catch(reject);
            };
            video.onerror = reject;
        });

        // Add debug display (optional)
        if (guiProperties.drawPerfMeter) {
            video.style.cssText = `
                position: fixed;
                top: 10px;
                right: 10px;
                width: 160px;
                height: 120px;
                opacity: 0.5;
                z-index: 1000;
            `;
            document.body.appendChild(video);
        } else {
            video.style.display = 'none';
            document.body.appendChild(video);
        }

        return video;
    } catch (error) {
        console.error('Error setting up video:', error);
        throw error;
    }
}

let state = {
    renderer: null,
    maskManager: null,
    faceMeshModel: null,
    videoStream: null,
    isInitialized: false
};


// Updated render function
// Updated enhancedRender function
async function enhancedRender(timestamp) {
    try {
        // Check if we have all required components
        if (!isRenderingReady()) {
            requestAnimationFrame(enhancedRender);
            return;
        }

        stats?.begin();

        // Safe reference to maskManager
        const { maskManager } = state;
        if (!maskManager) {
            console.warn('MaskManager not initialized');
            requestAnimationFrame(enhancedRender);
            return;
        }

        // Get active mask with safety check
        const activeMask = maskManager.getActiveMask();
        if (!activeMask) {
            requestAnimationFrame(enhancedRender);
            return;
        }

        const deltaTime = timestamp - lastFrameTime;
        lastFrameTime = timestamp;

        // Face detection with proper error handling
        const shouldDetect = frameCounter % Math.round(60 / guiProperties.predictionsPerSecond) === 0;

        if (shouldDetect && state.faceMeshModel && state.videoStream) {
            try {
                const predictions = await state.faceMeshModel.estimateFaces(state.videoStream, {
                    flipHorizontal: false,
                    staticImageMode: false
                });

                if (predictions && predictions.length > 0) {
                    const processedPrediction = guiProperties.enableSmoothing ? 
                        smoothPredictions(predictions[0]) : 
                        predictions[0];

                    if (state.renderer) {
                        await state.renderer.render({
                            predictions: [processedPrediction],
                            mask: activeMask,
                            properties: guiProperties
                        });
                    }
                }
            } catch (error) {
                console.error('Face detection error:', error);
            }
        }

        // Performance metrics
        frameCounter++;
        if (frameCounter % 30 === 0) {
            updatePerformanceMetrics(deltaTime);
        }

        stats?.end();
    } catch (error) {
        console.error('Render loop error:', error);
    }

    requestAnimationFrame(enhancedRender);
}


// Helper function to check if video is ready
function isVideoReady() {
    return videoStream && 
           !videoStream.paused && 
           !videoStream.ended && 
           videoStream.readyState === videoStream.HAVE_ENOUGH_DATA;
}

// Add readiness check function
function isRenderingReady() {
    const videoReady = videoStream?.readyState === 4;
    const maskManagerReady = maskManager && maskManager.getActiveMask();
    const rendererReady = renderer != null;
    const modelReady = faceMeshModel != null;

    const ready = videoReady && maskManagerReady && rendererReady && modelReady;
    
    if (!ready) {
        console.debug('Not ready:', {
            video: videoReady,
            mask: maskManagerReady,
            renderer: rendererReady,
            model: modelReady
        });
    }

    return ready;
}

// Updated smoothPredictions function
function smoothPredictions(prediction) {
    if (!prediction?.scaledMesh) {
        return prediction;
    }

    if (!window.lastPrediction?.scaledMesh) {
        window.lastPrediction = prediction;
        return prediction;
    }

    const factor = guiProperties.smoothingFactor;
    const smoothedMesh = prediction.scaledMesh.map((point, i) => {
        const lastPoint = window.lastPrediction.scaledMesh[i];
        if (!lastPoint) return point;
        
        return [
            point[0] * (1 - factor) + lastPoint[0] * factor,
            point[1] * (1 - factor) + lastPoint[1] * factor,
            point[2] * (1 - factor) + lastPoint[2] * factor
        ];
    });

    const smoothedPrediction = {
        ...prediction,
        scaledMesh: smoothedMesh
    };

    window.lastPrediction = smoothedPrediction;
    return smoothedPrediction;
}



// Enhance cleanup function
function cleanup() {
    try {
        if (videoStream) {
            const stream = videoStream.srcObject;
            const tracks = stream?.getTracks() || [];
            tracks.forEach(track => track.stop());
            videoStream.srcObject = null;
            videoStream.remove();
        }
        
        renderer?.cleanup();
        maskManager?.cleanup();
        gui?.destroy();
        
        // Remove stats if exists
        stats?.dom?.remove();
        
        // Clear performance metrics
        performanceMetrics.fps = 0;
        performanceMetrics.renderTime = 0;
        performanceMetrics.detectionTime = 0;
        performanceMetrics.gpuMemory = 0;
        
        console.log('Cleanup completed');
    } catch (error) {
        console.error('Cleanup error:', error);
    }
}

// Add video recovery function
async function recoveryVideo() {
    try {
        cleanup();
        await init();
        console.log('Video recovery successful');
    } catch (error) {
        console.error('Video recovery failed:', error);
        updateDebugInfo('Video recovery failed: ' + error.message);
    }
}

// async function loadDefaultMasks() {
//     const defaultMasks = [
//         'assets/mask/default.jpg',F
//         'assets/mask/mask2.jpg',
//         'assets/mask/mask3.jpg'
//     ];

//     // Fallback masks (built into your application)
//     const fallbackMasks = [
//         'assets/fallback/basic_mask.jpg',
//         'assets/fallback/simple_mask.png'
//     ];

//     let loadedMasks = 0;
//     const errors = [];

//     // Try loading default masks first
//     for (const maskPath of defaultMasks) {
//         try {
//             console.log(`Attempting to load mask: ${maskPath}`);
//             const mask = await maskManager.addMask(maskPath, maskPath);
//             console.log(`Successfully loaded mask: ${maskPath}`, {
//                 width: mask.textureData.width,
//                 height: mask.textureData.height
//             });
//             loadedMasks++;
//         } catch (error) {
//             errors.push({ path: maskPath, error });
//             console.warn(`Failed to load mask: ${maskPath}`, error);
//         }
//     }

//     // If no masks loaded, try fallbacks
//     if (loadedMasks === 0 && fallbackMasks.length > 0) {
//         console.warn('No default masks loaded, trying fallbacks...');
//         for (const fallbackPath of fallbackMasks) {
//             try {
//                 const mask = await maskManager.addMask(fallbackPath, fallbackPath);
//                 console.log(`Successfully loaded fallback mask: ${fallbackPath}`);
//                 loadedMasks++;
//                 break; // One fallback is enough
//             } catch (fallbackError) {
//                 errors.push({ path: fallbackPath, error: fallbackError });
//                 console.error(`Failed to load fallback mask: ${fallbackPath}`, fallbackError);
//             }
//         }
//     }

//     // If still no masks, create a programmatic fallback
//     if (loadedMasks === 0) {
//         console.warn('All mask loading failed, creating programmatic fallback');
//         try {
//             const fallbackTexture = await createProgrammaticFallbackTexture(maskManager.device);
//             const mask = await maskManager.addMask('fallback', fallbackTexture);
//             loadedMasks++;
//         } catch (error) {
//             errors.push({ path: 'programmatic-fallback', error });
//             throw new Error('Failed to load any masks, including fallbacks');
//         }
//     }

//     if (!loadedAny) {
//         // Create fallback mask
//         try {
//             console.log('Creating fallback mask');
//             const mask = await maskManager.addMask('fallback', null);
//             loadedAny = true;
//         } catch (error) {
//             console.error('Failed to create fallback mask:', error);
//             throw new Error('Failed to load any masks, including fallbacks');
//         }
//     }

//     return {
//         loadedMasks,
//         errors
//     };
// }
const DEFAULT_MASKS = [
    {
        id: 'default',
        url: 'assets/mask/default.png'
    },
    {
        id: 'einstein',
        url: 'assets/mask/einstein.png'
    },
    // Add more masks as needed
];

async function loadDefaultMasks() {
    // Try loading masks in order of preference
    const maskTypes = [
        { type: 'faceMasks', desc: 'face-shaped mask' },
        { type: 'circleMasks', desc: 'circular mask' },
        { type: 'gradientMasks', desc: 'gradient mask' },
        { type: 'patternMasks', desc: 'pattern mask' },
        { type: 'textureMasks', desc: 'texture mask' }
    ];

    for (const { type, desc } of maskTypes) {
        const masks = maskSources[type];
        for (const maskUrl of masks) {
            try {
                console.log(`Attempting to load ${desc} from: ${maskUrl}`);
                const mask = await maskManager.addMask(maskUrl, maskUrl);
                console.log(`Successfully loaded ${desc}`);
                return true;
            } catch (error) {
                console.warn(`Failed to load ${desc} from ${maskUrl}:`, error);
            }
        }
    }

    // If all online masks fail, create programmatic fallback
    try {
        console.log('Creating programmatic fallback mask');
        const fallbackMask = await createProgrammaticMask();
        await maskManager.addMask('fallback', fallbackMask);
        return true;
    } catch (error) {
        console.error('Failed to create fallback mask:', error);
        throw new Error('Failed to load any masks, including fallbacks');
    }
}

// Create a more sophisticated programmatic mask as final fallback
async function createProgrammaticMask() {
    const canvas = document.createElement('canvas');
    const size = 512; // Larger size for better quality
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Create face-shaped mask
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, size, size);

    // Outer glow
    const outerGradient = ctx.createRadialGradient(
        size/2, size/2, size/4,
        size/2, size/2, size/2
    );
    outerGradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    outerGradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.5)');
    outerGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

    ctx.fillStyle = outerGradient;
    ctx.fillRect(0, 0, size, size);

    // Face oval
    ctx.beginPath();
    ctx.ellipse(size/2, size/2, size/3, size/2.2, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.fill();

    return canvas.toDataURL('image/png');
}

async function createProgrammaticFallbackTexture(device) {
    const canvas = document.createElement('canvas');
    const size = 256;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Create a simple gradient pattern
    const gradient = ctx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, '#444444');
    gradient.addColorStop(1, '#666666');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    // Add some visual interest
    ctx.strokeStyle = '#888888';
    ctx.lineWidth = 2;
    for (let i = 0; i < size; i += 20) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(size, i);
        ctx.stroke();
    }

    // Add text
    ctx.fillStyle = '#ffffff';
    ctx.font = '20px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Fallback Mask', size/2, size/2);

    return canvas.toDataURL('image/png');
}

function showError(message, details) {
    const container = document.getElementById('error-container');
    const title = container.querySelector('.error-title');
    const detailsElem = container.querySelector('.error-details');
    
    title.textContent = message;
    
    // Update status indicators
    Object.entries(details).forEach(([key, value]) => {
        const item = detailsElem.querySelector(`[data-status="${key}"]`);
        if (item) {
            const indicator = item.querySelector('.status-indicator');
            indicator.className = `status-indicator status-${value ? 'success' : 'error'}`;
        }
    });
    
    container.style.display = 'block';
}


function initializeEnhancedGUI() {
    gui = new GUI();
    const renderFolder = gui.addFolder('Rendering');
    renderFolder.add(guiProperties, 'maskAlpha', 0.0, 1.0).name('Mask Opacity');
    renderFolder.add(guiProperties, 'flipHorizontal').name('Flip Camera');
    renderFolder.add(guiProperties, 'maskEyeHole').name('Eye Holes');

    const performanceFolder = gui.addFolder('Performance');
    performanceFolder.add(guiProperties, 'highPerformanceMode').name('High Performance')
        .onChange(value => updatePerformanceMode(value));
    performanceFolder.add(guiProperties, 'predictionsPerSecond', 15, 60).name('FPS Target');
    performanceFolder.add(guiProperties, 'enableSmoothing').name('Enable Smoothing');
    performanceFolder.add(guiProperties, 'smoothingFactor', 0, 1).name('Smooth Factor');

    renderFolder.open();
    performanceFolder.open();
}



function updatePerformanceMode(highPerformance) {
    if (highPerformance) {
        guiProperties.predictionsPerSecond = 60;
        guiProperties.enableSmoothing = false;
    } else {
        guiProperties.predictionsPerSecond = 30;
        guiProperties.enableSmoothing = true;
    }
}

function updatePerformanceMetrics(deltaTime) {
    const fps = 1000 / deltaTime;
    fpsValues.push(fps);
    if (fpsValues.length > 60) fpsValues.shift();
    
    performanceMetrics.fps = fpsValues.reduce((a, b) => a + b) / fpsValues.length;
    
    if (navigator.gpu) {
        // Get GPU memory usage if available
        const adapter = renderer.device.adapter;
        if (adapter && adapter.reportMemory) {
            adapter.reportMemory().then(info => {
                performanceMetrics.gpuMemory = info.currentMemory / 1024 / 1024; // Convert to MB
            });
        }
    }
}

function updatePerformanceDisplay() {
    const overlay = document.getElementById('performance-overlay');
    const fpsClass = performanceMetrics.fps > 50 ? 'fps-good' : 
                   performanceMetrics.fps > 30 ? 'fps-medium' : 'fps-bad';

    overlay.innerHTML = `
        <div class="${fpsClass}">FPS: ${performanceMetrics.fps.toFixed(1)}</div>
        <div>Detection: ${performanceMetrics.detectionTime.toFixed(1)}ms</div>
        <div>Render: ${performanceMetrics.renderTime.toFixed(1)}ms</div>
        <div>GPU Memory: ${performanceMetrics.gpuMemory.toFixed(1)}MB</div>
    `;
}

// Enhanced file drop handling
async function handleDrop(e) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
        try {
            const mask = await maskManager.addMask(file.name, file);
            addMaskPreview(mask);
            await maskManager.setActiveMask(file.name);
        } catch (error) {
            console.error('Error loading mask:', error);
        }
    }
}


// Set up enhanced drag and drop handlers
const canvas = document.getElementById('gpuCanvas');
canvas.addEventListener('dragover', e => {
    e.preventDefault();
    canvas.style.opacity = '0.7';
});
canvas.addEventListener('dragleave', () => {
    canvas.style.opacity = '1';
});
canvas.addEventListener('drop', e => {
    canvas.style.opacity = '1';
    handleDrop(e);
});

// Initialize everything when the page loads
window.addEventListener('load', init);
window.addEventListener('unload', cleanup);
window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        recoveryVideo();
    }
});