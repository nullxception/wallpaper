const canvas = document.getElementById("visualizer");
const background = document.getElementById("background");
const weekdayElement = document.getElementById("weekday");
const dateElement = document.getElementById("date");
const canvasWidth = window.innerWidth;
const canvasHeight = window.innerHeight;
canvas.width = canvasWidth;
canvas.height = canvasHeight;

const ctx = canvas.getContext("2d");
const offscreenCanvas = new OffscreenCanvas(canvasWidth, canvasHeight);
const offscreenCtx = offscreenCanvas.getContext("2d");
const backgroundStyle = background.style;
const weekdayStyle = weekdayElement.style;
const dateStyle = dateElement.style;

const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
];

const conf = {
    bg: "",
    bgOffsetY: 0,
    barOpacity: 0.75,
    barColor: "#000000",
    zoomFactor: 0.25,
    rotationFactor: 6,
    rotationSpeedMs: 5000,
    barCount: 100,
    barMaxHeight: 600,
    barSpacing: 3,
    yOffset: 0,
    barThickness: 12,
    barRoundness: 14,
    barShadowColor: [0, 0, 0],
    dateColor: "#000000",
    dateShadowColor: [0, 0, 0],
    monitorChanges: false,
};

const equalizerSettings = {
    band1: 1.0,
    band2: 1.0,
    band3: 0.5,
    band4: 0.2,
    band5: 0.2,
    band6: 0.2,
    band7: 0.2,
    band8: 0.2,
};

const state = {
    fps: 30,
    audioData: [],
    lastTime: 0,
    hasAudio: false,
    lastRotationAngle: 0,
    bassIntensity: 0,
    last: performance.now() / 1000,
    fpsThreshold: 0,
    scale: 1,
    date: null,
};

const ecolor = {
    asHex: (color) => {
        var customColor = color.split(" ");
        customColor = customColor.map(function (c) {
            return Math.ceil(c * 255)
                .toString(16)
                .padStart(2, "0");
        });
        return "#" + customColor.join("");
    },
    asShadow: (color) => {
        var customColor = color.split(" ");
        customColor = customColor.map(function (c) {
            return Math.ceil(c * 255);
        });
        return [...customColor];
    },
};

function initAudioBuffer() {
    state.audioData = new Array(conf.barCount).fill(0);
}
const listener = {
    audio: (samples) => {
        initAudioBuffer();
        for (let i = 0; i < conf.barCount; i++) {
            state.audioData[i] = samples[i] > 0.01 ? samples[i] : 0;
        }
    },
    properties: (properties) => {
        if (properties.barColor) {
            conf.barColor = ecolor.asHex(properties.barColor.value);
        }
        if (properties.barShadow) {
            conf.barShadowColor = ecolor.asShadow(properties.barShadow.value);
        }

        if (properties.dateColor) {
            conf.dateColor = ecolor.asHex(properties.dateColor.value);
        }

        if (properties.dateShadow) {
            conf.dateShadowColor = ecolor.asShadow(properties.dateShadow.value);
        }

        if (properties.bgOffsetY) {
            conf.bgOffsetY = properties.bgOffsetY.value;
        }

        if (properties.bg) {
            conf.bg = properties.bg.value;
        }

        updateStyles();
    },
};

function lerp(start, end, t) {
    return start + (end - start) * t;
}

function updateDate() {
    const today = new Date();
    if (state.date === today.getDate()) {
        return;
    }

    weekdayElement.textContent = days[today.getDay()];

    const options = { year: "numeric", month: "long", day: "numeric" };
    dateElement.textContent = today.toLocaleDateString("en-US", options);
}

function updateVisualizerBars() {
    const barWidth = conf.barThickness;
    const spacing = conf.barSpacing;
    const totalBarsWidth = conf.barCount * (barWidth + spacing) - spacing;
    let x = (canvasWidth - totalBarsWidth) / 2 + spacing / 2;
    state.bassIntensity = 0;
    state.hasAudio = false;
    const segmentSize = conf.barCount / 8;
    const maxHeight = conf.barMaxHeight;

    for (let i = 0; i < conf.barCount; i++) {
        let eqIndex = Math.floor(i / segmentSize) + 1;
        let eqFactor = equalizerSettings[`band${eqIndex}`] || 1;
        let targetHeight = Math.max(
            state.audioData[i] * maxHeight * eqFactor,
            0,
        );

        let currentHeight = lerp(
            offscreenCtx.currentHeights
                ? offscreenCtx.currentHeights[i] || 0
                : 0,
            targetHeight,
            0.35,
        );

        if (currentHeight > 1) {
            state.hasAudio = true;
            offscreenCtx.fillStyle = conf.barColor;
            offscreenCtx.globalAlpha = conf.barOpacity;
            const glowStrength =
                100 * Math.min(Math.abs(state.audioData[i]) * 2, 1);
            offscreenCtx.shadowColor = `rgb(${conf.barShadowColor[0]} ${conf.barShadowColor[1]} ${conf.barShadowColor[2]} / ${glowStrength}%)`;
            offscreenCtx.shadowOffsetX = 0;
            offscreenCtx.shadowOffsetY = 0;
            offscreenCtx.shadowBlur = 20;

            offscreenCtx.beginPath();
            offscreenCtx.roundRect(
                x,
                canvas.height / 2 - currentHeight / 2 + conf.yOffset,
                barWidth,
                currentHeight,
                conf.barRoundness,
            );
            offscreenCtx.fill();
        }

        // Store the current height for the next frame
        if (!offscreenCtx.currentHeights) {
            offscreenCtx.currentHeights = [];
        }
        offscreenCtx.currentHeights[i] = currentHeight;

        x += barWidth + spacing;
        if (i < conf.barCount / 4) {
            state.bassIntensity += Math.abs(state.audioData[i]);
        }
    }
    state.bassIntensity /= conf.barCount / 4;
}

