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
    zoomFactor: 0.25,
    rotationFactor: 6,
    rotationSpeedMs: 5000,
    barCount: 100,
    barMaxHeight: 600,
    barSpacing: 3,
    yOffset: 0,
    barThickness: 12,
    barRoundness: 14,
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
    audio: [],
    lastTime: 0,
    hasAudio: false,
    lastSwingAngle: 0,
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
        state.audio = new Array(conf.barCount).fill(0);
        for (let i = 0; i < conf.barCount; i++) {
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
    const barWidth = conf.barThickness;
    const spacing = conf.barSpacing;
    const totalBarsWidth = conf.barCount * (barWidth + spacing) - spacing;
    let x = (state.width - totalBarsWidth) / 2 + spacing / 2;
    state.bassIntensity = 0;
    state.hasAudio = false;
    const segmentSize = conf.barCount / 8;
    const maxHeight = conf.barMaxHeight;

    for (let i = 0; i < conf.barCount; i++) {
        let eqIndex = Math.floor(i / segmentSize) + 1;
        let eqFactor = equalizerSettings[`band${eqIndex}`] || 1;
        let targetHeight = Math.max(state.audio[i] * maxHeight * eqFactor, 0);

        let currentHeight = lerp(
            offscreenCtx.currentHeights
                ? offscreenCtx.currentHeights[i] || 0
                : 0,
            targetHeight,
            0.35,
        );
        x += barWidth + spacing;
        if (i < conf.barCount / 4) {
            state.bassIntensity += Math.abs(state.audio[i]);
        }

        if (currentHeight > 1) {
            state.hasAudio = true;
            offscreenCtx.fillStyle = `rgb(${conf.fgColor.join(" ")})`;
            offscreenCtx.globalAlpha = conf.fgOpacity;
            const intensity = Math.abs(state.audio[i]);
            const { size, color, strength } = createShadow(intensity);
            offscreenCtx.shadowColor = `rgb(${color} / ${strength})`;
            offscreenCtx.shadowOffsetX = 0;
            offscreenCtx.shadowOffsetY = 0;
            offscreenCtx.shadowBlur = size;

            offscreenCtx.beginPath();
            offscreenCtx.roundRect(
                x,
                vis.height / 2 - currentHeight / 2 + conf.yOffset,
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
    }
    state.bassIntensity /= conf.barCount / 4;
}

function updateShadow() {
    const { size, color, strength } = createShadow(state.bassIntensity);
    const shadow = `0 0 ${size}px rgb(${color} / ${strength})`;

    if (dateTime.style.textShadow !== shadow) {
        dateTime.style.textShadow = shadow;
    }
}

function updateStyles() {
    vis.width = state.width;
    vis.height = state.height;
    wall.style.backgroundImage =
        conf.bg === "" ? null : `url('file:///${conf.bg}')`;
    wall.style.setProperty(`--y`, conf.bgOffsetY + `px`);
    dateTime.style.color = `rgb(${conf.fgColor.join(" ")} / ${conf.fgOpacity})`;
}

function transformElements(time) {
    var scale = state.scale;
    if (state.bassIntensity > 0.01) {
        scale +=
            (1 + state.bassIntensity * conf.zoomFactor - state.scale) * 0.1;
    } else {
        scale = 1;
    }

    if (state.hasAudio) {
        state.lastTime = time;
        if (state.lastSwingAngle < 0) {
            state.lastSwingAngle = 0;
        } else if (state.lastSwingAngle > conf.rotationFactor) {
            state.lastSwingAngle = conf.rotationFactor;
        }

        state.lastSwingAngle +=
            Math.sin(
                ((time % conf.rotationSpeedMs) / conf.rotationSpeedMs) *
                    (2 * Math.PI),
            ) *
            (1 / state.fps) *
            ((conf.rotationFactor / Math.PI) * 2);
    }

    if (!state.hasAudio || state.lastSwingAngle == 0) return;

    if (scale > 1) {
        wall.style.setProperty("--rotate", state.lastSwingAngle + "deg");
        wall.style.setProperty("--scale", scale);
        state.scale = scale;
    }

    if (getComputedStyle(dateTime).getPropertyValue("--scale") !== scale) {
        dateTime.style.setProperty("--scale", scale);
    }

    if (getComputedStyle(vis).getPropertyValue("--scale") !== scale) {
        vis.style.setProperty("--scale", scale);
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
