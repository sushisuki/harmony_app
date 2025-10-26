// Main application logic

let audioEngine = null;
let isInitialized = false;
let currentPattern = 'simple';
let isPlaying = false;

// Canvas elements
let pitchCanvas, pitchCtx;
let waveformCanvas, waveformCtx;

// UI elements
let playMelodyBtn, startRecordingBtn, stopRecordingBtn, playbackBtn;
let harmonyModeSelect, tempoSlider, tempoValue, keySelect;
let noteDisplay, frequencyDisplay, feedbackMessage, accuracyValue;

// Pitch tracking
let pitchHistory = [];
let targetPitchHistory = [];
const HISTORY_LENGTH = 100;

// Initialize on page load
window.addEventListener('DOMContentLoaded', async () => {
    initializeUI();
    await initializeAudio();
    startVisualization();
});

function initializeUI() {
    // Get canvas elements
    pitchCanvas = document.getElementById('pitchCanvas');
    pitchCtx = pitchCanvas.getContext('2d');
    waveformCanvas = document.getElementById('waveformCanvas');
    waveformCtx = waveformCanvas.getContext('2d');

    // Get UI elements
    playMelodyBtn = document.getElementById('playMelody');
    startRecordingBtn = document.getElementById('startRecording');
    stopRecordingBtn = document.getElementById('stopRecording');
    playbackBtn = document.getElementById('playback');
    harmonyModeSelect = document.getElementById('harmonyMode');
    tempoSlider = document.getElementById('tempo');
    tempoValue = document.getElementById('tempoValue');
    keySelect = document.getElementById('keySelect');
    noteDisplay = document.getElementById('noteDisplay');
    frequencyDisplay = document.getElementById('frequencyDisplay');
    feedbackMessage = document.getElementById('feedbackMessage');
    accuracyValue = document.getElementById('accuracyValue');

    // Add event listeners
    playMelodyBtn.addEventListener('click', playMelody);
    startRecordingBtn.addEventListener('click', startRecording);
    stopRecordingBtn.addEventListener('click', stopRecording);
    playbackBtn.addEventListener('click', playback);

    tempoSlider.addEventListener('input', (e) => {
        tempoValue.textContent = e.target.value;
    });

    // Pattern buttons
    document.querySelectorAll('.btn-pattern').forEach(btn => {
        btn.addEventListener('click', (e) => {
            currentPattern = e.target.dataset.pattern;
            showFeedback(`練習パターン: ${getPatternName(currentPattern)}`, 'info');
        });
    });
}

async function initializeAudio() {
    try {
        audioEngine = new AudioEngine();
        const success = await audioEngine.initialize();

        if (success) {
            isInitialized = true;
            showFeedback('マイクの準備ができました！', 'success');
        } else {
            showFeedback('マイクの初期化に失敗しました', 'warning');
        }
    } catch (error) {
        console.error('Audio initialization error:', error);
        showFeedback('マイクへのアクセスが必要です', 'warning');
    }
}

async function playMelody() {
    if (!isInitialized || isPlaying) return;

    isPlaying = true;
    playMelodyBtn.disabled = true;
    const tempo = parseInt(tempoSlider.value);
    const key = keySelect.value;
    const pattern = PRACTICE_PATTERNS[currentPattern];

    showFeedback(`メロディ再生中... (${getPatternName(currentPattern)})`, 'info');

    try {
        await audioEngine.playMelody(pattern, tempo, key);
        showFeedback('メロディ再生完了！ハモリに挑戦してみましょう', 'success');
    } catch (error) {
        console.error('Melody playback error:', error);
        showFeedback('再生エラーが発生しました', 'warning');
    }

    isPlaying = false;
    playMelodyBtn.disabled = false;
}

async function startRecording() {
    if (!isInitialized) {
        showFeedback('マイクの初期化が必要です', 'warning');
        return;
    }

    if (isPlaying) {
        showFeedback('メロディ再生中は録音できません', 'warning');
        return;
    }

    const tempo = parseInt(tempoSlider.value);
    const key = keySelect.value;
    const pattern = PRACTICE_PATTERNS[currentPattern];

    // Save recording context for playback
    audioEngine.setRecordingContext(pattern, tempo, key);

    // Start recording
    audioEngine.startRecording();
    startRecordingBtn.disabled = true;
    stopRecordingBtn.disabled = false;
    playbackBtn.disabled = true;
    playMelodyBtn.disabled = true;
    document.body.classList.add('recording');

    pitchHistory = [];
    targetPitchHistory = [];

    showFeedback(`録音開始！メロディと一緒にハモリを歌ってください (${getPatternName(currentPattern)})`, 'info');

    // Play melody automatically during recording
    isPlaying = true;
    try {
        await audioEngine.playMelody(pattern, tempo, key);
    } catch (error) {
        console.error('Melody playback error:', error);
    }
    isPlaying = false;

    // Auto-stop recording after melody finishes (if still recording)
    if (audioEngine.recording) {
        showFeedback('メロディ終了！録音を停止してください', 'info');
    }
}

