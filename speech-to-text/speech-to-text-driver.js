const sdk = require('microsoft-cognitiveservices-speech-sdk');
const path = require('path');
const fs = require('fs');

class SpeechToTextDriver {
    #node;
    #key;
    #region;

    constructor(node, key, region) {
        this.#node = node;
        this.#key = key;
        this.#region = region;
        this.INPUT_MODE  = {
            file: 'file',
            payload: 'payload',
        };
        this.OUTPUT_MODE = {
            file: 'file',
            payload: 'payload',
        };
    }

    checkOutputMode({ outputMode, textFilePath }) {
        // Check output mode = file restriction
        if (outputMode === this.OUTPUT_MODE.file) {
            if (!textFilePath || !path.isAbsolute(textFilePath)) throw new Error('Text file path must be a string of an absolute path to local file system');
            if (!path.extname(textFilePath)) throw new Error('Text file path must contain a valid file name with extension');
        }
    }

    createSpeechConfig() {
        return sdk.SpeechConfig.fromSubscription(this.#key, this.#region);
    }

    createAudioConfigFromStream(pushStream) {
        return sdk.AudioConfig.fromStreamInput(pushStream);
    }

    createAudioConfigFromWav(audioData) {
        // audioData is an instance of Buffer
        return sdk.AudioConfig.fromWavFileInput(audioData);
    }

    createSpeechRecognizerFromStream(audioData) {
        const speechConfig = this.createSpeechConfig();
        const pushStream = sdk.AudioInputStream.createPushStream();
        pushStream.write(audioData);
        pushStream.close();
        const audioConfig = this.createAudioConfigFromStream(pushStream);
        return new sdk.SpeechRecognizer(speechConfig, audioConfig)
    }

    createSpeechRecognizerFromWav(audioData) {
        const speechConfig = this.createSpeechConfig();
        const audioConfig = this.createAudioConfigFromWav(audioData);
        return new sdk.SpeechRecognizer(speechConfig, audioConfig);
    }

    async performStt({ outputMode, textFilePath, recognizer }) {
        return new Promise((resolve, reject) => {
            recognizer.recognizeOnceAsync(result => {
                const { reason, errorDetails, text } = result;
                recognizer.close();

                if (reason !== sdk.ResultReason.RecognizedSpeech) reject(`SST is cancelled with ${errorDetails}`);

                if (outputMode === this.OUTPUT_MODE.file) {
                    // Write file to textFilePath
                    fs.writeFileSync(textFilePath, text);
                    resolve('STT succeeded');
                } else resolve({ text });
            }, (err) => {
                this.#node.warn(err);
                recognizer.close();
                reject(err);
            });
        });
    }

    async SttFromPayload(options) {
        this.checkOutputMode(options);
        if (!options.audioData) throw new Error('msg.payload must not be empty if input mode is "payload"');
        let formattedAudioData = options.audioData;
        // Check binary format
        if (!(formattedAudioData instanceof ArrayBuffer) && !(formattedAudioData instanceof Buffer)) throw new Error('msg.payload must be an instance of either ArrayBuffer or Buffer(NodeJS) class');

        const recognizer = this.createSpeechRecognizerFromStream(formattedAudioData);
        return this.performStt({ ...options, recognizer });
    }

    async SttFromFile(options) {
        this.checkOutputMode(options);
        if (!options.audioFilePath || !path.isAbsolute(options.audioFilePath)) throw new Error('Audio file path must be a string of an absolute path to local file system');
        // Read files as Buffer
        const audioData = fs.readFileSync(options.audioFilePath);
        if (audioData.length === 0) throw new Error('The audio file provided is empty, recognition aborted');
        const recognizer = this.createSpeechRecognizerFromWav(audioData);
        return this.performStt({ ...options, recognizer });
    }

    async run(options) {
        try {
            if (options.inputMode === this.INPUT_MODE.payload) {
                return await this.SttFromPayload(options);
            }
            return await this.SttFromFile(options);
        } catch (e) {
            throw e;
        }
    }
}

module.exports = SpeechToTextDriver;