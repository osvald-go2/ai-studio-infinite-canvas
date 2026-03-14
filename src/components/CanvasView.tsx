import React, { useState, useEffect, useRef } from 'react';
import { Session } from '../types';
import { SessionWindow } from './SessionWindow';
import { ZoomIn, ZoomOut, Maximize, Hand, MousePointer2, Send } from 'lucide-react';

const SESSION_WIDTH = 600;
const SESSION_DEFAULT_HEIGHT = 700;
const SESSION_MIN_HEIGHT = 100;

export function CanvasView({ 
  sessions, 
  setSessions, 
  onOpenReview,
  focusedSessionId
}: { 
  sessions: Session[], 
  setSessions: any, 
  onOpenReview: (id: string) => void,
  focusedSessionId?: string | null
}) {
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const [lastPos, setLastPos] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Tool and Selection State
  const [toolMode, setToolMode] = useState<'hand' | 'select'>('hand');
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([]);
  const [selectionBox, setSelectionBox] = useState<{ startX: number, startY: number, currentX: number, currentY: number } | null>(null);
  const [broadcastMessage, setBroadcastMessage] = useState('');

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
      const isScrollable = (e.target as HTMLElement).closest('.custom-scrollbar') || (e.target as HTMLElement).closest('.overflow-y-auto');
      
      if (e.ctrlKey || e.metaKey) {
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
        if (isScrollable) return;
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
              type: 'text'
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
            onOpenReview={() => onOpenReview(session.id)}
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
          onClick={() => setToolMode('hand')} 
          className={`p-2 rounded-lg transition-colors ${toolMode === 'hand' ? 'bg-blue-500/50 text-white' : 'text-gray-400 hover:bg-white/10 hover:text-gray-200'}`}
          title="Pan Tool"
        >
          <Hand size={20} />
        </button>
        <button 
          onClick={() => setToolMode('select')} 
          className={`p-2 rounded-lg transition-colors ${toolMode === 'select' ? 'bg-blue-500/50 text-white' : 'text-gray-400 hover:bg-white/10 hover:text-gray-200'}`}
          title="Select Tool"
        >
          <MousePointer2 size={20} />
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
      </div>
    </div>
  );
}

function DraggableSession({
  session,
  transformScale,
  isFocused,
  isSelected,
  onSelect,
  updateSession,
  onOpenReview
}: {
  session: Session,
  transformScale: number,
  isFocused?: boolean,
  isSelected?: boolean,
  onSelect?: (multi: boolean) => void,
  updateSession: (s: Session) => void,
  onOpenReview: () => void
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Resize state
  const [isResizing, setIsResizing] = useState(false);
  const [resizeStartY, setResizeStartY] = useState(0);
  const [resizeStartHeight, setResizeStartHeight] = useState(0);
  const [animateHeight, setAnimateHeight] = useState(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('.session-header')) {
      e.stopPropagation();
      onSelect?.(e.shiftKey || e.metaKey || e.ctrlKey);
      setIsDragging(true);
      setDragOffset({
        x: e.clientX / transformScale - session.position.x,
        y: e.clientY / transformScale - session.position.y
      });
    } else {
      onSelect?.(e.shiftKey || e.metaKey || e.ctrlKey);
    }
  };

  // Drag movement
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        updateSession({
          ...session,
          position: {
            x: e.clientX / transformScale - dragOffset.x,
            y: e.clientY / transformScale - dragOffset.y
          }
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset, session, updateSession, transformScale]);

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
      className={`session-container absolute transition-shadow duration-300 ${isFocused ? 'ring-4 ring-blue-500/50 rounded-2xl shadow-2xl shadow-blue-500/20' : ''} ${isSelected ? 'ring-2 ring-blue-400 rounded-2xl shadow-lg shadow-blue-500/20' : ''}`}
      style={{ left: session.position.x, top: session.position.y }}
      onMouseDown={handleMouseDown}
    >
      <SessionWindow
        session={session}
        onUpdate={updateSession}
        onOpenReview={onOpenReview}
        height={currentHeight}
        animateHeight={animateHeight}
        onHeaderDoubleClick={handleHeaderDoubleClick}
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
