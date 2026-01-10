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
  emoji: string; // Emoji representation of the node
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
  dispatchInterval: { min: 2200, max: 3200 },
  shipmentDuration: { min: 2000, max: 3000 },
  
  // Performance - "Cap active shipments to 1-2 at a time"
  maxActiveShipments: 2,
  
  // Visual hierarchy - "Animation always lower contrast than headline/CTAs"
  opacity: {
    routeInactive: 0.10,       // Subtle capacity lines
    routeActive: 0.28,         // Active but not bright
    shipmentTrail: 0.4,        // Visible but not dominant
  },
  
  // Glow by role - "Control strongest/slowest, hubs medium, endpoints weakest"
  glow: {
    control: { idle: 0.12, active: 0.35, decay: 0.008 },      // Strongest, slowest
    distribution: { idle: 0.08, active: 0.22, decay: 0.015 }, // Medium
    endpoint: { idle: 0.05, active: 0.15, decay: 0.025 },     // Weakest, fastest
  },
  
  // Node sizes by role
  nodeRadius: {
    control: 16,
    distribution: 10,
    endpoint: 6,
  },
  
  // Colors - "Green dominates movement, Yellow dominates decisions"
  colors: {
    // Yellow = decisions/optimization (control only)
    control: '#f59e0b',        // Amber - warm decision color
    controlGlow: '#d97706',    // Darker amber for glow
    // Green = feed movement (everything else)
    distribution: '#10b981',   // Emerald - hub color
    distributionGlow: '#047857',
    endpoint: '#34d399',       // Light emerald - destinations
    endpointGlow: '#059669',
    // Flow colors
    outboundFlow: '#10b981',   // Green - feed movement
    returnFlow: '#fbbf24',     // Yellow - tracking/feedback
    // Routes
    routeIdle: '#0f362d',      // Very muted green - capacity exists
    routeActive: '#047857',    // Active route
  },
  
  // Motion - "Eased acceleration/deceleration, dwell time at nodes"
  shipmentEasing: {
    accelerationZone: 0.15,    // First 15% - accelerating from stop
    cruiseZone: 0.70,          // Middle - constant velocity
    decelerationZone: 0.15,    // Last 15% - "slowing for unload"
  },
  
  // Trails - clean, not flashy
  trailLength: 6,
  
  // Pulse decay rates (lower = slower fade)
  pulseDecay: {
    control: 0.008,      // Slowest - commanding presence
    distribution: 0.015, // Medium
    endpoint: 0.025,     // Fastest - quick acknowledgment
  },
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
  // "Emits outbound routing pulses" - strongest glow, slowest decay
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
    pulseDecay: CONFIG.pulseDecay.control,
    label: 'HQ',
    emoji: '🏢', // Office building / HQ
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
      pulseDecay: CONFIG.pulseDecay.distribution,
      emoji: '🏭', // Factory / Warehouse / Distribution hub
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
      pulseDecay: CONFIG.pulseDecay.endpoint,
      emoji: '🏠', // Farm / Destination / Client
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
    
    // Outbound route: Hub → Endpoint
    routes.push({
      id: `${end.hub}-${end.id}`,
      fromId: end.hub,
      toId: end.id,
      direction: 'outbound',
      controlPoint: { x: midX + perpX, y: midY + perpY },
      activeGlow: 0,
      glowDecay: 0.012,
    });
    
    // Return route: Endpoint → Hub (for round trips)
    routes.push({
      id: `${end.id}-${end.hub}`,
      fromId: end.id,
      toId: end.hub,
      direction: 'return',
      controlPoint: { x: midX - perpX, y: midY - perpY },
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
      // Only dispatch if under the cap
      if (state.shipments.length < CONFIG.maxActiveShipments) {
        dispatchShipment(state, state.dispatchQueue[i].routeId);
      }
      state.dispatchQueue.splice(i, 1);
    }
  }
  
  // Ensure there's always something scheduled
  // "Cap active shipments to 1-2 at a time"
  if (state.dispatchQueue.length === 0 && state.shipments.length < CONFIG.maxActiveShipments) {
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
      
      // If truck delivered to an endpoint, automatically schedule return to hub
      if (toNode.role === 'endpoint' && fromNode.role === 'distribution') {
        // Find the return route (endpoint → hub)
        const returnRoute = state.routes.find(r => 
          r.fromId === toNode.id && 
          r.toId === fromNode.id && 
          r.direction === 'return'
        );
        
        if (returnRoute) {
          // Schedule immediate return trip (no delay)
          const returnDuration = randomRange(CONFIG.shipmentDuration.min, CONFIG.shipmentDuration.max);
          const returnSpeed = 1 / (returnDuration / 16.67);
          
          // Create return shipment
          state.shipments.push({
            id: state.shipmentCounter++,
            routeId: returnRoute.id,
            progress: 0,
            speed: returnSpeed * 0.8, // Slightly slower return
            color: CONFIG.colors.returnFlow,
            size: shipment.size,
            trail: [], // Start fresh trail
          });
          
          // Activate return route
          returnRoute.activeGlow = 1;
          toNode.pulseIntensity = 1; // Endpoint pulses before return
        }
      }
      
      // If truck returned to hub, it can immediately be dispatched to another endpoint
      if (toNode.role === 'distribution' && fromNode.role === 'endpoint') {
        // Hub pulses on truck return
        toNode.pulseIntensity = 1;
        
        // Find available outbound routes from this hub
        const availableRoutes = state.routes.filter(r => 
          r.fromId === toNode.id && 
          r.toId !== fromNode.id && // Don't go back to the same endpoint
          r.direction === 'outbound' &&
          r.toId.startsWith('end-') // Only to endpoints
        );
        
        // If there are available routes, schedule next delivery (with small delay)
        if (availableRoutes.length > 0 && state.shipments.length < CONFIG.maxActiveShipments) {
          const nextRoute = availableRoutes[Math.floor(Math.random() * availableRoutes.length)];
          const delay = randomRange(500, 1000); // Short delay before next dispatch
          
          state.dispatchQueue.push({
            routeId: nextRoute.id,
            delay,
          });
        }
      }
      
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
    
    // Check if this is a hub-to-endpoint route (distribution → endpoint) or return route (endpoint → distribution)
    const isHubToEndpoint = (fromNode.role === 'distribution' && toNode.role === 'endpoint' && !isReturn) ||
                            (fromNode.role === 'endpoint' && toNode.role === 'distribution' && isReturn);
    
    // Current position with easing
    const easedProgress = shipmentEase(shipment.progress);
    const pos = quadraticBezier(fromNode, route.controlPoint, toNode, easedProgress);
    
    // Calculate direction for truck rotation (only for hub-to-endpoint)
    // Look ahead slightly on the curve to get forward-facing direction
    let angle = 0;
    if (isHubToEndpoint) {
      // Look ahead by a small amount (5% of progress) to get forward direction
      const lookAheadProgress = Math.min(shipment.progress + 0.05, 1.0);
      const lookAheadEased = shipmentEase(lookAheadProgress);
      const nextPos = quadraticBezier(fromNode, route.controlPoint, toNode, lookAheadEased);
      
      // Calculate angle from current position to next position (forward direction)
      const dx = nextPos.x - pos.x;
      const dy = nextPos.y - pos.y;
      
      // Only calculate angle if there's meaningful movement
      if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
        angle = Math.atan2(dy, dx);
      } else if (shipment.trail.length > 0) {
        // Fallback: use trail if look-ahead is too close
        const prevPos = shipment.trail[0];
        const dx2 = pos.x - prevPos.x;
        const dy2 = pos.y - prevPos.y;
        if (Math.abs(dx2) > 0.1 || Math.abs(dy2) > 0.1) {
          angle = Math.atan2(dy2, dx2);
        }
      } else {
        // Final fallback: direction from start to destination
        const dx3 = toNode.x - fromNode.x;
        const dy3 = toNode.y - fromNode.y;
        angle = Math.atan2(dy3, dx3);
      }
    }
    
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
    
    if (isHubToEndpoint) {
      // Render truck emoji for hub-to-endpoint routes
      const truckSize = 20; // Size of truck emoji
      
      // Subtle glow behind truck
      const glowGradient = ctx.createRadialGradient(
        pos.x, pos.y, 0,
        pos.x, pos.y, truckSize * 1.5
      );
      glowGradient.addColorStop(0, hexToRgba(shipment.color, 0.3));
      glowGradient.addColorStop(0.5, hexToRgba(shipment.color, 0.1));
      glowGradient.addColorStop(1, hexToRgba(shipment.color, 0));
      
      ctx.fillStyle = glowGradient;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, truckSize * 1.5, 0, Math.PI * 2);
      ctx.fill();
      
      // Save context for rotation
      ctx.save();
      
      // Translate to truck position and rotate
      ctx.translate(pos.x, pos.y);
      ctx.rotate(angle);
      
      // Flip truck horizontally so it faces forward
      ctx.scale(-1, 1);
      
      // Render truck emoji
      ctx.font = `${truckSize}px Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      // Add subtle shadow for depth
      ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
      ctx.shadowBlur = 3;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 2;
      
      // Draw truck emoji (flipped horizontally)
      ctx.fillText('🚚', 0, 0);
      
      // Reset shadow
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      
      // Restore context
      ctx.restore();
    } else {
      // Draw circular shipment for other routes (control-to-hub, return routes)
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
    }
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
    // Get role-specific glow config - "Control strongest, hubs medium, endpoints weakest"
    const glowConfig = CONFIG.glow[node.role];
    const glowIntensity = glowConfig.idle + node.pulseIntensity * (glowConfig.active - glowConfig.idle);
    
    // Subtle pulse scale - "Never flash aggressively"
    const pulseScale = 1 + node.pulseIntensity * (node.role === 'control' ? 0.18 : 0.12);
    
    // Emoji size based on node role
    const emojiSize = node.role === 'control' ? 28 : node.role === 'distribution' ? 20 : 16;
    const scaledEmojiSize = emojiSize * pulseScale;
    
    // Outer glow - role-based intensity, only when active
    if (node.pulseIntensity > 0.05) {
      const glowRadius = node.role === 'control' ? 2.5 : node.role === 'distribution' ? 2.0 : 1.8;
      const outerGlow = ctx.createRadialGradient(
        node.x, node.y, node.radius * 0.8,
        node.x, node.y, node.radius * glowRadius
      );
      outerGlow.addColorStop(0, hexToRgba(node.glowColor, glowIntensity * 0.7));
      outerGlow.addColorStop(0.5, hexToRgba(node.glowColor, glowIntensity * 0.25));
      outerGlow.addColorStop(1, hexToRgba(node.glowColor, 0));
      
      ctx.fillStyle = outerGlow;
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius * glowRadius * pulseScale, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Ambient glow ring - role-based, "Black background absorbs excess light"
    const ambientOpacity = node.role === 'control' ? 0.12 : node.role === 'distribution' ? 0.08 : 0.05;
    const ambientGlow = ctx.createRadialGradient(
      node.x, node.y, node.radius * 0.9,
      node.x, node.y, node.radius * 1.5
    );
    ambientGlow.addColorStop(0, hexToRgba(node.color, ambientOpacity));
    ambientGlow.addColorStop(1, hexToRgba(node.color, 0));
    
    ctx.fillStyle = ambientGlow;
    ctx.beginPath();
    ctx.arc(node.x, node.y, node.radius * 1.5, 0, Math.PI * 2);
    ctx.fill();
    
    // Background circle for emoji (subtle, for contrast)
    const bgGradient = ctx.createRadialGradient(
      node.x - node.radius * 0.25,
      node.y - node.radius * 0.25,
      0,
      node.x, node.y, node.radius * pulseScale
    );
    
    // Different treatment for control vs other nodes
    if (node.role === 'control') {
      bgGradient.addColorStop(0, hexToRgba('#fef3c7', 0.3));  // Warm highlight
      bgGradient.addColorStop(0.5, hexToRgba(node.color, 0.2));
      bgGradient.addColorStop(1, hexToRgba(node.color, 0.1));
    } else {
      bgGradient.addColorStop(0, hexToRgba('#d1fae5', 0.25));  // Green highlight
      bgGradient.addColorStop(0.5, hexToRgba(node.color, 0.15));
      bgGradient.addColorStop(1, hexToRgba(node.color, 0.08));
    }
    
    ctx.fillStyle = bgGradient;
    ctx.beginPath();
    ctx.arc(node.x, node.y, node.radius * pulseScale * 1.2, 0, Math.PI * 2);
    ctx.fill();
    
    // Render emoji - centered on node position
    ctx.font = `${scaledEmojiSize}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Add subtle shadow for depth
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 2;
    
    // Draw emoji with slight scale pulse effect
    ctx.fillText(node.emoji, node.x, node.y);
    
    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    
    // Optional: subtle border ring for definition (lighter than before)
    if (node.pulseIntensity > 0.1) {
      ctx.strokeStyle = hexToRgba(node.color, 0.3);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius * pulseScale * 1.15, 0, Math.PI * 2);
      ctx.stroke();
    }
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
  const prefersReducedMotionRef = useRef<boolean>(false);

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
    
    // Initial dispatch to start things moving (unless reduced motion)
    if (!prefersReducedMotionRef.current) {
      scheduleNextDispatch(state);
    }
    
    return state;
  }, []);

  const handleResize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const parent = canvas.parentElement;
    if (!parent) return;
    
    const { clientWidth: width, clientHeight: height } = parent;
    // Cap DPR for performance on low-end devices
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
    
    // "Respect prefers-reduced-motion"
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    prefersReducedMotionRef.current = mediaQuery.matches;
    
    const handleMotionPreference = (e: MediaQueryListEvent) => {
      prefersReducedMotionRef.current = e.matches;
    };
    mediaQuery.addEventListener('change', handleMotionPreference);
    
    handleResize();
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    window.addEventListener('resize', handleResize);
    
    const animate = (timestamp: number) => {
      if (!stateRef.current) return;
      
      // "Keep frame time boringly stable"
      const dt = Math.min((timestamp - lastTimeRef.current) / 16.67, 2);
      lastTimeRef.current = timestamp;
      stateRef.current.time = timestamp;
      
      const state = stateRef.current;
      const { width, height } = state;
      
      // Clear canvas completely - sharp rendering, no motion blur
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);
      
      // Update (skip movement updates if reduced motion)
      if (!prefersReducedMotionRef.current) {
        updateDispatchQueue(state, dt);
        updateShipments(state, dt);
      }
      updateNodes(state, dt);
      updateRoutes(state, dt);
      
      // Render (order matters for layering)
      renderVignette(ctx, state);
      renderRoutes(ctx, state);
      if (!prefersReducedMotionRef.current) {
        renderShipments(ctx, state);
      }
      renderNodes(ctx, state);
      
      rafRef.current = requestAnimationFrame(animate);
    };
    
    rafRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', handleResize);
      mediaQuery.removeEventListener('change', handleMotionPreference);
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
