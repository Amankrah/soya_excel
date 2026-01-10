'use client';

import { useEffect, useRef, useState } from 'react';

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  pulse: number;
  pulseSpeed: number;
}

interface Connection {
  from: Node;
  to: Node;
  progress: number;
  speed: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export function SoyaFlowAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [dimensions, setDimensions] = useState({ width: 400, height: 400 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas dimensions
    const updateDimensions = () => {
      const parent = canvas.parentElement;
      if (parent) {
        const width = parent.clientWidth;
        const height = parent.clientHeight;
        setDimensions({ width, height });
        canvas.width = width;
        canvas.height = height;
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);

    // Animation setup
    const nodes: Node[] = [];
    const connections: Connection[] = [];
    const particles: Particle[] = [];

    // Color palette - SoyaFlow brand colors
    const colors = {
      green: ['#10b981', '#34d399', '#6ee7b7', '#059669'],
      yellow: ['#fbbf24', '#fcd34d', '#fde68a', '#f59e0b'],
      white: ['#ffffff', '#f9fafb', '#e5e7eb']
    };

    // Create network nodes
    const createNodes = () => {
      const nodeCount = 8;
      const centerX = dimensions.width / 2;
      const centerY = dimensions.height / 2;

      // Center hub node
      nodes.push({
        x: centerX,
        y: centerY,
        vx: 0,
        vy: 0,
        radius: 12,
        color: colors.yellow[0],
        pulse: 0,
        pulseSpeed: 0.05
      });

      // Surrounding nodes in circular pattern
      for (let i = 0; i < nodeCount; i++) {
        const angle = (i / nodeCount) * Math.PI * 2;
        const distance = Math.min(dimensions.width, dimensions.height) * 0.3;

        nodes.push({
          x: centerX + Math.cos(angle) * distance,
          y: centerY + Math.sin(angle) * distance,
          vx: (Math.random() - 0.5) * 0.3,
          vy: (Math.random() - 0.5) * 0.3,
          radius: 6 + Math.random() * 4,
          color: i % 2 === 0 ? colors.green[Math.floor(Math.random() * 3)] : colors.yellow[Math.floor(Math.random() * 3)],
          pulse: Math.random() * Math.PI * 2,
          pulseSpeed: 0.03 + Math.random() * 0.02
        });
      }
    };

    // Create connections between nodes
    const createConnections = () => {
      const centerNode = nodes[0];

      // Connect center to all outer nodes
      for (let i = 1; i < nodes.length; i++) {
        connections.push({
          from: centerNode,
          to: nodes[i],
          progress: Math.random(),
          speed: 0.005 + Math.random() * 0.01
        });
      }

      // Connect some outer nodes to each other
      for (let i = 1; i < nodes.length; i++) {
        const nextIndex = i === nodes.length - 1 ? 1 : i + 1;
        if (Math.random() > 0.4) {
          connections.push({
            from: nodes[i],
            to: nodes[nextIndex],
            progress: Math.random(),
            speed: 0.003 + Math.random() * 0.007
          });
        }
      }
    };

    // Create flowing particles
    const createParticle = (connection: Connection) => {
      const t = connection.progress;
      const x = connection.from.x + (connection.to.x - connection.from.x) * t;
      const y = connection.from.y + (connection.to.y - connection.from.y) * t;

      particles.push({
        x,
        y,
        vx: (connection.to.x - connection.from.x) * 0.02,
        vy: (connection.to.y - connection.from.y) * 0.02,
        life: 1,
        maxLife: 1,
        color: Math.random() > 0.5 ? colors.green[1] : colors.yellow[1],
        size: 2 + Math.random() * 2
      });
    };

    createNodes();
    createConnections();

    // Animation loop
    let lastTime = performance.now();
    let particleSpawnTimer = 0;

    const animate = (currentTime: number) => {
      const deltaTime = (currentTime - lastTime) / 16.67; // Normalize to 60fps
      lastTime = currentTime;

      // Clear canvas with fade effect
      ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
      ctx.fillRect(0, 0, dimensions.width, dimensions.height);

      // Update and draw connections
      connections.forEach(connection => {
        // Update progress
        connection.progress += connection.speed * deltaTime;
        if (connection.progress >= 1) {
          connection.progress = 0;
        }

        // Draw connection line with gradient
        const gradient = ctx.createLinearGradient(
          connection.from.x,
          connection.from.y,
          connection.to.x,
          connection.to.y
        );
        gradient.addColorStop(0, 'rgba(16, 185, 129, 0.1)');
        gradient.addColorStop(0.5, 'rgba(251, 191, 36, 0.3)');
        gradient.addColorStop(1, 'rgba(16, 185, 129, 0.1)');

        ctx.strokeStyle = gradient;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(connection.from.x, connection.from.y);
        ctx.lineTo(connection.to.x, connection.to.y);
        ctx.stroke();

        // Draw flow indicator
        const flowX = connection.from.x + (connection.to.x - connection.from.x) * connection.progress;
        const flowY = connection.from.y + (connection.to.y - connection.from.y) * connection.progress;

        ctx.fillStyle = Math.random() > 0.5 ? colors.green[0] : colors.yellow[0];
        ctx.shadowBlur = 10;
        ctx.shadowColor = ctx.fillStyle;
        ctx.beginPath();
        ctx.arc(flowX, flowY, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      // Spawn particles periodically
      particleSpawnTimer += deltaTime;
      if (particleSpawnTimer > 3) {
        const randomConnection = connections[Math.floor(Math.random() * connections.length)];
        createParticle(randomConnection);
        particleSpawnTimer = 0;
      }

      // Update and draw particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const particle = particles[i];

        particle.x += particle.vx * deltaTime;
        particle.y += particle.vy * deltaTime;
        particle.life -= 0.02 * deltaTime;

        if (particle.life <= 0) {
          particles.splice(i, 1);
          continue;
        }

        const alpha = particle.life / particle.maxLife;
        ctx.fillStyle = particle.color + Math.floor(alpha * 255).toString(16).padStart(2, '0');
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size * alpha, 0, Math.PI * 2);
        ctx.fill();
      }

      // Update and draw nodes
      nodes.forEach((node, index) => {
        // Update pulse animation
        node.pulse += node.pulseSpeed * deltaTime;
        const pulseScale = 1 + Math.sin(node.pulse) * 0.3;

        // Gentle floating motion for outer nodes
        if (index > 0) {
          node.x += node.vx * deltaTime;
          node.y += node.vy * deltaTime;

          // Boundary check with smooth bounce
          const margin = node.radius * 2;
          if (node.x < margin || node.x > dimensions.width - margin) {
            node.vx *= -1;
            node.x = Math.max(margin, Math.min(dimensions.width - margin, node.x));
          }
          if (node.y < margin || node.y > dimensions.height - margin) {
            node.vy *= -1;
            node.y = Math.max(margin, Math.min(dimensions.height - margin, node.y));
          }
        }

        // Draw node glow
        const gradient = ctx.createRadialGradient(
          node.x, node.y, 0,
          node.x, node.y, node.radius * pulseScale * 3
        );
        gradient.addColorStop(0, node.color + '40');
        gradient.addColorStop(1, node.color + '00');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius * pulseScale * 3, 0, Math.PI * 2);
        ctx.fill();

        // Draw node
        ctx.fillStyle = node.color;
        ctx.shadowBlur = 15;
        ctx.shadowColor = node.color;
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius * pulseScale, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Draw inner highlight
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.beginPath();
        ctx.arc(
          node.x - node.radius * 0.3,
          node.y - node.radius * 0.3,
          node.radius * 0.4,
          0,
          Math.PI * 2
        );
        ctx.fill();
      });

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', updateDimensions);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [dimensions.width, dimensions.height]);

  return (
    <div className="relative w-full h-full min-h-[300px] lg:min-h-[400px]">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ display: 'block' }}
      />

      {/* Overlay gradient for depth */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent pointer-events-none" />

      {/* Subtle brand text overlay */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="text-center">
          <div className="text-4xl lg:text-5xl font-black tracking-tight">
            <span className="bg-gradient-to-r from-green-400 via-yellow-400 to-green-400 bg-clip-text text-transparent opacity-40">
              SoyaFlow
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
