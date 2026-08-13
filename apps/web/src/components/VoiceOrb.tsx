"use client";

import { useEffect, useRef, useState } from "react";

type VoiceOrbProps = {
  disabled?: boolean;

  onRecordingComplete: (audio: Blob) => void | Promise<void>;

  onError?: (message: string) => void;
};

const WAVE_POINT_COUNT = 42;

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="voice-orb-mic">
      <rect x="8" y="3" width="8" height="12" rx="4" />

      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
      <path d="M9 21h6" />
    </svg>
  );
}

export default function VoiceOrb({
  disabled = false,
  onRecordingComplete,
  onError,
}: VoiceOrbProps) {
  const [recording, setRecording] = useState(false);

  const [speaking, setSpeaking] = useState(false);

  const [waveform, setWaveform] = useState<number[]>(
    Array(WAVE_POINT_COUNT).fill(0),
  );

  const streamRef = useRef<MediaStream | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);

  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  const analyserRef = useRef<AnalyserNode | null>(null);

  const processorRef = useRef<ScriptProcessorNode | null>(null);

  const silentGainRef = useRef<GainNode | null>(null);

  const frameRef = useRef<number | null>(null);

  const chunksRef = useRef<Float32Array[]>([]);

  const sampleRateRef = useRef(44100);

  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;

      cleanupAudio();
    };
  }, []);

  async function handleClick() {
    if (disabled) {
      return;
    }

    if (!recording) {
      await beginRecording();

      return;
    }

    await finishRecording();
  }

  async function beginRecording() {
    try {
      chunksRef.current = [];

      setWaveform(Array(WAVE_POINT_COUNT).fill(0));

      setSpeaking(false);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,

          noiseSuppression: true,

          autoGainControl: true,

          channelCount: 1,
        },
      });

      const audioContext = new AudioContext();

      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      streamRef.current = stream;

      audioContextRef.current = audioContext;

      sampleRateRef.current = audioContext.sampleRate;

      const source = audioContext.createMediaStreamSource(stream);

      sourceRef.current = source;

      const analyser = audioContext.createAnalyser();

      analyser.fftSize = 256;

      analyser.smoothingTimeConstant = 0.55;

      analyserRef.current = analyser;

      source.connect(analyser);

      /*
       * ScriptProcessor is used here deliberately
       * because it allows us to capture the actual
       * PCM samples synchronously in the browser.
       *
       * Those PCM samples are encoded into a genuine
       * mono 16-bit WAV when the learner stops.
       */
      const processor = audioContext.createScriptProcessor(4096, 1, 1);

      processorRef.current = processor;

      const silentGain = audioContext.createGain();

      silentGain.gain.value = 0;

      silentGainRef.current = silentGain;

      source.connect(processor);

      processor.connect(silentGain);

      silentGain.connect(audioContext.destination);

      processor.onaudioprocess = (event) => {
        const input = event.inputBuffer.getChannelData(0);

        chunksRef.current.push(new Float32Array(input));
      };

      if (mountedRef.current) {
        setRecording(true);
      }

      startWaveformLoop(analyser);
    } catch (error) {
      console.error("Unable to start microphone:", error);

      cleanupAudio();

      setRecording(false);

      setSpeaking(false);

      onError?.(
        "Microphone access failed. Check your browser microphone permission and try again.",
      );
    }
  }

  function startWaveformLoop(analyser: AnalyserNode) {
    const timeData = new Uint8Array(analyser.fftSize);

    function update() {
      analyser.getByteTimeDomainData(timeData);

      let squareSum = 0;

      for (let index = 0; index < timeData.length; index += 1) {
        const normalized = (timeData[index] - 128) / 128;

        squareSum += normalized * normalized;
      }

      const rms = Math.sqrt(squareSum / timeData.length);

      /*
       * Recording + silence:
       * perfectly straight line.
       *
       * Recording + actual speech:
       * live waveform.
       */
      const currentlySpeaking = rms > 0.025;

      if (mountedRef.current) {
        setSpeaking(currentlySpeaking);

        if (!currentlySpeaking) {
          setWaveform(Array(WAVE_POINT_COUNT).fill(0));
        } else {
          const next = Array.from(
            {
              length: WAVE_POINT_COUNT,
            },
            (_, index) => {
              const sourceIndex = Math.floor(
                (index / (WAVE_POINT_COUNT - 1)) * (timeData.length - 1),
              );

              const sample = (timeData[sourceIndex] - 128) / 128;

              return Math.max(-1, Math.min(1, sample * 2.8));
            },
          );

          setWaveform(next);
        }
      }

      frameRef.current = requestAnimationFrame(update);
    }

    update();
  }

  async function finishRecording() {
    const chunks = chunksRef.current;

    const sampleRate = sampleRateRef.current;

    setRecording(false);

    setSpeaking(false);

    setWaveform(Array(WAVE_POINT_COUNT).fill(0));

    cleanupAudio();

    if (chunks.length === 0) {
      onError?.("No audio was captured. Please try answering again.");

      return;
    }

    const audio = encodeMonoWav(chunks, sampleRate);

    if (audio.size > 20 * 1024 * 1024) {
      onError?.(
        "This voice answer is too long. Please record a shorter response.",
      );

      return;
    }

    try {
      await onRecordingComplete(audio);
    } catch (error) {
      console.error(error);
    }
  }

  function cleanupAudio() {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);

      frameRef.current = null;
    }

    if (processorRef.current) {
      processorRef.current.onaudioprocess = null;

      try {
        processorRef.current.disconnect();
      } catch {}

      processorRef.current = null;
    }

    if (analyserRef.current) {
      try {
        analyserRef.current.disconnect();
      } catch {}

      analyserRef.current = null;
    }

    if (sourceRef.current) {
      try {
        sourceRef.current.disconnect();
      } catch {}

      sourceRef.current = null;
    }

    if (silentGainRef.current) {
      try {
        silentGainRef.current.disconnect();
      } catch {}

      silentGainRef.current = null;
    }

    streamRef.current?.getTracks().forEach((track) => {
      track.stop();
    });

    streamRef.current = null;

    const context = audioContextRef.current;

    audioContextRef.current = null;

    if (context && context.state !== "closed") {
      void context.close();
    }
  }

  const waveWidth = 76;

  const waveHeight = 34;

  const middle = waveHeight / 2;

  const points = waveform
    .map((value, index) => {
      const x = (index / (waveform.length - 1)) * waveWidth;

      const y = middle - value * 12;

      return `${x},${y}`;
    })
    .join(" ");

  return (
    <button
      type="button"
      disabled={disabled}
      className={[
        "voice-orb",

        recording ? "recording" : "idle",

        recording && speaking ? "speaking" : "silent",

        disabled ? "disabled" : "",
      ].join(" ")}
      onClick={handleClick}
      aria-label={recording ? "Stop voice answer" : "Start voice answer"}
    >
      <span className="voice-orb-inner" />

      {!recording && <MicIcon />}

      {recording && (
        <svg
          className="orb-wave"
          viewBox={`0 0 ${waveWidth} ${waveHeight}`}
          aria-hidden="true"
        >
          <polyline
            points={points}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}

function encodeMonoWav(chunks: Float32Array[], sampleRate: number): Blob {
  let sampleCount = 0;

  for (const chunk of chunks) {
    sampleCount += chunk.length;
  }

  const buffer = new ArrayBuffer(44 + sampleCount * 2);

  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");

  view.setUint32(4, 36 + sampleCount * 2, true);

  writeAscii(view, 8, "WAVE");

  writeAscii(view, 12, "fmt ");

  view.setUint32(16, 16, true);

  view.setUint16(20, 1, true);

  view.setUint16(22, 1, true);

  view.setUint32(24, sampleRate, true);

  view.setUint32(28, sampleRate * 2, true);

  view.setUint16(32, 2, true);

  view.setUint16(34, 16, true);

  writeAscii(view, 36, "data");

  view.setUint32(40, sampleCount * 2, true);

  let offset = 44;

  for (const chunk of chunks) {
    for (let index = 0; index < chunk.length; index += 1) {
      const sample = Math.max(-1, Math.min(1, chunk[index]));

      view.setInt16(
        offset,
        sample < 0 ? sample * 0x8000 : sample * 0x7fff,
        true,
      );

      offset += 2;
    }
  }

  return new Blob([buffer], {
    type: "audio/wav",
  });
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}
