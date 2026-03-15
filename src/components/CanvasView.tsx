import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Session } from '../types';
import { SessionWindow } from './SessionWindow';
import { ZoomIn, ZoomOut, Maximize, Hand, MousePointer2, Send, Map } from 'lucide-react';
import { SESSION_WIDTH, SESSION_DEFAULT_HEIGHT, SESSION_MIN_HEIGHT } from '@/constants';

export function CanvasView({
  sessions,
  setSessions,
  focusedSessionId,
  projectDir,
  transform,
  onTransformChange,
  onCanvasResize,
}: {
  sessions: Session[],
  setSessions: any,
  focusedSessionId?: string | null,
  projectDir?: string | null,
  transform: { x: number; y: number; scale: number },
  onTransformChange: React.Dispatch<React.SetStateAction<{ x: number; y: number; scale: number }>>,
  onCanvasResize?: (width: number) => void,
}) {
  const setTransform = onTransformChange;
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const [lastPos, setLastPos] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Tool and Selection State
  const [toolMode, setToolMode] = useState<'hand' | 'select'>('select');
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([]);
  const [selectionBox, setSelectionBox] = useState<{ startX: number, startY: number, currentX: number, currentY: number } | null>(null);
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [showMinimap, setShowMinimap] = useState(true);

  useEffect(() => {
    if (!containerRef.current || !onCanvasResize) return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        onCanvasResize(entry.contentRect.width);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [onCanvasResize]);

  // Refs for group drag (avoid stale closures)
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const selectedIdsRef = useRef(selectedSessionIds);
  selectedIdsRef.current = selectedSessionIds;
  const groupDragInitialPositionsRef = useRef<Record<string, { x: number; y: number }>>({});

  const handleGroupDragStart = useCallback(() => {
    const positions: Record<string, { x: number; y: number }> = {};
    for (const s of sessionsRef.current) {
      if (selectedIdsRef.current.includes(s.id)) {
        positions[s.id] = { x: s.position.x, y: s.position.y };
      }
    }
    groupDragInitialPositionsRef.current = positions;
  }, []);

  const handleGroupDragMove = useCallback((deltaX: number, deltaY: number) => {
    const initials = groupDragInitialPositionsRef.current;
    if (Object.keys(initials).length === 0) return;
    setSessions((prev: Session[]) => prev.map(s => {
      const init = initials[s.id];
      if (init) {
        return { ...s, position: { x: init.x + deltaX, y: init.y + deltaY } };
      }
      return s;
    }));
  }, [setSessions]);

  // Handle focusing on a specific session
  useEffect(() => {
    if (focusedSessionId && containerRef.current) {
      const session = sessions.find(s => s.id === focusedSessionId);
      if (session) {
        const container = containerRef.current.getBoundingClientRect();
        const sessionWidth = SESSION_WIDTH;
        const sessionHeight = session.height ?? SESSION_DEFAULT_HEIGHT;
        
        // Calculate new transform to center the session
        const newScale = 1; // Reset scale to 1 for better visibility
        const newX = (container.width / 2) - (session.position.x * newScale) - (sessionWidth / 2);
        const newY = (container.height / 2) - (session.position.y * newScale) - (sessionHeight / 2);
        
        setTransform({ x: newX, y: newY, scale: newScale });
      }
    }
  }, [focusedSessionId, sessions]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleNativeWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement;
      const isInsideSession = target.closest('.session-container');

      if (e.ctrlKey || e.metaKey) {
        if (isInsideSession) return;
        e.preventDefault();
        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
        setTransform(prev => {
          const newScale = Math.max(0.1, Math.min(prev.scale * zoomFactor, 3));
          const rect = container.getBoundingClientRect();
          const mouseX = e.clientX - rect.left;
          const mouseY = e.clientY - rect.top;

          const newX = mouseX - (mouseX - prev.x) * (newScale / prev.scale);
          const newY = mouseY - (mouseY - prev.y) * (newScale / prev.scale);

          return { x: newX, y: newY, scale: newScale };
        });
      } else {
        if (isInsideSession) return;
        e.preventDefault();
        setTransform(prev => ({
          ...prev,
          x: prev.x - e.deltaX,
          y: prev.y - e.deltaY
        }));
      }
    };

    container.addEventListener('wheel', handleNativeWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleNativeWheel);
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('.session-container') || target.closest('.ui-overlay')) {
      return;
    }

    (document.activeElement as HTMLElement)?.blur();

    if (toolMode === 'hand') {
      e.preventDefault();
      setIsDraggingCanvas(true);
      setLastPos({ x: e.clientX, y: e.clientY });
    } else if (toolMode === 'select') {
      e.preventDefault();
      const rect = containerRef.current!.getBoundingClientRect();
      const x = (e.clientX - rect.left - transform.x) / transform.scale;
      const y = (e.clientY - rect.top - transform.y) / transform.scale;
      setSelectionBox({ startX: x, startY: y, currentX: x, currentY: y });
      if (!e.shiftKey && !e.metaKey && !e.ctrlKey) {
        setSelectedSessionIds([]);
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (toolMode === 'hand' && isDraggingCanvas) {
      const dx = e.clientX - lastPos.x;
      const dy = e.clientY - lastPos.y;
      setTransform(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
      setLastPos({ x: e.clientX, y: e.clientY });
    } else if (toolMode === 'select' && selectionBox) {
      const rect = containerRef.current!.getBoundingClientRect();
      const x = (e.clientX - rect.left - transform.x) / transform.scale;
      const y = (e.clientY - rect.top - transform.y) / transform.scale;
      
      setSelectionBox(prev => ({ ...prev!, currentX: x, currentY: y }));
      
      const minX = Math.min(selectionBox.startX, x);
      const maxX = Math.max(selectionBox.startX, x);
      const minY = Math.min(selectionBox.startY, y);
      const maxY = Math.max(selectionBox.startY, y);
      
      const newSelectedIds = sessions.filter(session => {
        const sessionWidth = SESSION_WIDTH;
        const sessionHeight = session.height ?? SESSION_DEFAULT_HEIGHT;
        const sMinX = session.position.x;
        const sMaxX = session.position.x + sessionWidth;
        const sMinY = session.position.y;
        const sMaxY = session.position.y + sessionHeight;
        
        return sMinX < maxX && sMaxX > minX && sMinY < maxY && sMaxY > minY;
      }).map(s => s.id);
      
      setSelectedSessionIds(newSelectedIds);
    }
  };

  const handleMouseUp = () => {
    if (toolMode === 'hand') {
      setIsDraggingCanvas(false);
    } else if (toolMode === 'select') {
      setSelectionBox(null);
    }
  };

  const handleZoomIn = () => setTransform(p => ({ ...p, scale: Math.min(p.scale * 1.2, 3) }));
  const handleZoomOut = () => setTransform(p => ({ ...p, scale: Math.max(p.scale / 1.2, 0.1) }));
  const handleResetZoom = () => setTransform({ x: 0, y: 0, scale: 1 });

  const handleBroadcast = () => {
    if (!broadcastMessage.trim() || selectedSessionIds.length < 2) return;
    
    setSessions((prev: Session[]) => prev.map(session => {
      if (selectedSessionIds.includes(session.id)) {
        return {
          ...session,
          messages: [
            ...session.messages,
            {
              id: Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9),
              role: 'user',
              content: broadcastMessage,
              type: 'text',
              timestamp: Date.now()
            }
          ]
        };
      }
      return session;
    }));
    
    setBroadcastMessage('');
    setSelectedSessionIds([]);
  };

  return (
    <div 
      ref={containerRef}
      className={`w-full h-full overflow-hidden relative canvas-bg ${toolMode === 'hand' ? (isDraggingCanvas ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-crosshair'}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div 
        className="absolute top-0 left-0 w-full h-full transition-transform duration-300 ease-out"
        style={{ 
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          transformOrigin: '0 0',
        }}
      >
        {sessions.map(session => (
          <DraggableSession
            key={session.id}
            session={session}
            transformScale={transform.scale}
            isFocused={focusedSessionId === session.id}
            isSelected={selectedSessionIds.includes(session.id)}
            toolMode={toolMode}
            isGroupDrag={selectedSessionIds.includes(session.id) && selectedSessionIds.length > 1}
            onGroupDragStart={handleGroupDragStart}
            onGroupDragMove={handleGroupDragMove}
            onSelect={(multi) => {
              if (toolMode === 'select') {
                if (multi) {
                  setSelectedSessionIds(prev => prev.includes(session.id) ? prev.filter(id => id !== session.id) : [...prev, session.id]);
                } else {
                  setSelectedSessionIds([session.id]);
                }
              }
            }}
            updateSession={(updated) => {
              setSessions((prev: Session[]) => prev.map(s => s.id === updated.id ? updated : s));
            }}
            onDelete={() => setSessions((prev: Session[]) => prev.filter(s => s.id !== session.id))}
            projectDir={projectDir}
          />
        ))}

        {/* Selection Box */}
        {selectionBox && (
          <div 
            className="absolute border border-blue-400 bg-blue-500/20 pointer-events-none z-40"
            style={{
              left: Math.min(selectionBox.startX, selectionBox.currentX),
              top: Math.min(selectionBox.startY, selectionBox.currentY),
              width: Math.abs(selectionBox.currentX - selectionBox.startX),
              height: Math.abs(selectionBox.currentY - selectionBox.startY),
            }}
          />
        )}
      </div>

      {/* Tools */}
      <div 
        className="absolute top-6 left-6 flex flex-col gap-2 bg-black/40 backdrop-blur-md p-1.5 rounded-xl border border-white/10 z-50 ui-overlay"
        onMouseDown={e => e.stopPropagation()}
      >
        <button
          onClick={() => setToolMode('select')}
          className={`p-2 rounded-lg transition-colors ${toolMode === 'select' ? 'bg-blue-500/50 text-white' : 'text-gray-400 hover:bg-white/10 hover:text-gray-200'}`}
          title="Select Tool"
        >
          <MousePointer2 size={20} />
        </button>
        <button
          onClick={() => setToolMode('hand')}
          className={`p-2 rounded-lg transition-colors ${toolMode === 'hand' ? 'bg-blue-500/50 text-white' : 'text-gray-400 hover:bg-white/10 hover:text-gray-200'}`}
          title="Pan Tool"
        >
          <Hand size={20} />
        </button>
      </div>

      {/* Broadcast Input Box */}
      <div
        className={`absolute bottom-6 left-1/2 -translate-x-1/2 w-[600px] bg-[#3B3F4F]/95 backdrop-blur-2xl border border-white/20 rounded-2xl shadow-2xl p-4 z-50 flex flex-col gap-3 transition-all duration-300 ease-out ui-overlay ${
          selectedSessionIds.length >= 2
            ? 'opacity-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 translate-y-8 pointer-events-none'
        }`}
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center px-1">
          <span className="text-sm font-medium text-blue-400">
            Broadcasting to {selectedSessionIds.length} sessions
          </span>
          <button onClick={() => setSelectedSessionIds([])} className="text-xs text-gray-400 hover:text-white">Cancel</button>
        </div>
        <div className="relative">
          <textarea
            value={broadcastMessage}
            onChange={(e) => setBroadcastMessage(e.target.value)}
            placeholder="Message selected sessions..."
            className="w-full bg-black/20 border border-white/10 rounded-xl pl-4 pr-12 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
            rows={3}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleBroadcast();
              }
            }}
          />
          <button 
            onClick={handleBroadcast}
            disabled={!broadcastMessage.trim() || selectedSessionIds.length < 2}
            className="absolute right-3 bottom-3 p-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-colors"
          >
            <Send size={16} />
          </button>
        </div>
      </div>

      {/* Minimap */}
      {showMinimap && sessions.length > 0 && (
        <CanvasMinimap
          sessions={sessions}
          transform={transform}
          containerRef={containerRef}
          onNavigate={setTransform}
        />
      )}

      {/* Zoom Controls */}
      <div
        className="absolute bottom-6 right-6 flex items-center gap-2 bg-black/40 backdrop-blur-md p-2 rounded-xl border border-white/10 z-50 cursor-default ui-overlay"
        onMouseDown={e => e.stopPropagation()}
      >
        <button onClick={handleZoomIn} className="p-1.5 hover:bg-white/10 rounded-lg text-gray-300 transition-colors" title="Zoom In">
          <ZoomIn size={18} />
        </button>
        <span className="text-xs font-mono text-gray-400 w-12 text-center select-none">
          {Math.round(transform.scale * 100)}%
        </span>
        <button onClick={handleZoomOut} className="p-1.5 hover:bg-white/10 rounded-lg text-gray-300 transition-colors" title="Zoom Out">
          <ZoomOut size={18} />
        </button>
        <div className="w-px h-4 bg-white/10 mx-1" />
        <button onClick={handleResetZoom} className="p-1.5 hover:bg-white/10 rounded-lg text-gray-300 transition-colors" title="Reset View">
          <Maximize size={18} />
        </button>
        <div className="w-px h-4 bg-white/10 mx-1" />
        <button
          onClick={() => setShowMinimap(v => !v)}
          className={`p-1.5 rounded-lg transition-colors ${showMinimap ? 'bg-blue-500/30 text-blue-300' : 'text-gray-300 hover:bg-white/10'}`}
          title="Toggle Minimap"
        >
          <Map size={18} />
        </button>
      </div>
    </div>
  );
}

// --- Minimap ---

const MINIMAP_WIDTH = 200;
const MINIMAP_HEIGHT = 140;
const MINIMAP_PADDING = 60;
const NAVIGATION_MARGIN = 300;

const MODEL_COLORS: Record<string, string> = {
  claude: '#a78bfa',
  codex: '#34d399',
  gemini: '#60a5fa',
};

function CanvasMinimap({
  sessions,
  transform,
  containerRef,
  onNavigate,
}: {
  sessions: Session[];
  transform: { x: number; y: number; scale: number };
  containerRef: React.RefObject<HTMLDivElement | null>;
  onNavigate: React.Dispatch<React.SetStateAction<{ x: number; y: number; scale: number }>>;
}) {
  const minimapRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const transformRef = useRef(transform);
  transformRef.current = transform;

  // Compute content bounds (bounding box of all sessions)
  const contentBounds = useMemo(() => {
    if (sessions.length === 0) return { minX: 0, minY: 0, maxX: 1000, maxY: 800 };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const s of sessions) {
      minX = Math.min(minX, s.position.x);
      minY = Math.min(minY, s.position.y);
      maxX = Math.max(maxX, s.position.x + SESSION_WIDTH);
      maxY = Math.max(maxY, s.position.y + (s.height ?? SESSION_DEFAULT_HEIGHT));
    }
    return {
      minX: minX - MINIMAP_PADDING,
      minY: minY - MINIMAP_PADDING,
      maxX: maxX + MINIMAP_PADDING,
      maxY: maxY + MINIMAP_PADDING,
    };
  }, [sessions]);

  const worldW = contentBounds.maxX - contentBounds.minX;
  const worldH = contentBounds.maxY - contentBounds.minY;

  // Fit into minimap keeping aspect ratio
  const minimapScale = Math.min(MINIMAP_WIDTH / worldW, MINIMAP_HEIGHT / worldH);
  const drawW = worldW * minimapScale;
  const drawH = worldH * minimapScale;

  // Map canvas coords to minimap coords
  const toMinimap = useCallback(
    (cx: number, cy: number) => ({
      x: (cx - contentBounds.minX) * minimapScale,
      y: (cy - contentBounds.minY) * minimapScale,
    }),
    [contentBounds, minimapScale]
  );

  // Viewport rect in minimap
  const viewportRect = useMemo(() => {
    const container = containerRef.current;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    const vpLeft = -transform.x / transform.scale;
    const vpTop = -transform.y / transform.scale;
    const vpW = rect.width / transform.scale;
    const vpH = rect.height / transform.scale;
    const tl = toMinimap(vpLeft, vpTop);
    return {
      x: tl.x,
      y: tl.y,
      width: vpW * minimapScale,
      height: vpH * minimapScale,
    };
  }, [transform, containerRef, toMinimap, minimapScale]);

  // Clamp canvas center point to content area + margin
  const clampCanvas = useCallback(
    (cx: number, cy: number) => ({
      x: Math.max(contentBounds.minX - NAVIGATION_MARGIN, Math.min(cx, contentBounds.maxX + NAVIGATION_MARGIN)),
      y: Math.max(contentBounds.minY - NAVIGATION_MARGIN, Math.min(cy, contentBounds.maxY + NAVIGATION_MARGIN)),
    }),
    [contentBounds]
  );

  // Navigate: center viewport on a canvas-space point (clamped)
  const navigateTo = useCallback(
    (canvasX: number, canvasY: number) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const clamped = clampCanvas(canvasX, canvasY);
      const scale = transformRef.current.scale;
      const newX = -(clamped.x * scale) + rect.width / 2;
      const newY = -(clamped.y * scale) + rect.height / 2;
      onNavigate({ x: newX, y: newY, scale });
    },
    [containerRef, clampCanvas, onNavigate]
  );

  // Click-to-jump: convert minimap pixel to canvas coords and navigate
  const handleMinimapClick = useCallback(
    (e: React.MouseEvent | MouseEvent) => {
      const el = minimapRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const offsetX = (MINIMAP_WIDTH - drawW) / 2;
      const offsetY = (MINIMAP_HEIGHT - drawH) / 2;
      const canvasX = (mx - offsetX) / minimapScale + contentBounds.minX;
      const canvasY = (my - offsetY) / minimapScale + contentBounds.minY;
      navigateTo(canvasX, canvasY);
    },
    [navigateTo, drawW, drawH, minimapScale, contentBounds]
  );

  // Drag handling — incremental delta mode
  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      const prev = dragStartRef.current;
      if (!prev) {
        dragStartRef.current = { x: e.clientX, y: e.clientY };
        return;
      }
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      dragStartRef.current = { x: e.clientX, y: e.clientY };

      // Convert minimap pixel delta to canvas-space delta
      const canvasDx = dx / minimapScale;
      const canvasDy = dy / minimapScale;

      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const t = transformRef.current;

      // Current viewport center in canvas space
      const centerX = (-t.x + rect.width / 2) / t.scale;
      const centerY = (-t.y + rect.height / 2) / t.scale;

      navigateTo(centerX + canvasDx, centerY + canvasDy);
    };
    const onUp = () => {
      setIsDragging(false);
      dragStartRef.current = null;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isDragging, minimapScale, containerRef, navigateTo]);

  const offsetX = (MINIMAP_WIDTH - drawW) / 2;
  const offsetY = (MINIMAP_HEIGHT - drawH) / 2;

  return (
    <div
      ref={minimapRef}
      className="absolute bottom-16 right-6 z-50 ui-overlay rounded-xl overflow-hidden border border-white/10 bg-black/50 backdrop-blur-md cursor-crosshair select-none"
      style={{ width: MINIMAP_WIDTH, height: MINIMAP_HEIGHT }}
      onMouseDown={(e) => {
        e.stopPropagation();
        setIsDragging(true);
        dragStartRef.current = { x: e.clientX, y: e.clientY };
        handleMinimapClick(e);
      }}
    >
      {/* Session rectangles */}
      <svg
        width={MINIMAP_WIDTH}
        height={MINIMAP_HEIGHT}
        className="absolute inset-0"
      >
        <g transform={`translate(${offsetX}, ${offsetY})`}>
          {sessions.map((s) => {
            const pos = toMinimap(s.position.x, s.position.y);
            const w = SESSION_WIDTH * minimapScale;
            const h = (s.height ?? SESSION_DEFAULT_HEIGHT) * minimapScale;
            const color = MODEL_COLORS[s.model] || '#94a3b8';
            return (
              <rect
                key={s.id}
                x={pos.x}
                y={pos.y}
                width={w}
                height={h}
                rx={2}
                fill={color}
                fillOpacity={0.5}
                stroke={color}
                strokeOpacity={0.8}
                strokeWidth={1}
              />
            );
          })}
          {/* Viewport indicator */}
          {viewportRect && (
            <rect
              x={viewportRect.x}
              y={viewportRect.y}
              width={viewportRect.width}
              height={viewportRect.height}
              rx={2}
              fill="white"
              fillOpacity={0.08}
              stroke="white"
              strokeOpacity={0.6}
              strokeWidth={1.5}
            />
          )}
        </g>
      </svg>
    </div>
  );
}

function DraggableSession({
  session,
  transformScale,
  isFocused,
  isSelected,
  toolMode,
  isGroupDrag,
  onGroupDragStart,
  onGroupDragMove,
  onSelect,
  updateSession,
  onDelete,
  projectDir,
}: {
  session: Session,
  transformScale: number,
  isFocused?: boolean,
  isSelected?: boolean,
  toolMode: 'hand' | 'select',
  isGroupDrag: boolean,
  onGroupDragStart: () => void,
  onGroupDragMove: (dx: number, dy: number) => void,
  onSelect?: (multi: boolean) => void,
  updateSession: (s: Session) => void,
  onDelete: () => void,
  projectDir?: string | null,
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Group drag refs
  const dragStartPointRef = useRef({ x: 0, y: 0 });
  const isGroupDragActiveRef = useRef(false);

  // Resize state
  const [isResizing, setIsResizing] = useState(false);
  const [resizeStartY, setResizeStartY] = useState(0);
  const [resizeStartHeight, setResizeStartHeight] = useState(0);
  const [animateHeight, setAnimateHeight] = useState(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const isHeader = !!target.closest('.session-header');
    const isHandModeDrag = toolMode === 'hand' && !target.closest('button, input, textarea, a, select, [contenteditable], .msg-content');
    const canDrag = isHeader || isHandModeDrag;

    if (canDrag) {
      e.stopPropagation();
      // Don't reset selection when starting a group drag
      if (!isGroupDrag) {
        onSelect?.(e.shiftKey || e.metaKey || e.ctrlKey);
      }
      setIsDragging(true);

      if (isGroupDrag) {
        onGroupDragStart();
        dragStartPointRef.current = {
          x: e.clientX / transformScale,
          y: e.clientY / transformScale
        };
        isGroupDragActiveRef.current = true;
      } else {
        setDragOffset({
          x: e.clientX / transformScale - session.position.x,
          y: e.clientY / transformScale - session.position.y
        });
        isGroupDragActiveRef.current = false;
      }
    } else {
      onSelect?.(e.shiftKey || e.metaKey || e.ctrlKey);
    }
  };

  // Drag movement
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        if (isGroupDragActiveRef.current) {
          const deltaX = e.clientX / transformScale - dragStartPointRef.current.x;
          const deltaY = e.clientY / transformScale - dragStartPointRef.current.y;
          onGroupDragMove(deltaX, deltaY);
        } else {
          updateSession({
            ...session,
            position: {
              x: e.clientX / transformScale - dragOffset.x,
              y: e.clientY / transformScale - dragOffset.y
            }
          });
        }
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      isGroupDragActiveRef.current = false;
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset, session, updateSession, transformScale, onGroupDragMove]);

  // Resize handlers
  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsResizing(true);
    setResizeStartY(e.clientY / transformScale);
    setResizeStartHeight(session.height ?? SESSION_DEFAULT_HEIGHT);
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = e.clientY / transformScale - resizeStartY;
      const newHeight = Math.max(SESSION_MIN_HEIGHT, resizeStartHeight + deltaY);
      updateSession({ ...session, height: newHeight });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, resizeStartY, resizeStartHeight, session, updateSession, transformScale]);

  // Header double-click: toggle collapse/expand
  const handleHeaderDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    window.getSelection()?.removeAllRanges();
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input')) return;

    const currentHeight = session.height ?? SESSION_DEFAULT_HEIGHT;
    const fullHeight = session.prevHeight ?? SESSION_DEFAULT_HEIGHT;
    const halfHeight = Math.max(SESSION_MIN_HEIGHT, Math.round(fullHeight / 2));
    setAnimateHeight(true);
    if (session.prevHeight && currentHeight <= halfHeight + 10) {
      updateSession({ ...session, height: session.prevHeight, prevHeight: undefined });
    } else {
      updateSession({ ...session, height: halfHeight, prevHeight: currentHeight });
    }
    setTimeout(() => setAnimateHeight(false), 350);
  };

  const currentHeight = session.height ?? SESSION_DEFAULT_HEIGHT;

  return (
    <div
      className={`session-container absolute transition-shadow duration-300 ${isFocused ? 'ring-4 ring-blue-500/50 rounded-2xl shadow-2xl shadow-blue-500/20' : ''} ${isSelected ? 'ring-2 ring-blue-400 rounded-2xl shadow-lg shadow-blue-500/20' : ''} ${toolMode === 'hand' ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : ''}`}
      style={{ left: session.position.x, top: session.position.y }}
      onMouseDown={handleMouseDown}
    >
      <SessionWindow
        session={session}
        onUpdate={updateSession}
        onDelete={onDelete}
        height={currentHeight}
        animateHeight={animateHeight}
        onHeaderDoubleClick={handleHeaderDoubleClick}
        projectDir={projectDir}
      />
      {/* Resize handle */}
      <div
        className="absolute bottom-0 left-0 right-0 h-3 cursor-ns-resize group z-10"
        onMouseDown={handleResizeMouseDown}
      >
        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-12 h-1 rounded-full bg-white/0 group-hover:bg-white/30 transition-colors" />
      </div>
    </div>
  );
}
