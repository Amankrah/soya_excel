// 'use client';

// import { useEffect, useRef, useState } from 'react';

// interface Node {
//   x: number;
//   y: number;
//   vx: number;
//   vy: number;
//   radius: number;
//   color: string;
//   pulse: number;
//   pulseSpeed: number;
// }

// interface Connection {
//   from: Node;
//   to: Node;
//   progress: number;
//   speed: number;
// }

// interface Particle {
//   x: number;
//   y: number;
//   vx: number;
//   vy: number;
//   life: number;
//   maxLife: number;
//   color: string;
//   size: number;
// }

// export function SoyaFlowAnimation() {
//   const canvasRef = useRef<HTMLCanvasElement>(null);
//   const animationFrameRef = useRef<number | null>(null);
//   const [dimensions, setDimensions] = useState({ width: 400, height: 400 });

//   useEffect(() => {
//     const canvas = canvasRef.current;
//     if (!canvas) return;

//     const ctx = canvas.getContext('2d');
//     if (!ctx) return;

//     // Set canvas dimensions
//     const updateDimensions = () => {
//       const parent = canvas.parentElement;
//       if (parent) {
//         const width = parent.clientWidth;
//         const height = parent.clientHeight;
//         setDimensions({ width, height });
//         canvas.width = width;
//         canvas.height = height;
//       }
//     };

//     updateDimensions();
//     window.addEventListener('resize', updateDimensions);

//     // Animation setup
//     const nodes: Node[] = [];
//     const connections: Connection[] = [];
//     const particles: Particle[] = [];

//     // Color palette - SoyaFlow brand colors
//     const colors = {
//       green: ['#10b981', '#34d399', '#6ee7b7', '#059669'],
//       yellow: ['#fbbf24', '#fcd34d', '#fde68a', '#f59e0b'],
//       white: ['#ffffff', '#f9fafb', '#e5e7eb']
//     };

//     // Create network nodes
//     const createNodes = () => {
//       const nodeCount = 8;
//       const centerX = dimensions.width / 2;
//       const centerY = dimensions.height / 2;

//       // Center hub node
//       nodes.push({
//         x: centerX,
//         y: centerY,
//         vx: 0,
//         vy: 0,
//         radius: 12,
//         color: colors.yellow[0],
//         pulse: 0,
//         pulseSpeed: 0.05
//       });

//       // Surrounding nodes in circular pattern
//       for (let i = 0; i < nodeCount; i++) {
//         const angle = (i / nodeCount) * Math.PI * 2;
//         const distance = Math.min(dimensions.width, dimensions.height) * 0.3;

//         nodes.push({
//           x: centerX + Math.cos(angle) * distance,
//           y: centerY + Math.sin(angle) * distance,
//           vx: (Math.random() - 0.5) * 0.3,
//           vy: (Math.random() - 0.5) * 0.3,
//           radius: 6 + Math.random() * 4,
//           color: i % 2 === 0 ? colors.green[Math.floor(Math.random() * 3)] : colors.yellow[Math.floor(Math.random() * 3)],
//           pulse: Math.random() * Math.PI * 2,
//           pulseSpeed: 0.03 + Math.random() * 0.02
//         });
//       }
//     };

//     // Create connections between nodes
//     const createConnections = () => {
//       const centerNode = nodes[0];

//       // Connect center to all outer nodes
//       for (let i = 1; i < nodes.length; i++) {
//         connections.push({
//           from: centerNode,
//           to: nodes[i],
//           progress: Math.random(),
//           speed: 0.005 + Math.random() * 0.01
//         });
//       }

//       // Connect some outer nodes to each other
//       for (let i = 1; i < nodes.length; i++) {
//         const nextIndex = i === nodes.length - 1 ? 1 : i + 1;
//         if (Math.random() > 0.4) {
//           connections.push({
//             from: nodes[i],
//             to: nodes[nextIndex],
//             progress: Math.random(),
//             speed: 0.003 + Math.random() * 0.007
//           });
//         }
//       }
//     };

//     // Create flowing particles
//     const createParticle = (connection: Connection) => {
//       const t = connection.progress;
//       const x = connection.from.x + (connection.to.x - connection.from.x) * t;
//       const y = connection.from.y + (connection.to.y - connection.from.y) * t;

//       particles.push({
//         x,
//         y,
//         vx: (connection.to.x - connection.from.x) * 0.02,
//         vy: (connection.to.y - connection.from.y) * 0.02,
//         life: 1,
//         maxLife: 1,
//         color: Math.random() > 0.5 ? colors.green[1] : colors.yellow[1],
//         size: 2 + Math.random() * 2
//       });
//     };

