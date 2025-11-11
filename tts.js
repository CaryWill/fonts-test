// ============ TTS 功能 ============
async function initTTS() {
    const frontElement = document.getElementById("front");
    const exampleElement = document.getElementById("example");
    const container = document.getElementById("button-container");

    const frontText = frontElement.textContent.trim();
    const exampleText = exampleElement?.textContent.trim() || "";
    const currentCardText = frontText;

    if (!frontText) {
        const error = document.createElement("span");
        error.textContent = "Error: No text found";
        container.appendChild(error);
        return;
    }

    // 全局音频管理器
    if (!window.ankiAudioManager) {
        window.ankiAudioManager = {
            currentAudio: null,
            currentCardText: null,
            stopAll: function () {
                if (this.currentAudio) {
                    this.currentAudio.pause();
                    this.currentAudio.currentTime = 0;
                    this.currentAudio = null;
                }
                this.currentCardText = null;
            }
        };
    }

    // 检测卡片内容是否变化
    if (window.ankiAudioManager.currentCardText !== currentCardText) {
        console.log("Card text changed, stopping previous audio");
        window.ankiAudioManager.stopAll();
        window.ankiAudioManager.currentCardText = currentCardText;
    }

    // 生成唯一标识符用于跟踪当前卡片
    const cardId = `card-${Date.now()}-${Math.random()}`;
    if (!container.dataset.cardId) {
        container.dataset.cardId = cardId;
    }

    const url = "https://deprecatedapis.tts.quest/v2/voicevox/audio/?key=t127g0112270q_0&speaker=2&pitch=0&intonationScale=1&speed=1&text=" + encodeURIComponent(frontText + ' \n ' + exampleText);

    // 检查是否是当前卡片
    function isCurrentCard() {
        const currentFront = document.getElementById("front")?.textContent.trim();
        return currentFront === currentCardText && container.dataset.cardId === cardId;
    }

    async function fetchWavBlob() {
        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed to fetch audio");
        return await res.blob();
    }

    async function decodeWavBlob(blob) {
        const buf = await blob.arrayBuffer();
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        return await audioCtx.decodeAudioData(buf);
    }

    function floatTo16BitPCM(float32Array) {
        const int16Array = new Int16Array(float32Array.length);
        for (let i = 0; i < float32Array.length; i++) {
            let s = Math.max(-1, Math.min(1, float32Array[i]));
            int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        return int16Array;
    }

    function audioBufferToMp3(audioBuffer) {
        const numChannels = audioBuffer.numberOfChannels;
        const sampleRate = audioBuffer.sampleRate;
        const mp3encoder = new lamejs.Mp3Encoder(numChannels, sampleRate, 128);
        const mp3Data = [];
        const samplesPerFrame = 1152;

        if (numChannels === 1) {
            const data = floatTo16BitPCM(audioBuffer.getChannelData(0));
            for (let i = 0; i < data.length; i += samplesPerFrame) {
                const chunk = data.subarray(i, i + Math.min(samplesPerFrame, data.length - i));
                const mp3buf = mp3encoder.encodeBuffer(chunk);
                if (mp3buf.length > 0) mp3Data.push(mp3buf);
            }
        } else {
            const left = floatTo16BitPCM(audioBuffer.getChannelData(0));
            const right = floatTo16BitPCM(audioBuffer.getChannelData(1));
            for (let i = 0; i < left.length; i += samplesPerFrame) {
                const leftChunk = left.subarray(i, i + Math.min(samplesPerFrame, left.length - i));
                const rightChunk = right.subarray(i, i + Math.min(samplesPerFrame, right.length - i));
                const mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
                if (mp3buf.length > 0) mp3Data.push(mp3buf);
            }
        }

        const end = mp3encoder.flush();
        if (end.length > 0) mp3Data.push(end);
        return new Blob(mp3Data, { type: 'audio/mpeg' });
    }

    const loading = document.createElement("div");
    loading.textContent = "";
    container.appendChild(loading);

    try {
        const wavBlob = await fetchWavBlob();

        if (!isCurrentCard()) {
            console.log("Card changed during fetch, aborting");
            loading.remove();
            return;
        }

        const audioBuffer = await decodeWavBlob(wavBlob);

        if (!isCurrentCard()) {
            console.log("Card changed during decode, aborting");
            loading.remove();
            return;
        }

        const mp3Blob = audioBufferToMp3(audioBuffer);

        if (!isCurrentCard()) {
            console.log("Card changed during conversion, aborting");
            loading.remove();
            return;
        }

        loading.remove();

        const audio = document.createElement("audio");
        audio.controls = true;
        audio.style.marginTop = "10px";
        audio.style.display = "none";
        audio.src = URL.createObjectURL(mp3Blob);
        audio.addEventListener("click", (e) => e.stopPropagation());

        audio.addEventListener("play", () => {
            if (!isCurrentCard()) {
                audio.pause();
                audio.currentTime = 0;
                return;
            }
            window.ankiAudioManager.currentAudio = audio;
        });

        audio.addEventListener("playing", () => {
            if (!isCurrentCard()) {
                audio.pause();
                audio.currentTime = 0;
            }
        });

        container.appendChild(audio);

        const playBtn = document.createElement("button");
        playBtn.textContent = "播放";
        playBtn.setAttribute("style", "user-select: none; -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; -webkit-touch-callout: none; display: inline-block;");
        playBtn.setAttribute("unselectable", "on");
        playBtn.onselectstart = () => false;

        container.appendChild(playBtn);

        const playAudio = () => {
            if (!isCurrentCard()) {
                console.log("Card changed, not playing");
                return;
            }
            window.ankiAudioManager.stopAll();
            audio.currentTime = 0;
            audio.play();
            window.ankiAudioManager.currentAudio = audio;
            window.ankiAudioManager.currentCardText = currentCardText;
        };

        playBtn.addEventListener("click", playAudio);

        playBtn.addEventListener("dblclick", () => {
            audio.pause();
            audio.currentTime = 0;
            if (window.ankiAudioManager.currentAudio === audio) {
                window.ankiAudioManager.currentAudio = null;
            }
        });

        // 默认播放
        if (!frontText.includes(',"') && isCurrentCard()) {
            playAudio();
        }
    } catch (err) {
        loading.textContent = "";
        console.error("Error:", err);
    }
}

window.initTTS = initTTS;