function updateGlowEffect() {
    const intensity = state.bassIntensity;
    const glowStrength = Math.min(intensity * 2, 1);
    const glowColor = `rgba(${conf.dateShadowColor.join(
        ",",
    )}, ${glowStrength})`;

    const shadowSize = Math.min(intensity * 30, 30);
    const newShadow = `0 0 ${shadowSize}px ${glowColor}, 0 0 ${
        shadowSize * 2
    }px ${glowColor}, 0 0 ${shadowSize * 3}px ${glowColor}`;

    if (weekdayStyle.textShadow !== newShadow) {
        weekdayStyle.textShadow = newShadow;
        dateStyle.textShadow = newShadow;
    }
}

function updateStyles() {
    if (conf.bg === "") {
        background.style.backgroundImage = null;
    } else {
        background.style.backgroundImage = `url('file:///${conf.bg}')`;
    }

    background.style.backgroundPosition = `center ${conf.bgOffsetY}px`;
    dateElement.style.color = conf.dateColor;
    weekdayElement.style.color = conf.dateColor;
}

function transformElements(time) {
    const newScale =
        state.scale +
        (1 + state.bassIntensity * conf.zoomFactor - state.scale) * 0.1;

    if (state.hasAudio) {
        state.lastTime = time;

        if (state.lastRotationAngle < 0) {
            state.lastRotationAngle = 0;
        } else if (state.lastRotationAngle > conf.rotationFactor) {
            state.lastRotationAngle = conf.rotationFactor;
        }

        state.lastRotationAngle +=
            Math.sin(
                ((time % conf.rotationSpeedMs) / conf.rotationSpeedMs) *
                    (2 * Math.PI),
            ) *
            (1 / state.fps) *
            ((conf.rotationFactor / Math.PI) * 2);
    }

    if (state.hasAudio || state.lastRotationAngle !== 0) {
        let newTransform = `scale(${newScale}) rotate(${state.lastRotationAngle}deg)`;
        if (newScale <= 1) {
            newTransform = "rotate(0deg)";
        }
        if (background.style.transform !== newTransform) {
            background.style.transform = newTransform;
            state.scale = newScale;
        }

        const zoomedTextTransform = `scale(${1 / newScale})`;
        if (weekdayElement.style.transform !== zoomedTextTransform) {
            weekdayElement.style.transform = zoomedTextTransform;
        }
        if (dateElement.style.transform !== zoomedTextTransform) {
            dateElement.style.transform = zoomedTextTransform;
        }

        const zoomedVisualizer = `translate(-50%, -50%) scale(${
            newScale * 0.7
        })`;
        if (canvas.style.transform !== zoomedVisualizer) {
            canvas.style.transform = zoomedVisualizer;
        }
    }
}

function draw(time) {
    requestAnimationFrame(draw);

    const now = performance.now() / 1000;
    const dt = Math.min(now - state.last, 1);
    state.last = now;

    if (state.fps > 0) {
        state.fpsThreshold += dt;
        if (state.fpsThreshold < 1.0 / state.fps) {
            return;
        }
        state.fpsThreshold -= 1.0 / state.fps;
    }

    offscreenCtx.clearRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
    updateVisualizerBars();
    transformElements(time);
    updateGlowEffect();

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(offscreenCanvas, 0, 0);
}

window.wallpaperPropertyListener = {
    applyGeneralProperties: (properties) => {
        if (properties.fps) {
            state.fps = properties.fps;
        }
    },
    setPaused: (isPaused) => {
        canvas.style.visibility = isPaused ? "hidden" : "visible";
    },
    applyUserProperties: listener.properties,
};

window.wallpaperRegisterAudioListener(listener.audio);

initAudioBuffer();
updateDate();
updateStyles();
requestAnimationFrame(draw);
setInterval(updateDate, 60000);
