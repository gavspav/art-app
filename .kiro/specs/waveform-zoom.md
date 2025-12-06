## TODO
1. Inspect TimelineWaveform render logic and dependencies for visibility tied to pixelsPerSecond/width.
2. Verify timeline width/height calculations in TimelinePanel, especially scrollLeft/zoom > 1.
3. Check canvas sizing/resolution, devicePixelRatio scaling, and peaks sampling at high zoom.
4. Reproduce disappearance: load audio, zoom above 100%, see conditions that short-circuit drawing.
5. Fix: ensure canvas width/height match timelineWidth and scrollLeft; avoid capping; handle peaks index bounds.
6. Improve rendering quality at high zoom (scale for devicePixelRatio and clamp).
7. Test at low and high zoom (>100%, ~4000%) for visibility and clarity.