function stopRecording() {
    audioEngine.stopRecording();
    startRecordingBtn.disabled = false;
    stopRecordingBtn.disabled = true;
    playbackBtn.disabled = false;
    playMelodyBtn.disabled = false;
    document.body.classList.remove('recording');

    calculateAccuracy();
    showFeedback('録音完了！再生ボタンでメロディと一緒に確認できます', 'success');
}

async function playback() {
    if (!audioEngine.recordedBlob) {
        showFeedback('録音データがありません', 'warning');
        return;
    }

    if (isPlaying) {
        showFeedback('再生中です', 'warning');
        return;
    }

    isPlaying = true;
    playbackBtn.disabled = true;
    startRecordingBtn.disabled = true;
    playMelodyBtn.disabled = true;

    showFeedback('録音とメロディを再生中...', 'info');

    try {
        await audioEngine.playRecordingWithMelody();
        showFeedback('再生完了！', 'success');
    } catch (error) {
        console.error('Playback error:', error);
        showFeedback('再生エラーが発生しました', 'warning');
    }

    isPlaying = false;
    playbackBtn.disabled = false;
    startRecordingBtn.disabled = false;
    playMelodyBtn.disabled = false;
}

function startVisualization() {
    requestAnimationFrame(updateVisualization);
}

function updateVisualization() {
    if (isInitialized && audioEngine) {
        drawWaveform();
        drawPitchDisplay();
        updatePitchInfo();
    }

    requestAnimationFrame(updateVisualization);
}

function drawWaveform() {
    const voiceData = audioEngine.getWaveformData();
    const melodyData = audioEngine.getMelodyWaveformData();
    if (!voiceData) return;

    const width = waveformCanvas.width;
    const height = waveformCanvas.height;

    // Clear canvas
    waveformCtx.fillStyle = '#f0f0f0';
    waveformCtx.fillRect(0, 0, width, height);

    // Draw center line
    waveformCtx.strokeStyle = '#ddd';
    waveformCtx.lineWidth = 1;
    waveformCtx.beginPath();
    waveformCtx.moveTo(0, height / 2);
    waveformCtx.lineTo(width, height / 2);
    waveformCtx.stroke();

    // Draw melody waveform (green) if playing
    if (melodyData && audioEngine.isPlayingMelody) {
        waveformCtx.lineWidth = 2;
        waveformCtx.strokeStyle = '#2ecc71';
        waveformCtx.globalAlpha = 0.7;
        waveformCtx.beginPath();

        const sliceWidth = width / melodyData.length;
        let x = 0;

        for (let i = 0; i < melodyData.length; i++) {
            const v = melodyData[i] / 128.0;
            const y = v * height / 2;

            if (i === 0) {
                waveformCtx.moveTo(x, y);
            } else {
                waveformCtx.lineTo(x, y);
            }

            x += sliceWidth;
        }

        waveformCtx.lineTo(width, height / 2);
        waveformCtx.stroke();
        waveformCtx.globalAlpha = 1.0;
    }

    // Draw voice waveform (blue)
    waveformCtx.lineWidth = 2;
    waveformCtx.strokeStyle = '#667eea';
    waveformCtx.beginPath();

    const sliceWidth = width / voiceData.length;
    let x = 0;

    for (let i = 0; i < voiceData.length; i++) {
        const v = voiceData[i] / 128.0;
        const y = v * height / 2;

        if (i === 0) {
            waveformCtx.moveTo(x, y);
        } else {
            waveformCtx.lineTo(x, y);
        }

        x += sliceWidth;
    }

    waveformCtx.lineTo(width, height / 2);
    waveformCtx.stroke();
}