//     createNodes();
//     createConnections();

//     // Animation loop
//     let lastTime = performance.now();
//     let particleSpawnTimer = 0;

//     const animate = (currentTime: number) => {
//       const deltaTime = (currentTime - lastTime) / 16.67; // Normalize to 60fps
//       lastTime = currentTime;

//       // Clear canvas with fade effect
//       ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
//       ctx.fillRect(0, 0, dimensions.width, dimensions.height);

//       // Update and draw connections
//       connections.forEach(connection => {
//         // Update progress
//         connection.progress += connection.speed * deltaTime;
//         if (connection.progress >= 1) {
//           connection.progress = 0;
//         }

//         // Draw connection line with gradient
//         const gradient = ctx.createLinearGradient(
//           connection.from.x,
//           connection.from.y,
//           connection.to.x,
//           connection.to.y
//         );
//         gradient.addColorStop(0, 'rgba(16, 185, 129, 0.1)');
//         gradient.addColorStop(0.5, 'rgba(251, 191, 36, 0.3)');
//         gradient.addColorStop(1, 'rgba(16, 185, 129, 0.1)');

//         ctx.strokeStyle = gradient;
//         ctx.lineWidth = 1;
//         ctx.beginPath();
//         ctx.moveTo(connection.from.x, connection.from.y);
//         ctx.lineTo(connection.to.x, connection.to.y);
//         ctx.stroke();

//         // Draw flow indicator
//         const flowX = connection.from.x + (connection.to.x - connection.from.x) * connection.progress;
//         const flowY = connection.from.y + (connection.to.y - connection.from.y) * connection.progress;

//         ctx.fillStyle = Math.random() > 0.5 ? colors.green[0] : colors.yellow[0];
//         ctx.shadowBlur = 10;
//         ctx.shadowColor = ctx.fillStyle;
//         ctx.beginPath();
//         ctx.arc(flowX, flowY, 3, 0, Math.PI * 2);
//         ctx.fill();
//         ctx.shadowBlur = 0;
//       });

//       // Spawn particles periodically
//       particleSpawnTimer += deltaTime;
//       if (particleSpawnTimer > 3) {
//         const randomConnection = connections[Math.floor(Math.random() * connections.length)];
//         createParticle(randomConnection);
//         particleSpawnTimer = 0;
//       }

//       // Update and draw particles
//       for (let i = particles.length - 1; i >= 0; i--) {
//         const particle = particles[i];

//         particle.x += particle.vx * deltaTime;
//         particle.y += particle.vy * deltaTime;
//         particle.life -= 0.02 * deltaTime;

//         if (particle.life <= 0) {
//           particles.splice(i, 1);
//           continue;
//         }

//         const alpha = particle.life / particle.maxLife;
//         ctx.fillStyle = particle.color + Math.floor(alpha * 255).toString(16).padStart(2, '0');
//         ctx.beginPath();
//         ctx.arc(particle.x, particle.y, particle.size * alpha, 0, Math.PI * 2);
//         ctx.fill();
//       }

//       // Update and draw nodes
//       nodes.forEach((node, index) => {
//         // Update pulse animation
//         node.pulse += node.pulseSpeed * deltaTime;
//         const pulseScale = 1 + Math.sin(node.pulse) * 0.3;

//         // Gentle floating motion for outer nodes
//         if (index > 0) {
//           node.x += node.vx * deltaTime;
//           node.y += node.vy * deltaTime;

//           // Boundary check with smooth bounce
//           const margin = node.radius * 2;
//           if (node.x < margin || node.x > dimensions.width - margin) {
//             node.vx *= -1;
//             node.x = Math.max(margin, Math.min(dimensions.width - margin, node.x));
//           }
//           if (node.y < margin || node.y > dimensions.height - margin) {
//             node.vy *= -1;
//             node.y = Math.max(margin, Math.min(dimensions.height - margin, node.y));
//           }
//         }

//         // Draw node glow
//         const gradient = ctx.createRadialGradient(
//           node.x, node.y, 0,
//           node.x, node.y, node.radius * pulseScale * 3
//         );
//         gradient.addColorStop(0, node.color + '40');
//         gradient.addColorStop(1, node.color + '00');

//         ctx.fillStyle = gradient;
//         ctx.beginPath();
//         ctx.arc(node.x, node.y, node.radius * pulseScale * 3, 0, Math.PI * 2);
//         ctx.fill();

//         // Draw node
//         ctx.fillStyle = node.color;
//         ctx.shadowBlur = 15;
//         ctx.shadowColor = node.color;
//         ctx.beginPath();
//         ctx.arc(node.x, node.y, node.radius * pulseScale, 0, Math.PI * 2);
//         ctx.fill();
//         ctx.shadowBlur = 0;

