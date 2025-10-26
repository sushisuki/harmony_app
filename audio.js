// Audio processing and pitch detection module

class AudioEngine {
    constructor() {
        this.audioContext = null;
        this.analyser = null;
        this.microphone = null;
        this.dataArray = null;
        this.bufferLength = null;
        this.recording = false;
        this.recordedChunks = [];
        this.mediaRecorder = null;
        this.recordedBlob = null;
        // Store recording context for playback with melody
        this.recordingContext = {
            pattern: null,
            tempo: null,
            key: null
        };
        // Melody analyser for dual waveform display
        this.melodyAnalyser = null;
        this.melodyDataArray = null;
        this.melodyGainNode = null;
        this.isPlayingMelody = false;
    }

    async initialize() {
        try {
            // Create audio context
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

            // Get microphone access
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: false
                }
            });

            // Create analyser
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 4096;
            this.bufferLength = this.analyser.frequencyBinCount;
            this.dataArray = new Uint8Array(this.bufferLength);
            this.floatDataArray = new Float32Array(this.analyser.fftSize);

            // Connect microphone to analyser
            this.microphone = this.audioContext.createMediaStreamSource(stream);
            this.microphone.connect(this.analyser);

            // Create melody analyser for dual waveform display
            this.melodyAnalyser = this.audioContext.createAnalyser();
            this.melodyAnalyser.fftSize = 4096;
            this.melodyDataArray = new Uint8Array(this.melodyAnalyser.frequencyBinCount);

            // Create master gain node for melody
            this.melodyGainNode = this.audioContext.createGain();
            this.melodyGainNode.connect(this.melodyAnalyser);
            this.melodyAnalyser.connect(this.audioContext.destination);

            // Setup media recorder for recording
            this.mediaRecorder = new MediaRecorder(stream);
            this.mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    this.recordedChunks.push(e.data);
                }
            };

            this.mediaRecorder.onstop = () => {
                this.recordedBlob = new Blob(this.recordedChunks, { type: 'audio/webm' });
                this.recordedChunks = [];
            };

            return true;
        } catch (error) {
            console.error('Error initializing audio:', error);
            return false;
        }
    }

    startRecording() {
        this.recordedChunks = [];
        this.mediaRecorder.start();
        this.recording = true;
    }

    stopRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
            this.recording = false;
        }
    }

    playRecording() {
        if (this.recordedBlob) {
            const audio = new Audio(URL.createObjectURL(this.recordedBlob));
            audio.play();
        }
    }

    // Play recording with melody simultaneously
    async playRecordingWithMelody() {
        if (!this.recordedBlob || !this.recordingContext.pattern) {
            // Fallback to simple playback if no melody context
            this.playRecording();
            return;
        }

        // Start recording playback
        const audio = new Audio(URL.createObjectURL(this.recordedBlob));
        audio.play();

        // Start melody playback simultaneously
        await this.playMelody(
            this.recordingContext.pattern,
            this.recordingContext.tempo,
            this.recordingContext.key
        );
    }

    // Set recording context (called when starting recording)
    setRecordingContext(pattern, tempo, key) {
        this.recordingContext = { pattern, tempo, key };
    }

    getWaveformData() {
        if (!this.analyser) return null;
        this.analyser.getByteTimeDomainData(this.dataArray);
        return this.dataArray;
    }

    getMelodyWaveformData() {
        if (!this.melodyAnalyser) return null;
        this.melodyAnalyser.getByteTimeDomainData(this.melodyDataArray);
        return this.melodyDataArray;
    }

    getFrequencyData() {
        if (!this.analyser) return null;
        this.analyser.getByteFrequencyData(this.dataArray);
        return this.dataArray;
    }

    // Autocorrelation pitch detection algorithm
    detectPitch() {
        if (!this.analyser) return null;

        this.analyser.getFloatTimeDomainData(this.floatDataArray);

        const buf = this.floatDataArray;
        const SIZE = buf.length;
        const MAX_SAMPLES = Math.floor(SIZE / 2);
        let best_offset = -1;
        let best_correlation = 0;
        let rms = 0;

        // Calculate RMS (root mean square) to detect silence
        for (let i = 0; i < SIZE; i++) {
            const val = buf[i];
            rms += val * val;
        }
        rms = Math.sqrt(rms / SIZE);

        // Ignore if too quiet
        if (rms < 0.01) return null;

        // Autocorrelation
        let lastCorrelation = 1;
        for (let offset = 1; offset < MAX_SAMPLES; offset++) {
            let correlation = 0;

            for (let i = 0; i < MAX_SAMPLES; i++) {
                correlation += Math.abs((buf[i]) - (buf[i + offset]));
            }

            correlation = 1 - (correlation / MAX_SAMPLES);

            if (correlation > 0.9 && correlation > lastCorrelation) {
                const foundGoodCorrelation = correlation > best_correlation;
                if (foundGoodCorrelation) {
                    best_correlation = correlation;
                    best_offset = offset;
                }
            }

            lastCorrelation = correlation;
        }

        if (best_correlation > 0.01 && best_offset !== -1) {
            const frequency = this.audioContext.sampleRate / best_offset;
            return frequency;
        }

        return null;
    }

    // Convert frequency to note name
    frequencyToNote(frequency) {
        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const A4 = 440;
        const C0 = A4 * Math.pow(2, -4.75);

        if (frequency < 20) return null;

        const halfSteps = 12 * Math.log2(frequency / C0);
        const octave = Math.floor(halfSteps / 12);
        const noteIndex = Math.round(halfSteps % 12);

        return {
            note: noteNames[noteIndex],
            octave: octave,
            frequency: frequency,
            cents: Math.round((halfSteps % 1) * 100)
        };
    }

    // Generate a simple melody
    async playMelody(notes, tempo = 120, key = 'C') {
        const noteToFrequency = (note, octave, key = 'C') => {
            const keyOffsets = {
                'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11
            };
            const baseFreq = 440; // A4
            const A4Note = 57; // A4 is note number 57 (C0 = 12)

            const offset = keyOffsets[key] || 0;
            const noteValue = note + (octave * 12) + offset;
            const halfSteps = noteValue - A4Note;

            return baseFreq * Math.pow(2, halfSteps / 12);
        };

        const beatDuration = 60 / tempo;

        this.isPlayingMelody = true;

        for (let i = 0; i < notes.length; i++) {
            const { note, octave, duration } = notes[i];

            if (note === 'rest') {
                await this.sleep(beatDuration * duration * 1000);
                continue;
            }

            const frequency = noteToFrequency(note, octave, key);
            await this.playTone(frequency, beatDuration * duration);
        }

        this.isPlayingMelody = false;
    }

    async playTone(frequency, duration) {
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        oscillator.connect(gainNode);
        // Connect to melody gain node for dual waveform display
        gainNode.connect(this.melodyGainNode);

        oscillator.frequency.value = frequency;
        oscillator.type = 'sine';

        // Envelope
        const now = this.audioContext.currentTime;
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.3, now + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + duration);

        oscillator.start(now);
        oscillator.stop(now + duration);

        await this.sleep(duration * 1000);
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Get harmony interval
    getHarmonyFrequency(baseFrequency, harmonyType) {
        const intervals = {
            'third': Math.pow(2, 4/12),        // Major third up
            'third-down': Math.pow(2, -4/12),   // Major third down
            'fifth': Math.pow(2, 7/12),         // Perfect fifth up
            'octave': 2                          // Octave up
        };

        return baseFrequency * (intervals[harmonyType] || 1);
    }

    // Play chord
    async playChord(frequencies, duration) {
        const oscillators = [];
        const gainNodes = [];

        const now = this.audioContext.currentTime;

        frequencies.forEach(freq => {
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();

            oscillator.connect(gainNode);
            // Connect to melody gain node for dual waveform display
            gainNode.connect(this.melodyGainNode);

            oscillator.frequency.value = freq;
            oscillator.type = 'sine';

            gainNode.gain.setValueAtTime(0, now);
            gainNode.gain.linearRampToValueAtTime(0.2, now + 0.01);
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + duration);

            oscillator.start(now);
            oscillator.stop(now + duration);

            oscillators.push(oscillator);
            gainNodes.push(gainNode);
        });

        await this.sleep(duration * 1000);
    }
}

