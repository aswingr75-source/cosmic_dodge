class MediaPipeController {
    constructor() {
        this.model = null;
        this.video = null;
        this.camera = null;
        this.hands = null;

        this.isWebcamActive = false;
        this.isModelLoaded = false;
        this.handDetected = false;

        this.classNames = [];
        this.maxPredictions = 0;

        this.predictionPending = false;
        this.lastPredictionTime = 0;
        this.predictionInterval = 150;

        this.onModelLoadedCallback = null;
        this.onPredictionCallback = null;

        this.indexFinger = {
            x: 0.5,
            y: 0.5
        };
    }

    async setupWebcam(containerId) {
        const container = document.getElementById(containerId);

        if (!container) {
            throw new Error("Webcam container not found.");
        }

        // Prevent opening multiple webcam streams
        if (this.isWebcamActive) {
            return;
        }

        this.video = document.createElement("video");
        this.video.autoplay = true;
        this.video.playsInline = true;
        this.video.muted = true;

        this.video.style.width = "100%";
        this.video.style.height = "100%";
        this.video.style.objectFit = "cover";
        this.video.style.transform = "scaleX(-1)";

        container.innerHTML = "";
        container.appendChild(this.video);

        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: 640,
                height: 480,
                facingMode: "user"
            },
            audio: false
        });

        this.video.srcObject = stream;

        await new Promise(resolve => {
            this.video.onloadedmetadata = () => {
                this.video.play();
                resolve();
            };
        });

        this.hands = new Hands({
            locateFile: (file) =>
                `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        });

        this.hands.setOptions({
            maxNumHands: 1,
            modelComplexity: 1,
            minDetectionConfidence: 0.65,
            minTrackingConfidence: 0.65,
            selfieMode: true
        });

        this.hands.onResults((results) => {
            this.handDetected = false;

            if (
                results.multiHandLandmarks &&
                results.multiHandLandmarks.length > 0
            ) {
                const hand = results.multiHandLandmarks[0];
                const finger = hand[8];

                this.handDetected = true;

                // Smooth movement to avoid shaky spaceship control
                const smoothing = 0.25;

                this.indexFinger.x =
                    this.indexFinger.x * (1 - smoothing) +
                    finger.x * smoothing;

                this.indexFinger.y =
                    this.indexFinger.y * (1 - smoothing) +
                    finger.y * smoothing;
            }
        });

        this.camera = new Camera(this.video, {
            onFrame: async () => {
                if (!this.video || this.video.readyState < 2) return;

                await this.hands.send({
                    image: this.video
                });

                const now = performance.now();

                if (
                    this.isModelLoaded &&
                    this.model &&
                    this.onPredictionCallback &&
                    !this.predictionPending &&
                    now - this.lastPredictionTime >= this.predictionInterval
                ) {
                    this.lastPredictionTime = now;
                    await this.predict();
                }
            },

            width: 640,
            height: 480
        });

        await this.camera.start();

        this.isWebcamActive = true;
        console.log("Webcam controller started.");
    }

    async loadFromURL(url) {
        if (!url) {
            throw new Error("Model URL cannot be empty.");
        }

        if (!url.endsWith("/")) {
            url += "/";
        }

        const modelURL = url + "model.json";
        const metadataURL = url + "metadata.json";

        this.model = await tmImage.load(modelURL, metadataURL);

        this.maxPredictions = this.model.getTotalClasses();
        this.classNames = this.model.getClassLabels();
        this.isModelLoaded = true;

        if (this.onModelLoadedCallback) {
            this.onModelLoadedCallback(this.classNames);
        }

        console.log("Model loaded:", this.classNames);

        return this.classNames;
    }

    async loadFromFiles(modelJson, weightsBin, metadataJson) {
        if (!modelJson || !weightsBin || !metadataJson) {
            throw new Error(
                "Select model.json, weights.bin, and metadata.json."
            );
        }

        this.model = await tmImage.loadFromFiles(
            modelJson,
            weightsBin,
            metadataJson
        );

        this.maxPredictions = this.model.getTotalClasses();
        this.classNames = this.model.getClassLabels();
        this.isModelLoaded = true;

        if (this.onModelLoadedCallback) {
            this.onModelLoadedCallback(this.classNames);
        }

        return this.classNames;
    }

    async predict() {
        if (
            !this.model ||
            !this.video ||
            this.predictionPending ||
            this.video.readyState < 2
        ) {
            return;
        }

        this.predictionPending = true;

        try {
            const prediction = await this.model.predict(this.video);

            let highestIndex = 0;
            let highestProbability = 0;

            for (let i = 0; i < prediction.length; i++) {
                if (prediction[i].probability > highestProbability) {
                    highestProbability = prediction[i].probability;
                    highestIndex = i;
                }
            }

            const topPrediction = {
                className: prediction[highestIndex].className,
                probability: highestProbability,
                index: highestIndex
            };

            if (this.onPredictionCallback) {
                this.onPredictionCallback(prediction, topPrediction);
            }

            return {
                prediction,
                topPrediction
            };
        } catch (error) {
            console.error("Prediction error:", error);
        } finally {
            this.predictionPending = false;
        }
    }

    stop() {
        if (this.camera) {
            try {
                this.camera.stop();
            } catch (error) {
                console.warn("Could not stop MediaPipe camera:", error);
            }

            this.camera = null;
        }

        if (this.video && this.video.srcObject) {
            this.video.srcObject.getTracks().forEach(track => track.stop());
        }

        if (this.video && this.video.parentNode) {
            this.video.parentNode.removeChild(this.video);
        }

        this.video = null;
        this.hands = null;

        this.isWebcamActive = false;
        this.handDetected = false;

        // Important: model stays loaded
        // this.isModelLoaded = false;  <-- do NOT use this
    }
}

window.tmLoader = new MediaPipeController();