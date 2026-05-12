import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Lipsync hook - drives viseme animation from audio using server-provided timings
 *
 * @param {Object} params
 * @param {React.RefObject<HTMLAudioElement>} params.audioRef - Reference to audio element
 * @param {Array<{t: number, id: number}>} params.visemes - Server-provided viseme timings
 * @returns {Object} { current: number } - Current viseme ID (0-20)
 */
export function useLipsync({ audioRef, visemes }) {
  const [current, setCurrent] = useState(0);
  const rafRef = useRef();
  const currentIndexRef = useRef(0);

  // Sort visemes by timestamp for efficient lookup
  const schedule = useMemo(
    () => (visemes ?? []).slice().sort((a, b) => a.t - b.t),
    [visemes]
  );

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      console.log('🎭 No audio element');
      return;
    }

    // If we have server-provided visemes, use them
    if (schedule.length > 0) {
      console.log('🎭 Using server-provided visemes:', schedule.length);
      console.log('🎭 First few visemes:', schedule.slice(0, 5));

      const tick = () => {
        const t = audio.currentTime;

        // Find the current viseme based on audio time
        let foundViseme = false;
        for (let i = currentIndexRef.current; i < schedule.length; i++) {
          if (schedule[i].t <= t) {
            if (i === schedule.length - 1 || schedule[i + 1].t > t) {
              // This is the current viseme
              if (currentIndexRef.current !== i) {
                console.log(`🎭 Viseme ${i}: id=${schedule[i].id} at t=${t.toFixed(2)}s`);
                setCurrent(schedule[i].id);
                currentIndexRef.current = i;
                foundViseme = true;
              }
              break;
            }
          }
        }

        // If audio is playing but we haven't found any viseme yet, start from beginning
        if (!foundViseme && t > 0 && t < 0.1) {
          console.log('🎭 Resetting to first viseme');
          currentIndexRef.current = 0;
          if (schedule[0]) {
            setCurrent(schedule[0].id);
          }
        }

        // Continue animation loop while audio is playing
        if (!audio.paused && !audio.ended) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          // Audio stopped - return to neutral
          setCurrent(0);
        }
      };

      // Start animation loop
      rafRef.current = requestAnimationFrame(tick);

      // Reset index when audio plays from beginning
      const handlePlay = () => {
        console.log('🎭 Audio play detected - resetting viseme index');
        currentIndexRef.current = 0;
        setCurrent(0);
        rafRef.current = requestAnimationFrame(tick);
      };

      // Stop animation when audio ends
      const handleEnded = () => {
        console.log('🎭 Audio ended - returning to neutral face');
        setCurrent(0);
        currentIndexRef.current = 0;
      };

      audio.addEventListener('play', handlePlay);
      audio.addEventListener('ended', handleEnded);

      return () => {
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
        }
        audio.removeEventListener('play', handlePlay);
        audio.removeEventListener('ended', handleEnded);
      };
    }

    // No visemes - show neutral face
    console.log('🎭 No server visemes - showing neutral face');
    setCurrent(0);

  }, [audioRef, schedule]);

  return { current };
}

export default useLipsync;
