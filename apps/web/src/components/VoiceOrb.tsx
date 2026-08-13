"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

type VoiceOrbProps = {
  recording: boolean;
  onClick: () => void;
};

function MicIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="voice-orb-mic"
    >
      <rect
        x="8"
        y="3"
        width="8"
        height="12"
        rx="4"
      />

      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
      <path d="M9 21h6" />
    </svg>
  );
}

export default function VoiceOrb({
  recording,
  onClick,
}: VoiceOrbProps) {
  const POINT_COUNT = 42;

  const [waveform, setWaveform] =
    useState<number[]>(
      Array(POINT_COUNT).fill(0),
    );

  const [speaking, setSpeaking] =
    useState(false);

  const streamRef =
    useRef<MediaStream | null>(null);

  const audioContextRef =
    useRef<AudioContext | null>(null);

  const analyserRef =
    useRef<AnalyserNode | null>(null);

  const animationFrameRef =
    useRef<number | null>(null);

  useEffect(() => {
    if (!recording) {
      stopAudioAnalysis();

      setSpeaking(false);

      setWaveform(
        Array(POINT_COUNT).fill(0),
      );

      return;
    }

    void startAudioAnalysis();

    return () => {
      stopAudioAnalysis();
    };
  }, [recording]);

  async function startAudioAnalysis() {
    stopAudioAnalysis();

    try {
      const stream =
        await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

      streamRef.current = stream;

      const audioContext =
        new AudioContext();

      audioContextRef.current =
        audioContext;

      if (
        audioContext.state ===
        "suspended"
      ) {
        await audioContext.resume();
      }

      const source =
        audioContext.createMediaStreamSource(
          stream,
        );

      const analyser =
        audioContext.createAnalyser();

      analyser.fftSize = 256;

      analyser.smoothingTimeConstant =
        0.65;

      analyserRef.current =
        analyser;

      source.connect(analyser);

      const samples =
        new Uint8Array(
          analyser.fftSize,
        );

      function update() {
        analyser.getByteTimeDomainData(
          samples,
        );

        let squareSum = 0;

        for (
          let i = 0;
          i < samples.length;
          i += 1
        ) {
          const normalized =
            (samples[i] - 128) /
            128;

          squareSum +=
            normalized *
            normalized;
        }

        const rms =
          Math.sqrt(
            squareSum /
              samples.length,
          );

        /*
         * Below this threshold,
         * the learner is considered silent.
         *
         * Recording remains active,
         * but the visual becomes a
         * perfectly straight line.
         */
        const isSpeaking =
          rms > 0.028;

        setSpeaking(isSpeaking);

        if (!isSpeaking) {
          setWaveform(
            Array(
              POINT_COUNT,
            ).fill(0),
          );
        } else {
          const nextWave =
            Array.from(
              {
                length:
                  POINT_COUNT,
              },
              (_, index) => {
                const sourceIndex =
                  Math.floor(
                    (index /
                      (POINT_COUNT -
                        1)) *
                      (samples.length -
                        1),
                  );

                const sample =
                  (samples[
                    sourceIndex
                  ] -
                    128) /
                  128;

                /*
                 * Amplify real voice motion
                 * without making the wave
                 * visually chaotic.
                 */
                return Math.max(
                  -1,
                  Math.min(
                    1,
                    sample * 2.7,
                  ),
                );
              },
            );

          setWaveform(
            nextWave,
          );
        }

        animationFrameRef.current =
          requestAnimationFrame(
            update,
          );
      }

      update();
    } catch (error) {
      console.error(
        "Microphone access failed:",
        error,
      );

      setSpeaking(false);

      setWaveform(
        Array(POINT_COUNT).fill(0),
      );
    }
  }

  function stopAudioAnalysis() {
    if (
      animationFrameRef.current !==
      null
    ) {
      cancelAnimationFrame(
        animationFrameRef.current,
      );

      animationFrameRef.current =
        null;
    }

    streamRef.current
      ?.getTracks()
      .forEach((track) => {
        track.stop();
      });

    streamRef.current = null;

    if (
      audioContextRef.current &&
      audioContextRef.current.state !==
        "closed"
    ) {
      void audioContextRef.current.close();
    }

    audioContextRef.current =
      null;

    analyserRef.current =
      null;
  }

  const width = 76;
  const height = 34;
  const middle = height / 2;

  const points =
    waveform
      .map(
        (value, index) => {
          const x =
            (index /
              (waveform.length -
                1)) *
            width;

          /*
           * Silence:
           * every value is 0,
           * therefore every y is the
           * exact vertical midpoint.
           */
          const y =
            middle -
            value * 12;

          return `${x},${y}`;
        },
      )
      .join(" ");

  return (
    <button
      className={[
        "voice-orb",
        recording
          ? "recording"
          : "idle",
        speaking
          ? "speaking"
          : "silent",
      ].join(" ")}
      onClick={onClick}
      aria-label={
        recording
          ? "Stop voice answer"
          : "Start voice answer"
      }
    >
      <span className="voice-orb-inner" />

      {/*
       * BEFORE CLICK:
       * microphone only.
       */}
      {!recording && (
        <MicIcon />
      )}

      {/*
       * AFTER CLICK:
       *
       * silence -> straight line
       * speech  -> live waveform
       */}
      {recording && (
        <svg
          className="orb-wave"
          viewBox={`0 0 ${width} ${height}`}
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
