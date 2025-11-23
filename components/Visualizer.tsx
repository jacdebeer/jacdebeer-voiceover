
import React, { useEffect, useRef } from 'react';

interface VisualizerProps {
  analyser: AnalyserNode | null;
  isPlaying: boolean;
}

export const Visualizer: React.FC<VisualizerProps> = ({ analyser, isPlaying }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Optimize for visual aesthetics: fewer bins for wider bars
    analyser.fftSize = 64; // 32 frequency bins
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    // Handle HiDPI displays
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const draw = () => {
      ctx.clearRect(0, 0, rect.width, rect.height);
      const centerY = rect.height / 2;

      if (!isPlaying) {
        // Draw a subtle center line when idle
        ctx.beginPath();
        ctx.moveTo(0, centerY);
        ctx.lineTo(rect.width, centerY);
        ctx.strokeStyle = 'rgba(129, 140, 248, 0.2)'; // Indigo-400 low opacity
        ctx.lineWidth = 2;
        ctx.stroke();
        return;
      }

      animationRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      // Render settings
      // Use a subset of bins if needed, or all
      const bars = bufferLength; 
      const gap = (rect.width / bars) * 0.4; // 40% gap
      const barWidth = (rect.width / bars) - gap;
      
      let x = gap / 2;

      for (let i = 0; i < bars; i++) {
        const value = dataArray[i];
        const percent = value / 255;
        
        // Dynamic height with a minimum to show activity
        const height = Math.max(4, rect.height * percent * 0.8);

        // Create gradient
        const gradient = ctx.createLinearGradient(0, centerY - height/2, 0, centerY + height/2);
        gradient.addColorStop(0, '#818cf8'); // Indigo-400
        gradient.addColorStop(0.5, '#c084fc'); // Purple-400
        gradient.addColorStop(1, '#818cf8'); // Indigo-400

        ctx.fillStyle = gradient;

        // Draw rounded bar centered vertically
        const y = centerY - height / 2;
        const radius = barWidth / 2;

        ctx.beginPath();
        
        // Check for roundRect support (modern browsers)
        if (typeof ctx.roundRect === 'function') {
             ctx.roundRect(x, y, barWidth, height, radius);
        } else {
             // Fallback to simple rect
             ctx.rect(x, y, barWidth, height);
        }
        ctx.fill();

        x += barWidth + gap;
      }
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [analyser, isPlaying]);

  return (
    <canvas 
      ref={canvasRef} 
      className="w-full h-full block"
    />
  );
};