//         // Draw inner highlight
//         ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
//         ctx.beginPath();
//         ctx.arc(
//           node.x - node.radius * 0.3,
//           node.y - node.radius * 0.3,
//           node.radius * 0.4,
//           0,
//           Math.PI * 2
//         );
//         ctx.fill();
//       });

//       animationFrameRef.current = requestAnimationFrame(animate);
//     };

//     animationFrameRef.current = requestAnimationFrame(animate);

//     return () => {
//       window.removeEventListener('resize', updateDimensions);
//       if (animationFrameRef.current) {
//         cancelAnimationFrame(animationFrameRef.current);
//       }
//     };
//   }, [dimensions.width, dimensions.height]);

//   return (
//     <div className="relative w-full h-full min-h-[300px] lg:min-h-[400px]">
//       <canvas
//         ref={canvasRef}
//         className="w-full h-full"
//         style={{ display: 'block' }}
//       />

//       {/* Overlay gradient for depth */}
//       <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent pointer-events-none" />

//       {/* Subtle brand text overlay */}
//       <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
//         <div className="text-center">
//           <div className="text-4xl lg:text-5xl font-black tracking-tight">
//             <span className="bg-gradient-to-r from-green-400 via-yellow-400 to-green-400 bg-clip-text text-transparent opacity-40">
//               SoyaFlow
//             </span>
//           </div>
//         </div>
//       </div>
//     </div>
//   );
// }


'use client';

import { useEffect, useRef, useCallback } from 'react';

// ============================================================================
// TYPES
// ============================================================================

interface Vec2 {
  x: number;
  y: number;
}

type NodeRole = 'control' | 'distribution' | 'endpoint';

interface Node {
  id: string;
  role: NodeRole;
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  radius: number;
  color: string;
  glowColor: string;
  pulseIntensity: number;
  pulseDecay: number;
  label?: string;
}

interface Route {
  id: string;
  fromId: string;
  toId: string;
  direction: 'outbound' | 'return';
  controlPoint: Vec2;
  activeGlow: number;
  glowDecay: number;
}

interface Shipment {
  id: number;
  routeId: string;
  progress: number;
  speed: number;
  color: string;
  size: number;
  trail: Vec2[];
}

interface ScheduledDispatch {
  routeId: string;
  delay: number;
}

interface AnimationState {
  nodes: Map<string, Node>;
  routes: Route[];
  shipments: Shipment[];
  dispatchQueue: ScheduledDispatch[];
  time: number;
  width: number;
  height: number;
  shipmentCounter: number;
}

// ============================================================================
// CONFIGURATION - Logistics-First Design
// ============================================================================

const CONFIG = {
  // Timing - "Control decision every 2-3s, one delivery every 1-2s"
  dispatchInterval: { min: 2000, max: 3000 },
  shipmentDuration: { min: 1800, max: 2800 },
  
  // Visual hierarchy - "Lower contrast than headline, enterprise-clean"
  opacity: {
    routeInactive: 0.12,
    routeActive: 0.35,
    nodeGlowIdle: 0.08,
    nodeGlowActive: 0.25,
    shipmentTrail: 0.5,
  },
  
  // Node sizes by role - slightly larger for clarity
  nodeRadius: {
    control: 18,
    distribution: 11,
    endpoint: 7,
  },
  
  // Colors - Semantic meaning (2-3 active colors max)
  colors: {
    control: '#fbbf24',        // Yellow - decision/optimization
    controlGlow: '#f59e0b',
    distribution: '#10b981',   // Green - feed movement
    distributionGlow: '#059669',
    endpoint: '#34d399',       // Light green - destinations
    endpointGlow: '#10b981',
    outboundFlow: '#22c55e',   // Bright green - active shipment
    returnFlow: '#fcd34d',     // Dim yellow - feedback signal
    routeIdle: '#134e4a',      // Muted teal - capacity exists
    routeActive: '#059669',    // Active route glow
  },
  
  // Motion - "Eased acceleration/deceleration, dwell time at nodes"
  shipmentEasing: {
    accelerationZone: 0.12,    // First 12% - accelerating from stop
    cruiseZone: 0.76,          // Middle - constant velocity
    decelerationZone: 0.12,    // Last 12% - "slowing for unload"
  },
  
  // Trails - shorter, cleaner
  trailLength: 8,
  
  // Pulse durations (ms)
  controlPulseDuration: 400,
  deliveryPulseDuration: 350,
  routeGlowFadeDuration: 800,
} as const;

// ============================================================================
// UTILITIES
// ============================================================================

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

