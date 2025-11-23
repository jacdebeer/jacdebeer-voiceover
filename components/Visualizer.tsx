import React, { useEffect, useRef } from 'react';

interface VisualizerProps {
  analyser: AnalyserNode | null;
  isPlaying: boolean;
}

export const Visualizer: React.FC<VisualizerProps> = ({ analyser, isPlaying }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    // Set canvas dimensions
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const draw = () => {
      if (!isPlaying) {
        ctx.clearRect(0, 0, rect.width, rect.height);
        // Draw a flat line when idle
        ctx.beginPath();
        ctx.moveTo(0, rect.height / 2);
        ctx.lineTo(rect.width, rect.height / 2);
        ctx.strokeStyle = '#e2e8f0'; // slate-200
        ctx.lineWidth = 2;
        ctx.stroke();
        return;
      }

      animationRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, rect.width, rect.height);
      
      const barWidth = (rect.width / bufferLength) * 2.5;
      let barHeight;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        barHeight = (dataArray[i] / 255) * rect.height;

        // Gradient color
        const gradient = ctx.createLinearGradient(0, rect.height - barHeight, 0, rect.height);
        gradient.addColorStop(0, '#6366f1'); // Indigo-500
        gradient.addColorStop(1, '#a855f7'); // Purple-500

        ctx.fillStyle = gradient;
        
        // Draw rounded bars
        const radius = 2;
        if (barHeight > 0) {
            ctx.beginPath();
            ctx.roundRect(x, rect.height - barHeight, barWidth, barHeight, radius);
            ctx.fill();
        }

        x += barWidth + 1;
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
      className="w-full h-16 rounded-md"
    />
  );
};