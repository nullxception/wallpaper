const vis = document.getElementById("visualizer");
const wall = document.getElementById("background");
const dateTime = document.getElementById("dateTimeContainer");
const weekdayText = document.getElementById("weekday");
const dateText = document.getElementById("date");

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
    fgColor: [0, 0, 0],
    fgShadowColor: [255, 255, 255],
    fgOpacity: 0.75,
    rotationFactor: 6,
    barHeight: 300,
    barSpacing: 3,
    yOffset: 0,
    barWidth: 12,
    barRoundness: 14,
    eq: [1.0, 1.0, 0.5, 0.4, 0.3, 0.3, 0.3, 0.3],
};

const state = {
    fps: 30,
    audio: new Float32Array(64).fill(0),
    hasAudio: false,
    swingAngle: 0,
    bassIntensity: 0,
    last: performance.now() / 1000,
    fpsThreshold: 0,
    scale: 1,
    date: null,
    width: window.innerWidth,
    height: window.innerHeight,
};

function parseEngineColor(color) {
    const c = color.split(" ").map((it) => Math.ceil(it * 255));
    return [...c];
}

const listener = {
    audio: (samples) => {
        state.hasAudio = samples.some((it) => it > 0.01);

        for (let i = 0; i < 64; i++) {
            state.audio[i] = samples[i] > 0.01 ? samples[i] : 0;
        }
    },
    properties: (props) => {
        if (props.fgColor) {
            conf.fgColor = parseEngineColor(props.fgColor.value);
        }

        if (props.fgOpacity) {
            conf.fgOpacity = props.fgOpacity.value;
        }

        if (props.fgShadowColor) {
            conf.fgShadowColor = parseEngineColor(props.fgShadowColor.value);
        }

        if (props.bgOffsetY) {
            conf.bgOffsetY = props.bgOffsetY.value;
        }

        if (props.bg) {
            conf.bg = props.bg.value;
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

    weekdayText.textContent = days[today.getDay()];

    const options = { year: "numeric", month: "long", day: "numeric" };
    dateText.textContent = today.toLocaleDateString("en-US", options);
}

function updateStyles() {
    vis.width = state.width;
    vis.height = state.height;
    document.documentElement.style.setProperty(
        `--wall`,
        conf.bg === "" ? null : `url('file:///${conf.bg}')`
    );
    wall.style.setProperty(`--y`, conf.bgOffsetY + `px`);
    dateTime.style.color = `rgb(${conf.fgColor.join(" ")} / ${conf.fgOpacity})`;
}

const ctx = vis.getContext("2d");
const offscreenCanvas = new OffscreenCanvas(state.width, state.height);
const offscreenCtx = offscreenCanvas.getContext("2d");

function createShadow(intensity) {
    const strength = Math.min(intensity * 2, 1);
    const color = conf.fgShadowColor.join(" ");
    const size = Math.min(intensity * 30, 30) * (2 * strength);
    return { size, color, strength };
}

function updateVisualizer() {
    const bufSize = state.audio.length;
    const width = bufSize * (conf.barWidth + conf.barSpacing) - conf.barSpacing;
    let x = (state.width - width) / 2 + conf.barSpacing / 2;
    const segmentSize = bufSize / conf.eq.length;
    const bassSegment = Math.floor(bufSize / 4);

    // use previous bass intensity for shadow
    const { size, color, strength } = createShadow(state.bassIntensity);
    offscreenCtx.shadowOffsetX = 0;
    offscreenCtx.shadowOffsetY = 0;
    offscreenCtx.shadowColor = `rgb(${color} / ${strength})`;
    offscreenCtx.shadowBlur = size;
    offscreenCtx.fillStyle = `rgb(${conf.fgColor.join(" ")})`;
    offscreenCtx.globalAlpha = conf.fgOpacity;

    state.bassIntensity = 0;
    for (let i = 0; i < bufSize; i++) {
        let eqIndex = Math.floor(i / segmentSize);
        let eqFactor = conf.eq[eqIndex] || 1;
        let targetHeight = Math.max(
            state.audio[i] * conf.barHeight * eqFactor,
            0
        );

        let currentHeight = lerp(
            offscreenCtx.currentHeights
                ? offscreenCtx.currentHeights[i] || 0
                : 0,
            targetHeight,
            0.35
        );
        x += conf.barWidth + conf.barSpacing;
        if (i < bassSegment) {
            state.bassIntensity += Math.abs(state.audio[i]);
        }

        if (currentHeight > 1) {
            offscreenCtx.beginPath();
            offscreenCtx.roundRect(
                x,
                vis.height / 2 - currentHeight / 2 + conf.yOffset,
                conf.barWidth,
                currentHeight,
                conf.barRoundness
            );
            offscreenCtx.fill();
        }

        // Store the current height for the next frame
        if (!offscreenCtx.currentHeights) {
            offscreenCtx.currentHeights = new Float32Array(bufSize);
        }
        offscreenCtx.currentHeights[i] = currentHeight;
    }
    state.bassIntensity /= bassSegment;
}

function updateShadow() {
    if (!state.hasAudio) return;

    const { size, color, strength } = createShadow(state.bassIntensity);
    const shadow = `0 0 ${size}px rgb(${color} / ${strength})`;

    if (dateTime.style.textShadow !== shadow) {
        dateTime.style.textShadow = shadow;
    }
}

function transformElements(time) {
    if (!state.hasAudio) return;

    state.swingAngle = Math.min(
        Math.max(state.swingAngle, 0),
        conf.rotationFactor
    );
    let speed = 5000;
    state.swingAngle +=
        Math.sin(((time % speed) / speed) * (2 * Math.PI)) *
        (1 / state.fps) *
        ((conf.rotationFactor / Math.PI) * 2);
    wall.style.setProperty("--rotate", state.swingAngle.toFixed(3) + "deg");

    state.scale = Number(
        lerp(state.scale, 1 + state.bassIntensity * 0.15, 0.1).toFixed(3)
    );
    wall.style.setProperty("--scale", state.scale);

    if (getComputedStyle(dateTime).getPropertyValue("--scale") !== state.scale)
        dateTime.style.setProperty("--scale", state.scale);

    if (getComputedStyle(vis).getPropertyValue("--scale") !== state.scale)
        vis.style.setProperty("--scale", state.scale);
}

function draw(time) {
    requestAnimationFrame(draw);

    const now = performance.now() / 1000;
    const dt = Math.min(now - state.last, 1);
    state.last = now;

    if (state.fps > 0) {
        state.fpsThreshold += dt;
        let frameDuration = 1.0 / state.fps;
        if (state.fpsThreshold < frameDuration) {
            return;
        }
        state.fpsThreshold -= frameDuration;
    }

    offscreenCtx.clearRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
    updateVisualizer();
    transformElements(time);
    updateShadow();

    ctx.clearRect(0, 0, vis.width, vis.height);
    ctx.drawImage(offscreenCanvas, 0, 0);
}

window.wallpaperPropertyListener = {
    applyGeneralProperties: (properties) => {
        if (properties.fps) {
            state.fps = properties.fps;
        }
    },
    setPaused: (isPaused) => {
        vis.style.visibility = isPaused ? "hidden" : "visible";
    },
    applyUserProperties: listener.properties,
};

window.wallpaperRegisterAudioListener(listener.audio);

updateDate();
updateStyles();
requestAnimationFrame(draw);
setInterval(updateDate, 60000);