// Shipment easing - slows before arrival (reads as "unloading/confirmation")
const shipmentEase = (t: number): number => {
  const { accelerationZone, decelerationZone } = CONFIG.shipmentEasing;
  const cruiseStart = accelerationZone;
  const cruiseEnd = 1 - decelerationZone;
  
  if (t < cruiseStart) {
    // Ease out (accelerating from stop)
    const localT = t / cruiseStart;
    return cruiseStart * (1 - Math.pow(1 - localT, 2));
  } else if (t > cruiseEnd) {
    // Ease in (decelerating to stop)
    const localT = (t - cruiseEnd) / decelerationZone;
    return cruiseEnd + decelerationZone * Math.pow(localT, 2);
  } else {
    // Linear cruise
    return t;
  }
};

const quadraticBezier = (p0: Vec2, p1: Vec2, p2: Vec2, t: number): Vec2 => ({
  x: (1 - t) ** 2 * p0.x + 2 * (1 - t) * t * p1.x + t ** 2 * p2.x,
  y: (1 - t) ** 2 * p0.y + 2 * (1 - t) * t * p1.y + t ** 2 * p2.y,
});

const hexToRgba = (hex: string, alpha: number): string => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const randomRange = (min: number, max: number): number => 
  Math.random() * (max - min) + min;

// ============================================================================
// TOPOLOGY - "Geographic distribution logic without explicit geography"
// ============================================================================

const createTopology = (width: number, height: number): { 
  nodes: Map<string, Node>; 
  routes: Route[];
} => {
  const nodes = new Map<string, Node>();
  const routes: Route[] = [];
  
  // Shift entire network to the right to avoid text overlay
  const offsetX = width * 0.08; // Right shift amount (reduced)
  
  const cx = width * 0.40 + offsetX; // Control tower - slightly right of center
  const cy = height * 0.5;
  
  // === CONTROL TOWER (Center-right, visible area) ===
  // "Emits outbound routing pulses"
  nodes.set('control', {
    id: 'control',
    role: 'control',
    x: cx,
    y: cy,
    baseX: cx,
    baseY: cy,
    radius: CONFIG.nodeRadius.control,
    color: CONFIG.colors.control,
    glowColor: CONFIG.colors.controlGlow,
    pulseIntensity: 0,
    pulseDecay: 0.015,
    label: 'HQ',
  });
  
  // === DISTRIBUTION NODES (Mid-field) ===
  // "Warehouses, mills, hubs - stable positions, multiple routes"
  // Using loose east-west spread, slight clustering
  const distributionPositions = [
    { x: width * 0.54 + offsetX, y: height * 0.22, id: 'dist-north' },
    { x: width * 0.60 + offsetX, y: height * 0.50, id: 'dist-central' },
    { x: width * 0.52 + offsetX, y: height * 0.78, id: 'dist-south' },
  ];
  
  distributionPositions.forEach(pos => {
    nodes.set(pos.id, {
      id: pos.id,
      role: 'distribution',
      x: Math.min(pos.x, width * 0.92), // Clamp to canvas
      y: pos.y,
      baseX: Math.min(pos.x, width * 0.92),
      baseY: pos.y,
      radius: CONFIG.nodeRadius.distribution,
      color: CONFIG.colors.distribution,
      glowColor: CONFIG.colors.distributionGlow,
      pulseIntensity: 0,
      pulseDecay: 0.02,
    });
  });
  
  // === ENDPOINTS (Edges) ===
  // "Buyers, farms, feedlots - smaller, react on delivery"
  const endpointPositions = [
    // Northern cluster
    { x: width * 0.75 + offsetX, y: height * 0.12, id: 'end-n1', hub: 'dist-north' },
    { x: width * 0.85 + offsetX * 0.5, y: height * 0.25, id: 'end-n2', hub: 'dist-north' },
    // Central cluster  
    { x: width * 0.78 + offsetX, y: height * 0.42, id: 'end-c1', hub: 'dist-central' },
    { x: width * 0.88 + offsetX * 0.3, y: height * 0.55, id: 'end-c2', hub: 'dist-central' },
    { x: width * 0.82 + offsetX * 0.5, y: height * 0.68, id: 'end-c3', hub: 'dist-central' },
    // Southern cluster
    { x: width * 0.72 + offsetX, y: height * 0.85, id: 'end-s1', hub: 'dist-south' },
    { x: width * 0.85 + offsetX * 0.5, y: height * 0.92, id: 'end-s2', hub: 'dist-south' },
  ];
  
  endpointPositions.forEach(pos => {
    nodes.set(pos.id, {
      id: pos.id,
      role: 'endpoint',
      x: pos.x,
      y: pos.y,
      baseX: pos.x,
      baseY: pos.y,
      radius: CONFIG.nodeRadius.endpoint,
      color: CONFIG.colors.endpoint,
      glowColor: CONFIG.colors.endpointGlow,
      pulseIntensity: 0,
      pulseDecay: 0.025,
    });
  });
  
  // === ROUTES ===
  // "Shipping lanes, not neural pathways"
  
  // Control → Distribution (primary outbound)
  distributionPositions.forEach(dist => {
    const control = nodes.get('control')!;
    const distNode = nodes.get(dist.id)!;
    
    // Curved control point for organic feel
    const midX = (control.x + distNode.x) / 2;
    const midY = (control.y + distNode.y) / 2;
    const perpX = -(distNode.y - control.y) * 0.15;
    const perpY = (distNode.x - control.x) * 0.15;
    
    routes.push({
      id: `control-${dist.id}`,
      fromId: 'control',
      toId: dist.id,
      direction: 'outbound',
      controlPoint: { x: midX + perpX, y: midY + perpY },
      activeGlow: 0,
      glowDecay: 0.01,
    });
  });
  
  // Distribution → Endpoints (delivery routes)
  endpointPositions.forEach(end => {
    const distNode = nodes.get(end.hub)!;
    const endNode = nodes.get(end.id)!;
    
    const midX = (distNode.x + endNode.x) / 2;
    const midY = (distNode.y + endNode.y) / 2;
    const perpX = -(endNode.y - distNode.y) * 0.2;
    const perpY = (endNode.x - distNode.x) * 0.2;
    
    routes.push({
      id: `${end.hub}-${end.id}`,
      fromId: end.hub,
      toId: end.id,
      direction: 'outbound',
      controlPoint: { x: midX + perpX, y: midY + perpY },
      activeGlow: 0,
      glowDecay: 0.012,
    });
  });
  
  // Endpoint → Control (feedback/return - fewer, slower)
  // "Tracking/feedback loop"
  ['end-c1', 'end-n2', 'end-s1'].forEach(endId => {
    const endNode = nodes.get(endId)!;
    const control = nodes.get('control')!;
    
    const midX = (endNode.x + control.x) / 2;
    const midY = (endNode.y + control.y) / 2;
    
    routes.push({
      id: `return-${endId}`,
      fromId: endId,
      toId: 'control',
      direction: 'return',
      controlPoint: { x: midX, y: midY - 30 },
      activeGlow: 0,
      glowDecay: 0.008,
    });
  });
  
  return { nodes, routes };
};