function drawPitchDisplay() {
    const width = pitchCanvas.width;
    const height = pitchCanvas.height;

    pitchCtx.fillStyle = '#f0f0f0';
    pitchCtx.fillRect(0, 0, width, height);

    // Draw grid lines
    pitchCtx.strokeStyle = '#ddd';
    pitchCtx.lineWidth = 1;

    for (let i = 0; i <= 10; i++) {
        const y = (height / 10) * i;
        pitchCtx.beginPath();
        pitchCtx.moveTo(0, y);
        pitchCtx.lineTo(width, y);
        pitchCtx.stroke();
    }

    // Draw pitch history
    if (pitchHistory.length > 1) {
        pitchCtx.strokeStyle = '#667eea';
        pitchCtx.lineWidth = 3;
        pitchCtx.beginPath();

        const xStep = width / HISTORY_LENGTH;

        for (let i = 0; i < pitchHistory.length; i++) {
            const x = i * xStep;
            // Map frequency to canvas height (100Hz to 1000Hz range)
            const freq = pitchHistory[i];
            const y = height - ((freq - 100) / 900 * height);

            if (i === 0) {
                pitchCtx.moveTo(x, y);
            } else {
                pitchCtx.lineTo(x, y);
            }
        }

        pitchCtx.stroke();
    }

    // Draw target pitch if recording
    if (audioEngine.recording && targetPitchHistory.length > 1) {
        pitchCtx.strokeStyle = '#2ecc71';
        pitchCtx.lineWidth = 2;
        pitchCtx.setLineDash([5, 5]);
        pitchCtx.beginPath();

        const xStep = width / HISTORY_LENGTH;

        for (let i = 0; i < targetPitchHistory.length; i++) {
            const x = i * xStep;
            const freq = targetPitchHistory[i];
            const y = height - ((freq - 100) / 900 * height);

            if (i === 0) {
                pitchCtx.moveTo(x, y);
            } else {
                pitchCtx.lineTo(x, y);
            }
        }

        pitchCtx.stroke();
        pitchCtx.setLineDash([]);
    }
}

function updatePitchInfo() {
    const frequency = audioEngine.detectPitch();

    if (frequency) {
        const noteInfo = audioEngine.frequencyToNote(frequency);

        if (noteInfo) {
            noteDisplay.textContent = `${noteInfo.note}${noteInfo.octave}`;
            frequencyDisplay.textContent = `${frequency.toFixed(1)} Hz`;

            // Add to history
            pitchHistory.push(frequency);
            if (pitchHistory.length > HISTORY_LENGTH) {
                pitchHistory.shift();
            }

            // Calculate target harmony pitch if recording
            if (audioEngine.recording) {
                const harmonyMode = harmonyModeSelect.value;
                const targetFreq = audioEngine.getHarmonyFrequency(frequency, harmonyMode);
                targetPitchHistory.push(targetFreq);
                if (targetPitchHistory.length > HISTORY_LENGTH) {
                    targetPitchHistory.shift();
                }
            }

            // Visual feedback for pitch accuracy
            if (noteInfo.cents > -20 && noteInfo.cents < 20) {
                noteDisplay.style.color = '#2ecc71'; // Green for good pitch
            } else {
                noteDisplay.style.color = '#667eea'; // Blue for off pitch
            }
        }
    } else {
        noteDisplay.textContent = '-';
        frequencyDisplay.textContent = '0 Hz';
        noteDisplay.style.color = '#667eea';
    }
}

function calculateAccuracy() {
    if (pitchHistory.length === 0 || targetPitchHistory.length === 0) {
        accuracyValue.textContent = '-';
        return;
    }

    let totalError = 0;
    let count = 0;
    const minLength = Math.min(pitchHistory.length, targetPitchHistory.length);

    for (let i = 0; i < minLength; i++) {
        const error = Math.abs(pitchHistory[i] - targetPitchHistory[i]);
        const percentError = (error / targetPitchHistory[i]) * 100;
        totalError += percentError;
        count++;
    }

    const avgError = totalError / count;
    const accuracy = Math.max(0, 100 - avgError);

    accuracyValue.textContent = `${accuracy.toFixed(1)}%`;

    if (accuracy > 90) {
        showFeedback('素晴らしい！完璧なハモリです！', 'success');
    } else if (accuracy > 70) {
        showFeedback('良い感じです！もう少し練習しましょう', 'success');
    } else {
        showFeedback('練習を続けましょう。少しずつ上達します', 'info');
    }
}

function showFeedback(message, type) {
    feedbackMessage.textContent = message;
    feedbackMessage.className = `feedback-message ${type}`;
}

function getPatternName(pattern) {
    const names = {
        'scale': '音階練習',
        'arpeggio': 'アルペジオ',
        'simple': 'シンプルメロディ',
        'chord': 'コード進行'
    };
    return names[pattern] || pattern;
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !isPlaying) {
        e.preventDefault();
        if (!audioEngine.recording) {
            startRecording();
        } else {
            stopRecording();
        }
    } else if (e.code === 'KeyP' && !isPlaying) {
        e.preventDefault();
        playMelody();
    }
});
