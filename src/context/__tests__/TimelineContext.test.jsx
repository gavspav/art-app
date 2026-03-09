import React, { useEffect } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import { ParameterProvider } from '../ParameterContext.jsx';
import { TimelineProvider, useTimeline } from '../TimelineContext.jsx';

function TimelineProbe({ onChange }) {
  const timeline = useTimeline();

  useEffect(() => {
    onChange(timeline);
  }, [timeline, onChange]);

  return null;
}

describe('TimelineContext multi-keyframe clipboard', () => {
  let warnSpy;

  beforeEach(() => {
    window.localStorage.clear();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy?.mockRestore();
  });

  it('copies multiple keyframes and pastes them with their relative timing preserved', async () => {
    let timelineApi = null;

    render(
      <ParameterProvider>
        <TimelineProvider>
          <TimelineProbe onChange={(value) => { timelineApi = value; }} />
        </TimelineProvider>
      </ParameterProvider>,
    );

    await waitFor(() => expect(timelineApi).toBeTruthy());

    let trackA = null;
    let trackB = null;

    act(() => {
      trackA = timelineApi.addTrack('Track A', 'global:globalSpeedMultiplier', '#4fc3f7', 10, 'numeric');
      trackB = timelineApi.addTrack('Track B', 'global:globalOpacity', '#81c784', 10, 'numeric');
    });

    act(() => {
      timelineApi.addKeyframe(trackA, 1, 0.2);
      timelineApi.addKeyframe(trackA, 2, 0.8);
      timelineApi.addKeyframe(trackB, 1.5, 0.4);
    });

    let copiedSelections = [];
    await waitFor(() => {
      const trackAState = timelineApi.tracks.find((track) => track.id === trackA);
      const trackBState = timelineApi.tracks.find((track) => track.id === trackB);
      expect(trackAState?.keyframes?.some((kf) => Math.abs(kf.timeSeconds - 1) < 0.001)).toBe(true);
      expect(trackAState?.keyframes?.some((kf) => Math.abs(kf.timeSeconds - 2) < 0.001)).toBe(true);
      expect(trackBState?.keyframes?.some((kf) => Math.abs(kf.timeSeconds - 1.5) < 0.001)).toBe(true);

      copiedSelections = [
        {
          trackId: trackA,
          keyframeId: trackAState.keyframes.find((kf) => Math.abs(kf.timeSeconds - 1) < 0.001).id,
        },
        {
          trackId: trackA,
          keyframeId: trackAState.keyframes.find((kf) => Math.abs(kf.timeSeconds - 2) < 0.001).id,
        },
        {
          trackId: trackB,
          keyframeId: trackBState.keyframes.find((kf) => Math.abs(kf.timeSeconds - 1.5) < 0.001).id,
        },
      ];
      expect(copiedSelections.every((entry) => !!entry.keyframeId)).toBe(true);
    });

    act(() => {
      timelineApi.copyKeyframes(copiedSelections);
    });

    await waitFor(() => {
      expect(timelineApi.keyframeClipboard?.mode).toBe('multi');
      expect(timelineApi.keyframeClipboard?.items).toHaveLength(3);
    });

    act(() => {
      timelineApi.pasteKeyframe(null, 5);
    });

    await waitFor(() => {
      const pastedTrackA = timelineApi.tracks.find((track) => track.id === trackA);
      const pastedTrackB = timelineApi.tracks.find((track) => track.id === trackB);
      const trackATimes = pastedTrackA.keyframes.map((kf) => Number(kf.timeSeconds.toFixed(2)));
      const trackBTimes = pastedTrackB.keyframes.map((kf) => Number(kf.timeSeconds.toFixed(2)));

      expect(trackATimes).toContain(5);
      expect(trackATimes).toContain(6);
      expect(trackBTimes).toContain(5.5);
    });
  });
});