// ============================================================================
// DISPATCH SYSTEM - "Controlled throughput"
// ============================================================================

const scheduleNextDispatch = (state: AnimationState): void => {
  const delay = randomRange(CONFIG.dispatchInterval.min, CONFIG.dispatchInterval.max);
  
  // Weight toward outbound routes (80% outbound, 20% return)
  const outboundRoutes = state.routes.filter(r => r.direction === 'outbound');
  const returnRoutes = state.routes.filter(r => r.direction === 'return');
  
  const useReturn = Math.random() < 0.2 && returnRoutes.length > 0;
  const routePool = useReturn ? returnRoutes : outboundRoutes;
  const route = routePool[Math.floor(Math.random() * routePool.length)];
  
  state.dispatchQueue.push({
    routeId: route.id,
    delay,
  });
};

const dispatchShipment = (state: AnimationState, routeId: string): void => {
  const route = state.routes.find(r => r.id === routeId);
  if (!route) return;
  
  const fromNode = state.nodes.get(route.fromId);
  if (!fromNode) return;
  
  // "Hub pulses slightly before routes activate"
  fromNode.pulseIntensity = 1;
  
  // Activate route glow
  route.activeGlow = 1;
  
  const isReturn = route.direction === 'return';
  const duration = randomRange(CONFIG.shipmentDuration.min, CONFIG.shipmentDuration.max);
  const speed = 1 / (duration / 16.67); // Normalized to 60fps
  
  state.shipments.push({
    id: state.shipmentCounter++,
    routeId,
    progress: 0,
    speed: isReturn ? speed * 0.6 : speed, // Return signals are slower
    color: isReturn ? CONFIG.colors.returnFlow : CONFIG.colors.outboundFlow,
    size: isReturn ? 3 : 4,
    trail: [],
  });
};

// ============================================================================
// UPDATE LOGIC
// ============================================================================