// Practice patterns
const PRACTICE_PATTERNS = {
    scale: [
        { note: 0, octave: 4, duration: 0.5 },  // C
        { note: 2, octave: 4, duration: 0.5 },  // D
        { note: 4, octave: 4, duration: 0.5 },  // E
        { note: 5, octave: 4, duration: 0.5 },  // F
        { note: 7, octave: 4, duration: 0.5 },  // G
        { note: 9, octave: 4, duration: 0.5 },  // A
        { note: 11, octave: 4, duration: 0.5 }, // B
        { note: 0, octave: 5, duration: 1.0 }   // C
    ],
    arpeggio: [
        { note: 0, octave: 4, duration: 0.5 },  // C
        { note: 4, octave: 4, duration: 0.5 },  // E
        { note: 7, octave: 4, duration: 0.5 },  // G
        { note: 0, octave: 5, duration: 0.5 },  // C
        { note: 7, octave: 4, duration: 0.5 },  // G
        { note: 4, octave: 4, duration: 0.5 },  // E
        { note: 0, octave: 4, duration: 1.0 }   // C
    ],
    simple: [
        { note: 0, octave: 4, duration: 1 },    // C
        { note: 0, octave: 4, duration: 1 },    // C
        { note: 7, octave: 4, duration: 1 },    // G
        { note: 7, octave: 4, duration: 1 },    // G
        { note: 9, octave: 4, duration: 1 },    // A
        { note: 9, octave: 4, duration: 1 },    // A
        { note: 7, octave: 4, duration: 2 }     // G
    ],
    chord: [
        { note: 0, octave: 4, duration: 2 },    // C
        { note: 5, octave: 4, duration: 2 },    // F
        { note: 7, octave: 4, duration: 2 },    // G
        { note: 0, octave: 4, duration: 2 }     // C
    ]
};