const updateDispatchQueue = (state: AnimationState, dt: number): void => {
  // Process dispatch queue
  for (let i = state.dispatchQueue.length - 1; i >= 0; i--) {
    state.dispatchQueue[i].delay -= dt * 16.67;
    if (state.dispatchQueue[i].delay <= 0) {
      dispatchShipment(state, state.dispatchQueue[i].routeId);
      state.dispatchQueue.splice(i, 1);
    }
  }
  
  // Ensure there's always something scheduled
  // "Never all routes active at once" - limit concurrent shipments
  if (state.dispatchQueue.length === 0 && state.shipments.length < 4) {
    scheduleNextDispatch(state);
  }
};

const updateShipments = (state: AnimationState, dt: number): void => {
  for (let i = state.shipments.length - 1; i >= 0; i--) {
    const shipment = state.shipments[i];
    const route = state.routes.find(r => r.id === shipment.routeId);
    if (!route) continue;
    
    const fromNode = state.nodes.get(route.fromId);
    const toNode = state.nodes.get(route.toId);
    if (!fromNode || !toNode) continue;
    
    // Calculate position with easing
    const easedProgress = shipmentEase(shipment.progress);
    const pos = quadraticBezier(
      fromNode,
      route.controlPoint,
      toNode,
      easedProgress
    );
    
    // Update trail
    shipment.trail.unshift({ x: pos.x, y: pos.y });
    if (shipment.trail.length > CONFIG.trailLength) {
      shipment.trail.pop();
    }
    
    // Advance progress
    shipment.progress += shipment.speed * dt;
    
    // Delivery complete
    if (shipment.progress >= 1) {
      // "Endpoint node pulses on delivery"
      toNode.pulseIntensity = 1;
      state.shipments.splice(i, 1);
    }
  }
};

const updateNodes = (state: AnimationState, dt: number): void => {
  state.nodes.forEach(node => {
    // Decay pulse intensity
    if (node.pulseIntensity > 0) {
      node.pulseIntensity = Math.max(0, node.pulseIntensity - node.pulseDecay * dt);
    }
    
    // Subtle ambient breathing for control node only
    if (node.role === 'control') {
      const breathe = Math.sin(state.time * 0.001) * 0.1;
      node.pulseIntensity = Math.max(node.pulseIntensity, 0.1 + breathe);
    }
  });
};

const updateRoutes = (state: AnimationState, dt: number): void => {
  state.routes.forEach(route => {
    // "Routes glow briefly after use, then fade"
    if (route.activeGlow > 0) {
      route.activeGlow = Math.max(0, route.activeGlow - route.glowDecay * dt);
    }
  });
};

// ============================================================================
// RENDERING
// ============================================================================

const renderRoutes = (ctx: CanvasRenderingContext2D, state: AnimationState): void => {
  // Draw routes as persistent shipping lanes
  state.routes.forEach(route => {
    const fromNode = state.nodes.get(route.fromId);
    const toNode = state.nodes.get(route.toId);
    if (!fromNode || !toNode) return;
    
    const isReturn = route.direction === 'return';
    
    // Base route - "Shipping lanes, not neural pathways" - always visible
    const baseAlpha = lerp(
      CONFIG.opacity.routeInactive,
      CONFIG.opacity.routeActive,
      route.activeGlow * 0.5
    );
    
    ctx.strokeStyle = hexToRgba(CONFIG.colors.routeIdle, baseAlpha);
    ctx.lineWidth = isReturn ? 1 : 1.5;
    ctx.lineCap = 'round';
    ctx.setLineDash(isReturn ? [4, 6] : []); // Return routes are dashed
    ctx.beginPath();
    ctx.moveTo(fromNode.x, fromNode.y);
    ctx.quadraticCurveTo(
      route.controlPoint.x,
      route.controlPoint.y,
      toNode.x,
      toNode.y
    );
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Active glow overlay - "Routes glow briefly after use, then fade"
    if (route.activeGlow > 0.05) {
      const glowColor = isReturn 
        ? CONFIG.colors.returnFlow 
        : CONFIG.colors.routeActive;
      
      // Brighter inner line
      ctx.strokeStyle = hexToRgba(glowColor, route.activeGlow * 0.5);
      ctx.lineWidth = isReturn ? 1.5 : 2;
      ctx.beginPath();
      ctx.moveTo(fromNode.x, fromNode.y);
      ctx.quadraticCurveTo(
        route.controlPoint.x,
        route.controlPoint.y,
        toNode.x,
        toNode.y
      );
      ctx.stroke();
      
      // Subtle outer glow for active routes
      if (route.activeGlow > 0.3) {
        ctx.strokeStyle = hexToRgba(glowColor, route.activeGlow * 0.15);
        ctx.lineWidth = isReturn ? 4 : 5;
        ctx.beginPath();
        ctx.moveTo(fromNode.x, fromNode.y);
        ctx.quadraticCurveTo(
          route.controlPoint.x,
          route.controlPoint.y,
          toNode.x,
          toNode.y
        );
        ctx.stroke();
      }
    }
  });
};

const renderShipments = (ctx: CanvasRenderingContext2D, state: AnimationState): void => {
  state.shipments.forEach(shipment => {
    const route = state.routes.find(r => r.id === shipment.routeId);
    if (!route) return;
    
    const fromNode = state.nodes.get(route.fromId);
    const toNode = state.nodes.get(route.toId);
    if (!fromNode || !toNode) return;
    
    const isReturn = route.direction === 'return';
    
    // Current position with easing
    const easedProgress = shipmentEase(shipment.progress);
    const pos = quadraticBezier(fromNode, route.controlPoint, toNode, easedProgress);
    
    // Draw trail - "Spawn on route activation, fade at delivery"
    if (shipment.trail.length > 1) {
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      shipment.trail.forEach((point) => {
        ctx.lineTo(point.x, point.y);
      });
      
      const trailGradient = ctx.createLinearGradient(
        pos.x, pos.y,
        shipment.trail[shipment.trail.length - 1].x,
        shipment.trail[shipment.trail.length - 1].y
      );
      trailGradient.addColorStop(0, hexToRgba(shipment.color, CONFIG.opacity.shipmentTrail));
      trailGradient.addColorStop(1, hexToRgba(shipment.color, 0));
      
      ctx.strokeStyle = trailGradient;
      ctx.lineWidth = shipment.size * 0.7;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    
    // Draw shipment - "Small, purposeful, one direction only"
    // Tight glow - not excessive
    const glowGradient = ctx.createRadialGradient(
      pos.x, pos.y, 0,
      pos.x, pos.y, shipment.size * 2.5
    );
    glowGradient.addColorStop(0, hexToRgba(shipment.color, 0.5));
    glowGradient.addColorStop(0.5, hexToRgba(shipment.color, 0.15));
    glowGradient.addColorStop(1, hexToRgba(shipment.color, 0));
    
    ctx.fillStyle = glowGradient;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, shipment.size * 2.5, 0, Math.PI * 2);
    ctx.fill();
    
    // Sharp core
    const coreGradient = ctx.createRadialGradient(
      pos.x - shipment.size * 0.2,
      pos.y - shipment.size * 0.2,
      0,
      pos.x, pos.y, shipment.size
    );
    coreGradient.addColorStop(0, isReturn ? '#fef3c7' : '#d1fae5');
    coreGradient.addColorStop(0.4, shipment.color);
    coreGradient.addColorStop(1, hexToRgba(shipment.color, 0.9));
    
    ctx.fillStyle = coreGradient;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, shipment.size, 0, Math.PI * 2);
    ctx.fill();
    
    // Tiny specular
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.beginPath();
    ctx.arc(pos.x - shipment.size * 0.25, pos.y - shipment.size * 0.25, shipment.size * 0.3, 0, Math.PI * 2);
    ctx.fill();
  });
};

const renderNodes = (ctx: CanvasRenderingContext2D, state: AnimationState): void => {
  // Render in order: endpoints, distribution, control (for proper layering)
  const nodesByRole: Node[][] = [[], [], []];
  state.nodes.forEach(node => {
    const order = node.role === 'endpoint' ? 0 : node.role === 'distribution' ? 1 : 2;
    nodesByRole[order].push(node);
  });
  
  nodesByRole.flat().forEach(node => {
    // Subtle pulse scale - "Never flash aggressively"
    const pulseScale = 1 + node.pulseIntensity * 0.15;
    const glowIntensity = CONFIG.opacity.nodeGlowIdle + node.pulseIntensity * (CONFIG.opacity.nodeGlowActive - CONFIG.opacity.nodeGlowIdle);
    
    // Tight outer glow - only when active, not blurry
    if (node.pulseIntensity > 0.05) {
      const outerGlow = ctx.createRadialGradient(
        node.x, node.y, node.radius * 0.8,
        node.x, node.y, node.radius * 2.2
      );
      outerGlow.addColorStop(0, hexToRgba(node.glowColor, glowIntensity * 0.6));
      outerGlow.addColorStop(0.6, hexToRgba(node.glowColor, glowIntensity * 0.2));
      outerGlow.addColorStop(1, hexToRgba(node.glowColor, 0));
      
      ctx.fillStyle = outerGlow;
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius * 2.2 * pulseScale, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Subtle ambient glow ring - always present but minimal
    const ambientGlow = ctx.createRadialGradient(
      node.x, node.y, node.radius * 0.9,
      node.x, node.y, node.radius * 1.6
    );
    ambientGlow.addColorStop(0, hexToRgba(node.color, 0.15));
    ambientGlow.addColorStop(1, hexToRgba(node.color, 0));
    
    ctx.fillStyle = ambientGlow;
    ctx.beginPath();
    ctx.arc(node.x, node.y, node.radius * 1.6, 0, Math.PI * 2);
    ctx.fill();
    
    // Sharp node core with subtle gradient
    const coreGradient = ctx.createRadialGradient(
      node.x - node.radius * 0.25,
      node.y - node.radius * 0.25,
      0,
      node.x, node.y, node.radius
    );
    
    // Different treatment for control vs other nodes
    if (node.role === 'control') {
      coreGradient.addColorStop(0, '#fef3c7');  // Warm highlight
      coreGradient.addColorStop(0.3, node.color);
      coreGradient.addColorStop(0.8, '#d97706');
      coreGradient.addColorStop(1, '#b45309');
    } else {
      coreGradient.addColorStop(0, '#d1fae5');  // Green highlight
      coreGradient.addColorStop(0.35, node.color);
      coreGradient.addColorStop(1, hexToRgba(node.color, 0.9));
    }
    
    ctx.fillStyle = coreGradient;
    ctx.beginPath();
    ctx.arc(node.x, node.y, node.radius * pulseScale, 0, Math.PI * 2);
    ctx.fill();
    
    // Crisp edge ring for definition
    ctx.strokeStyle = hexToRgba(node.color, 0.4);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(node.x, node.y, node.radius * pulseScale, 0, Math.PI * 2);
    ctx.stroke();
    
    // Small specular highlight - glass-like
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.beginPath();
    ctx.ellipse(
      node.x - node.radius * 0.3,
      node.y - node.radius * 0.3,
      node.radius * 0.25,
      node.radius * 0.15,
      -Math.PI / 4,
      0, Math.PI * 2
    );
    ctx.fill();
  });
};

const renderVignette = (ctx: CanvasRenderingContext2D, state: AnimationState): void => {
  // Very subtle edge vignette - "Never brighter than CTAs"
  const gradient = ctx.createRadialGradient(
    state.width * 0.5, state.height * 0.5, state.width * 0.3,
    state.width * 0.5, state.height * 0.5, Math.max(state.width, state.height) * 0.7
  );
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
  gradient.addColorStop(0.8, 'rgba(0, 0, 0, 0)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0.25)');
  
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, state.width, state.height);
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function SoyaFlowDistributionMap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<AnimationState | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

  const initializeState = useCallback((width: number, height: number): AnimationState => {
    const { nodes, routes } = createTopology(width, height);
    
    const state: AnimationState = {
      nodes,
      routes,
      shipments: [],
      dispatchQueue: [],
      time: 0,
      width,
      height,
      shipmentCounter: 0,
    };
    
    // Initial dispatch to start things moving
    scheduleNextDispatch(state);
    scheduleNextDispatch(state);
    
    return state;
  }, []);

  const handleResize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const parent = canvas.parentElement;
    if (!parent) return;
    
    const { clientWidth: width, clientHeight: height } = parent;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.scale(dpr, dpr);
    
    // Reinitialize on significant resize
    if (!stateRef.current || 
        Math.abs(stateRef.current.width - width) > 100 ||
        Math.abs(stateRef.current.height - height) > 100) {
      stateRef.current = initializeState(width, height);
    } else {
      stateRef.current.width = width;
      stateRef.current.height = height;
    }
  }, [initializeState]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    handleResize();
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    window.addEventListener('resize', handleResize);
    
    const animate = (timestamp: number) => {
      if (!stateRef.current) return;
      
      const dt = Math.min((timestamp - lastTimeRef.current) / 16.67, 3);
      lastTimeRef.current = timestamp;
      stateRef.current.time = timestamp;
      
      const state = stateRef.current;
      const { width, height } = state;
      
      // Clear canvas completely - sharp rendering, no motion blur
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);
      
      // Update
      updateDispatchQueue(state, dt);
      updateShipments(state, dt);
      updateNodes(state, dt);
      updateRoutes(state, dt);
      
      // Render (order matters for layering)
      renderVignette(ctx, state);
      renderRoutes(ctx, state);
      renderShipments(ctx, state);
      renderNodes(ctx, state);
      
      rafRef.current = requestAnimationFrame(animate);
    };
    
    rafRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', handleResize);
    };
  }, [handleResize]);

  return (
    <div className="relative w-full h-full min-h-[400px] bg-black overflow-hidden">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ display: 'block' }}
      />
      
      {/* Depth overlay - supports hero text */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(to right, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.2) 30%, transparent 50%)',
        }}
      />
    </div>
  );
}

export default SoyaFlowDistributionMap;
